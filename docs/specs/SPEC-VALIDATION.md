# Spec: One Validation Pipeline, One Mnemonic Registry, Actionable Diagnostics

**Status:** Approved (pipeline scaffold) · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-EDITOR.md](SPEC-EDITOR.md) · [SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) §4.4 · [SPEC-I18N.md](SPEC-I18N.md) §5 · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) §4.6
**Fixes:** walkthrough findings 2 (panels disagree while typing), 3 (missed errors; tag catalogs disagree), and 5 (counts, line numbers, navigation)
**Authority:** *A Manual of Manuscript Transcription* (HSMS), `docs/HSMS-manual.md`. Section numbers below refer to it.

---

## 1. Goal

There is one validator and one result. Every screen shows the same diagnostics for the same text revision. Each diagnostic names the manual section it enforces, says where the problem is in the source file and on the page, and offers a fix when the fix is mechanical. The parser, the renderer, the linter, and the bundled samples all agree on which mnemonics exist.

### Non-goals

- Rewriting `parseHsMsText()` or the lexer. They are product core. This spec changes who calls the validators, not how text is parsed.
- Server-side validation. Everything here runs on-device (Tier 0 for line checks, Tier 0/1 for the structural pass; see §5.4).

---

## 2. Findings (observed 2026-10-20, commit `41b6637d`)

| # | Observation | Evidence |
|---|-------------|----------|
| V1 | **Two pipelines, two answers.** `EditorLinterBanner` calls `lintHsmsTranscription()` directly on the live buffer. `ValidationPanel` (inline and in `app/modal.tsx`) shows `parsed.validationErrors`, which come from compile: `parseHsMsText()` → `enrichParsedManuscript()` → `validateTranscription()` → `lintHsmsTranscription()` + `mergeValidationErrors()`. | Code graph call edges. In the UI, after I added `{ZZZ. test}` on line 1, the banner showed "0 errors · 2 warnings (L1, L20)" while the panel showed "0 errors · 1 warning (L19)". |
| V2 | **Structural pass waits for blur.** "Parsing manuscript structure…" stayed visible for over 14 s while the editor had focus. It cleared, and the panel updated, only after clicking outside the editor or switching to Page view. | Walkthrough. The debounce/commit path in `TranscriptionConniptionScreen` / `ScriptoriumContext` has to be traced. HSMS-EDITOR.md §4.2 documents the compile timing. |
| V3 | **Missed error.** Typing `{CW. a` right after `{CB1.` (a catchword inside a column, with no closing brace) produced no diagnostic, even though `unclosedEnvironmentErrors()` exists. | Walkthrough. Breaks §4.2 (the catchword goes on a separate line after the closing brace of the last `{CB.}`) and §3.239a(e) (all brace-bounded mnemonics close inside the `{CB.}` where they begin). |
| V4 | **Tag catalogs disagree.** The sample `Nunes demo` marks its gloss with `{GLR. …}`. The renderer draws it as a right-margin gloss (`glossMarginSide()` in `SvgFacsimilePage.web.tsx`), but `scanLineLexicalIssues()` reports "Unrecognized HSMS tag start `{GLR.`". The manual's index of mnemonics lists `{GL.}`, not `{GLR.}`, and §3.239a also requires the gloss text to be bracketed: `{GL. [^text]}`. Known codes are spread across `ENVELOPE_MAP` / `isKnownEnvironmentCode()` (`utils/environmentBlocks.ts`), `FIGURE_CODES` (`utils/structuralAssembly.ts`), the renderer, and the linter. | Walkthrough plus manual text. |
| V5 | **Counts are mislabeled.** The toolbar button reads "Errors (1)" while the sheet reports "0 errors · 1 warning". | Walkthrough |
| V6 | **Two unlabeled line numbers.** A row shows "L19" (source-file line) next to "13 …" (manuscript line prefix), with no label on either. | Walkthrough |
| V7 | **Weak navigation.** "Jump to line on canvas" sets the focus bar but doesn't scroll to or highlight the line. Nothing jumps to the *source* line, which is where the fix happens. | Walkthrough |
| V8 | **No guidance.** Messages ("verify against the mnemonic catalog") cite no manual section, link to nothing, and offer no fix. | Walkthrough |
| V9 | **The first-run sample carries a warning.** The default workspace opens with an issue badge. | Walkthrough |

---

## 3. Requirements

### 3.1 Pipeline

| ID | Requirement | Acceptance |
|----|-------------|------------|
| VAL-1 | One `ValidationStore` owns diagnostics for the active workspace. `EditorLinterBanner`, `ValidationPanel`, the toolbar badge, the modal, the editor gutter ([SPEC-EDITOR.md](SPEC-EDITOR.md)) and copilot `ingest.*` recipes all read from it. Nothing else calls `lintHsmsTranscription()` from UI code. | Lint rule: `lintHsmsTranscription` can be imported only from `utils/validation/**`, `scripts/**`, `services/**`, `__tests__/**`. Test: banner and panel render identical lists for 20 random edits. |
| VAL-2 | Every result carries the `revision` (monotonic buffer counter) it was computed from. UI shows a result only for the current revision, or marks it **stale**. | Stale entries render at 50% opacity with "Checking…" next to the count, never mixed with current entries. |
| VAL-3 | Two phases, both debounced on input, neither gated on blur. **Lexical** (line-local) runs 150 ms after the last keystroke, only on changed lines. **Structural** (environment stack, folio and column rules) runs on the existing compile debounce (400 ms, adaptive per SPEC-LIGHTWEIGHT §4.6). | With the editor focused, a structural diagnostic appears ≤ 400 ms + compile p95 after typing stops (Playwright with a fake clock). The "Checking…" indicator always resolves. |
| VAL-4 | When the structural pass is slower than 100 ms p95 on the reference device, it moves to a Web Worker (web), as SPEC-LIGHTWEIGHT §4.6 already plans for compile. Native keeps it synchronous with the adaptive debounce. | Measured on the largest OSTA witness. |
| VAL-5 | Compile errors never block rendering of the last good parse. The page keeps showing the previous successful layout with a "Showing last valid version" ribbon until the parse succeeds. | Typing an unclosed brace doesn't blank the page. |

### 3.2 Mnemonic registry

| ID | Requirement | Acceptance |
|----|-------------|------------|
| VAL-10 | Create `constants/hsmsMnemonics.ts`, the single source of truth for every brace-bounded mnemonic (schema in §4.2). `ENVELOPE_MAP`, `isKnownEnvironmentCode()`, `blockTypeForEnvCode()`, `FIGURE_CODES`, `LANGUAGE_TAG_CODES`, the lexical scan, and renderer role lookup all derive from it. | Grep check: no string literal mnemonic tables outside the registry (allow-list for tests and docs). |
| VAL-11 | Seed the registry from the manual's mnemonic index: `AD`, `BLNK`, `CB` (n), `CW`, `DIAG`, `GL`, `HD` (n), `ILL`, `IN` (n), `MIN`, `RMK:`, `RUB`, `SG`, `SYMB`, plus the language mnemonics of §3.236: `ARB ARG ARM BAS CAT ENG EXT FRN GAL GER GRK HEB ITL LAT PRT PRV`. | Unit test compares the registry against a fixture extracted from `docs/HSMS-manual.md`. |
| VAL-12 | App-specific mnemonics not in the manual (`GLR`, and any others the renderer accepts, such as a Spanish language tag if used) are registered with `standard: false`, a description, and the manual mnemonic they extend. They produce an **info** diagnostic `HSMS-I-EXTENSION` ("`{GLR.}` is a Transcription Conniption extension of `{GL.}` (§3.239a). Other HSMS tools may not read it."), not an "unrecognized" warning. | `{GLR.}` yields exactly one info diagnostic and still renders as a right-margin gloss. |
| VAL-13 | CI parity check `npm run check:mnemonics`: (a) every code the renderer handles is in the registry; (b) every code in `assets/examples/`, scriptorium fixtures and the OSTA golden files is in the registry or reported; (c) every registry entry has a manual section or `standard: false`. | Job fails on violation. |

### 3.3 Rules

Each rule has a stable code, a severity, a manual section, and (where marked) a quick fix. Codes are `HSMS-<E|W|I>-<NAME>`. Rules already implemented in `parseValidation.ts` / `hsmsLinter.ts` keep their logic, are mapped to codes, and get regression tests. **New** marks rules to add.

| Code | Sev | Rule | Manual | Fix | Status |
|------|-----|------|--------|-----|--------|
| `HSMS-E-BRACE-UNCLOSED` | E | `{` opened and not closed by the end of its `{CB.}` (or end of file). Report at the opening position. | §3.239a(e) | Insert `}` at end of the enclosing block | Existing (`unclosedEnvironmentErrors`); **regression for V3** |
| `HSMS-E-BRACE-STRAY` | E | `}` with no matching opener | — | Delete | Verify |
| `HSMS-E-UNKNOWN-MNEMONIC` | W | Code not in the registry | Mnemonic index | "Did you mean `{GL.}`?" (edit distance ≤ 1 against registry) | Existing; retarget to the registry |
| `HSMS-I-EXTENSION` | I | Registered non-standard code | per entry | Replace with the standard form if one exists | **New** |
| `HSMS-E-CW-PLACEMENT` | E | `{CW.}` inside a `{CB.}`, or not on its own line after the last `{CB.}` closes on that folio side | §4.2 | Move to a new line after the closing brace | **New** |
| `HSMS-E-SG-PLACEMENT` | E | Same rule for `{SG.}` | §4.5 | Same | **New** |
| `HSMS-W-NONSEQ-ORDER` | W | `[—]` non-sequitur marker before a catchword on the same folio side | §1.3, §4.3 | Move after the catchword | **New** |
| `HSMS-E-FOLIO-FORMAT` | E | Folio indication not `[fol. <n><r\|v>]` alone on its line | §1.1 | Normalize (`[fol.3r]` → `[fol. 3r]`) | Verify |
| `HSMS-W-HD-POSITION` | W | `{HD.}` not immediately after the folio indication (column headings `{HDn.}` must follow on separate lines) | §2.1, §2.5 | — | **New** |
| `HSMS-W-HD-CONTINUATION` | W | Heading continued on the next folio without " +" before the closing brace | §2.2 | Insert ` +` | **New**; heuristic, warning only |
| `HSMS-E-CB-REQUIRED` | E | Body text on a folio side outside any `{CB.}` | §3.1 | Wrap in `{CB1.` … `}` | Verify |
| `HSMS-W-CB-NESTED` | W | `{CB.}` inside `{CB.}` (allowed only for subordinate lists) | §3.13 | — | **New**; warning, since it is sometimes legitimate |
| `HSMS-W-COLUMN-END-HYPHEN` | W | Column closes on a hyphenated fragment (the word should be completed from the next column) | §3.12 | "Bring back fragment" when the next column's first word is unambiguous | **New** |
| `HSMS-I-CB-EMPTY` | I | Empty `{CB.}` (valid; shown for awareness) | §3.15 | — | **New** |
| `HSMS-E-REMARK-PUNCT` | E | Period or colon inside a remark field, or remark not closed by a period | §5.1 | — | Verify |
| `HSMS-E-RMK-COLON` | E | `{RMK.` written with a period instead of `{RMK:` | §5.2 | Replace `.` with `:` | Verify |
| `HSMS-W-GL-BRACKETS` | W | `{GL.}` text not enclosed in `[^…]` | §3.239a(b) | Wrap in `[^` … `]` | **New** |
| `HSMS-E-ID-FORMAT` | E | Identification header fields not period-terminated, or a period inside a field | §0.1 | — | Verify |

Rules marked "Verify" may already exist under other names. The work is to find them, assign the code, and add a golden test.

### 3.4 Messages and presentation

| ID | Requirement | Acceptance |
|----|-------------|------------|
| VAL-20 | Message strings are i18n keys `validation.<code>.message` and `validation.<code>.fix`, with named placeholders (`{mnemonic}`, `{line}`), per SPEC-I18N §5. `localizeValidationMessage()` resolves by code, not by English text. | `i18n:check` covers every code in the rule table. |
| VAL-21 | Every diagnostic row shows: severity icon plus word ("Error", "Warning", "Note"), message, **"Source line 19 · fol. 3r, line 13"** (both labeled), and actions: **Edit line**, **Show on page**, **Fix** (if any), **Manual §x.y**. | Snapshot test of `IssueRow` for each severity. |
| VAL-22 | **Edit line** switches to Source view and selects the range. **Show on page** switches to Page view, scrolls, and highlights the line for 2 s ([SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) §4.4). | Playwright: both actions land on the right line. |
| VAL-23 | **Manual §x.y** opens the in-app manual reader at that section (`docs/HSMS-manual.md` rendered in the Sources tab, anchors generated per section number), with the hispanicseminary.org manual as the external link. | Each code's section anchor resolves (unit test over the rule table). |
| VAL-24 | The toolbar button is **"Issues"**, with separate counts and icons: `✕ 0  ⚠ 1  ℹ 1`. It never says "Errors" when the count is warnings. | Snapshot |
| VAL-25 | Inline, show **one** compact issues strip (collapsed by default when there are 0 errors) under the editor. The full list lives only in the modal or sheet. Remove the duplicated banner + inline panel. | One component (`IssuesPanel`) with `variant: "strip" \| "sheet"`. |
| VAL-26 | Quick fixes are text edits on the current revision, applied through the editor's undo stack. | Undo restores the exact previous text (unit test). |

### 3.5 Samples

| ID | Requirement | Acceptance |
|----|-------------|------------|
| VAL-30 | Every bundled sample (`listScriptoriumFixtures()`, `assets/examples/`, the default workspace from `bootstrapDefaultWorkspace()`) validates with **0 errors and 0 warnings**. Info diagnostics are allowed only for documented extensions. | CI test iterates all fixtures. |
| VAL-31 | Rewrite the Nunes demo gloss as standard markup: `{GL. [^% Chame~sse fixas … oytauo.]}`. Confirm the renderer still places it in the margin. If the right-margin placement depends on `GLR`, keep `GLR` as a registered extension (VAL-12) and use it only in a dedicated "extensions" sample. | Visual snapshot of fol. 3r unchanged except for the gloss bracket styling. |

---

## 4. Design

### 4.1 Modules

```text
utils/validation/
  store.ts          # ✅ ValidationStore: lexical @150ms + structural @400ms; merge + revision gate
  run.ts            # runLexical(lines, changedRange), runStructural(text) → Diagnostic[] (planned)
  rules/            # one file per rule family; each exports { code, severity, manual, check(), fix?() }
  registry.ts       # re-export of constants/hsmsMnemonics.ts + lookup helpers
  fixes.ts          # TextEdit[] builders
hooks/useValidationStore.ts  # ✅ subscribe → { diagnostics, errorCount, warningCount, isParsing }
components/IssuesPanel.tsx  # replaces EditorLinterBanner + ValidationPanel (keep the old names as thin wrappers for one release)
```

**Shipped:** `validationStore` feeds `EditorLinterBanner` and `ValidationPanel` with the same diagnostic list; Studio compile debounce reads `localEditorBuffer` so structural analysis is not gated on blur (VAL-3).

Reuse the existing LSP-shaped types (`HsmsDiagnostic`, `LspRange`, `toHsmsDiagnostics()`, `validationSeverityToLsp()`) as the `Diagnostic` shape. Add `code`, `manualSection`, `msLocation`, and `fixes`.

```ts
interface Diagnostic {
  code: string;                 // "HSMS-E-CW-PLACEMENT"
  severity: "error" | "warning" | "info";
  manualSection?: string;       // "4.2"
  range: LspRange;              // source-file position (0-based internally, 1-based in UI)
  msLocation?: { folioId: string; line?: number };  // from the parse, when available
  messageKey: MessageKey;       // validation.<code>.message
  params: Record<string, string | number>;
  fixes?: { labelKey: MessageKey; edits: TextEdit[] }[];
  revision: number;
}
```

### 4.2 Registry schema

```ts
interface MnemonicSpec {
  code: string;                         // "CW", "CB", "HD", "GLR"
  delimiter: "." | ":";                 // RMK uses ":"
  numbered?: "required" | "optional";   // CB1, IN4, HD2
  kind: "structure" | "insertion" | "figure" | "language" | "remark" | "heading" | "decoration";
  blockType: BlockType;                 // feeds blockTypeForEnvCode()
  placement?: "inside-cb" | "after-last-cb" | "after-folio-line" | "any";
  contentRule?: "bracketed-insertion";  // GL: [^…]
  manualSection?: string;               // "4.2"
  standard: boolean;
  extends?: string;                     // GLR → GL
  renderRole?: "gloss-right" | "gloss-left" | "rubric" | "initial" | …;
  bcp47?: string;                       // language mnemonics, replaces LANGUAGE_TAG_BCP47 map
}
```

### 4.3 Flow

```text
keystroke → buffer.revision++ ─┬─ 150 ms → runLexical(changed lines) → store.setLexical(rev, diags)
                               └─ 400 ms → compile (parse + structural) → store.setStructural(rev, diags)
UI: useValidation() → merged, deduped by (code, range); filtered to current revision; stale flag otherwise
```

Remove the blur-triggered commit as the *only* trigger. Keep blur as an extra immediate flush.

### 4.4 Tiering

The lexical rules and the registry are Tier 0, since the reader path shows the issues badge. The structural rules run inside compile, which is already Tier 0. Quick-fix builders and the manual reader are Tier 1 (lazy).

---

## 5. Tests

| Test | Gate |
|------|------|
| **V3 regression:** Nunes sample + `{CW. a` appended to the `{CB1.` line → exactly `HSMS-E-CW-PLACEMENT` and `HSMS-E-BRACE-UNCLOSED` | Pass |
| **V1/V2 regression:** with the editor focused, insert `{ZZZ. test}` on line 1; after 600 ms (fake timers) the banner, panel, and badge show the same two diagnostics at source lines 1 and 20 | Pass |
| One golden test per rule in §3.3 (minimal failing and passing inputs) | Pass |
| All fixtures: 0 E / 0 W (VAL-30) | Pass |
| OSTA integration (`ostaCorpusIntegration.test.ts`): record per-code counts across the corpus. Any code firing on > 5% of files gets reviewed before release (catches false positives) | Report + review |
| `check:mnemonics` (VAL-13) | Pass |
| Quick fixes are idempotent and undoable | Pass |

---

## 6. Rollout

| Phase | Scope | Exit |
|-------|-------|------|
| VAL-P1 | Store, revision stamping, remove the blur gate, single `IssuesPanel`, "Issues" badge (VAL-1…3, 20…25) | V1/V2 regression green |
| VAL-P2 | Registry + parity check + sample cleanup (VAL-10…13, 30…31) | Fixtures clean; `{GLR.}` is info-level |
| VAL-P3 | New rules in §3.3 + quick fixes + manual reader anchors | Golden tests; OSTA false-positive review |
| VAL-P4 | Worker offload if measurements require it (VAL-4) | Reference-device numbers recorded |

## 7. Open questions

1. Is `{GLR.}` (right-margin gloss) used in the OSTA corpus or only in app samples? If the corpus uses it, it stays a registered extension. If not, deprecate it in favor of `{GL.}` plus a renderer placement heuristic.
2. The language mnemonic list in §3.236 has no Spanish code (Spanish is the default). If the app emits `{SPN.}` or similar anywhere, register it as an extension.
3. Should warnings block export? Recommended: never block. The Export sheet shows "1 error in this transcription. Export anyway?" for errors only.
