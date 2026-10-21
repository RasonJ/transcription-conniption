# Implementation Audit: Usability Remediation

**Date:** 2026-10-21 · **Code:** `84dd3c8` (working tree clean) · **Specs:** `docs/specs/` at the same commit
**Method:** read the source for every requirement; ran the Jest suite, `check:tiers`, `check:mnemonics`, `i18n:check` and ESLint; ran the walkthrough's validation and concordance cases against the real linter, parser and concordance builder. Not done: the in-browser replay (no dev server reachable from the session) and `size:check` (needs a web build).

Legend: ✅ verified in code · 🟡 partly done · ❌ not done · ⚠️ done but deviates from the spec · 🐞 bug found

---

## 1. Summary

More is built than the specs' own status notes say (the viewport, editor gutter and completion, assistant card fixes, and pseudo-locale gating all landed after those notes were written). But **two of the four "Broken" walkthrough findings are only partly fixed**, and the build gates are red.

| Finding | State | One-line reason |
|---------|-------|-----------------|
| 1. Page cut off / phones | 🟡 | Viewport is mounted with fit, zoom and pan, but its height is hard-coded to 1100 px (§3.1) |
| 2. Validation panels disagree | ✅ | One store, revision-gated, 150/400 ms, no blur gate |
| 3. Missed `{CW.}` error; `{GLR.}`; sample warnings | ❌ | The walkthrough's exact case still passes silently; `{GLR.}` still warns; the Nunes sample still opens with a warning |
| 4. Spanish lemmas on Portuguese | ✅ | Nunes: 55 word forms, no *haber*/*atar*/*esfera*; method line "no dictionary for PRT" |
| 5. Counts, line labels, navigation | 🟡 | "Issues ✕ ⚠ ℹ" badge and labelled source line done; no manuscript location, no Edit line / Show on page / Fix / Manual actions |
| 6. Plain-text editor | 🟡 | Gutter, markers, spellcheck off, brace pairing, completion, side-by-side ≥ 1024 px; no linked scrolling, no character palette |
| 7. Duplicated actions, export, switches, jargon | 🟡 | Export sheet, Display popover and de-duplication done; editor-tools card and developer wording remain |
| 8. Assistant card | ✅ | Tier words with explanations, confidence only below threshold, timer dev-only |
| 9. Library | 🟡 | Catalog v2, grouping, isolated open done; no sort, search-all or metadata in the Studio |
| 10. Accessibility | 🟡 | Primitives, lint rule (0 hits), focus trap on 4 sheets; no witness `lang`, decorative initials still exposed |
| 11. Pseudo-locale, engineer copy | ✅ | Pseudo-locale dev-only; tab renamed "About & manual"; no repo paths in copy |

---

## 2. Build gates

| Gate | Result |
|------|--------|
| Jest (107 suites, 605 tests) | **3 failures.** `tierBoundaries` 🐞 real (see LW-1 below). `justifiedLineCompact` (`dx` value > 6): fails here; rerun on Windows to rule out font metrics before treating as a regression. `corpusRoots`: Windows-path test run on Linux; environment only, not a defect. |
| `check:tiers` (LW-1) | ❌ **Fails.** `app/(tabs)/index.tsx → utils/manuscriptTfidf.ts → utils/copilot/stats.ts` and `index.tsx → utils/librarySidecars.ts → utils/corpusPrecompute.ts → utils/copilot/facetIndex.ts`. Copilot code is back in the reader's eager path, likely from the salient-term highlighting work. |
| `check:mnemonics` | ✅ 36 codes |
| `i18n:check` | ✅ 657 keys; machine drafts pending review in es/pt/ca/gl/eu (expected) |
| ESLint | ❌ **12 errors.** 10 × `no-dupe-keys` 🐞: `stats.ttr_hapax` and `search.kwic` are defined twice in `utils/copilot/triggers/{ca,es,eu,gl,pt}.ts`, so the first set of triggers is silently discarded in five locales. 2 × duplicate export of `computeReasoningDagHash` in `utils/reasoningGraph/index.ts`. 88 warnings (75 are `array-type` style). |
| `size:check` | Not run (needs `build:web`) |

---

## 3. Findings by spec

### 3.1 SPEC-FOLIO-VIEWPORT

| ID | State | Evidence |
|----|-------|----------|
| FV-1 | ⚠️ | `FolioViewport` wraps `SvgFacsimilePage` in `app/(tabs)/index.tsx`. On **web the default is 100 %, not fit width** (`preferredZoomMode()`), and `resolveDisplayFitScale()` forces 100 % whenever fit would go below 0.85 on panes ≥ 600 px. Content stays reachable by scrolling, so nothing is lost, but this is a deliberate deviation. Record it in the spec or change the default. |
| FV-2 | 🐞 | The call site passes `pageHeight={1100}`, and the viewport uses `pageHeight ?? measuredHeight`, so the measured content height is **never used**. Folios taller than 1100 px are cut or overlap what follows; short folios leave a blank band (the walkthrough's phone symptom). Fix: drop the prop, or pass the real height from `layoutForFolio()`. |
| FV-3 | ✅ | −, Fit/100 %, + buttons; Ctrl ±/0; pinch; double-tap |
| FV-4 | ✅ | Two-axis `ScrollView`, horizontal indicator. Note: vertical scroller has `maxHeight: 1200`, which nests scrolling inside the page scroll |
| FV-5 | ✅ | Legibility banner at < 12 px (spec said 11; fine) with Reading view and dismiss |
| FV-6 | 🟡 | Scale reported to `ScrollAnchorContext`; 2 s highlight exists. Jump-to-line at 0.5/1/2 not tested |
| FV-7 | ✅ | Reset on `resetKey` |
| FV-8 | ✅ | Uses `react-native-gesture-handler` (already a dependency) |
| FV-9 | ❓ | Native not checked |

### 3.2 SPEC-VALIDATION

Ran the linter and the compile path on the Nunes sample and variants:

| Input | Expected | Actual |
|-------|----------|--------|
| Nunes sample as shipped | 0 errors, 0 warnings (VAL-30) | ❌ 1 warning `CALDERON_SPACING` on the gloss `[^% Chame~sse…`. The manual's own gloss example (§3.239a: `{GL. [^% % frondinodio…`) has `%` straight after `[^`, so this is a **false positive** in the rule, not a sample error |
| `{CB1. {CW. a` (walkthrough V3) | `HSMS-E-CW-PLACEMENT` + `HSMS-E-BRACE-UNCLOSED` | ❌ **Nothing.** The rule only matches `{CW.` at the start of a line, and the unclosed `{CW.` brace isn't counted |
| `{CW. a}` alone on a line inside `{CB1.` | CW-PLACEMENT | ✅ |
| `{GLR. …}` | One info `HSMS-I-EXTENSION` (VAL-12) | ❌ Info **plus** `UNKNOWN_TAG` warning: the lexical scan doesn't consult the registry |
| `{RUB. abierto` at end | Unclosed error | ✅ `UNCLOSED_ENV` |
| `{RMK. …}` | `RMK-COLON` | ✅ `RMK_DELIMITER` (warning, spec says error) |
| `{RMK: Pedro. Nunes.}` | `REMARK-PUNCT` | ❌ not detected |
| Stray `}` at end | `BRACE-STRAY` | ❌ not detected |
| Body text outside `{CB.}` | `CB-REQUIRED` | ❌ not detected |
| `[fol.3r]` | `FOLIO-FORMAT` | ❌ not detected |
| LAT span sample | 0 warnings | ❌ `IMPLICIT_CONTINUATION` warning |

| ID | State | Evidence |
|----|-------|----------|
| VAL-1 | 🟡 | Store is the source for the banner and panel. `EditorLinterBanner` still imports `lintHsmsTranscription` and falls back to it when no diagnostics are passed; the import-restriction lint rule isn't there |
| VAL-2, 3 | ✅ | Revision gate in `utils/validation/store.ts`; 150/400 ms timers |
| VAL-5 | ❓ | |
| VAL-10 | 🟡 | `constants/hsmsMnemonics.ts` exists (36 codes, `GLR` marked `standard: false, extends: "GL"`), but the lexical scan, `ENVELOPE_MAP` and the renderer don't derive from it |
| VAL-11, 13 | ✅ | Seeded from the manual; `check:mnemonics` passes |
| VAL-12 | ❌ | See table |
| §3.3 rules | 🟡 | Added: CW/SG placement (line-start only), EXTENSION. Missing: BRACE-STRAY, NONSEQ-ORDER, FOLIO-FORMAT, HD-POSITION, HD-CONTINUATION, CB-REQUIRED, CB-NESTED, COLUMN-END-HYPHEN, CB-EMPTY, REMARK-PUNCT, GL-BRACKETS, ID-FORMAT; codes still use the old names (`UNCLOSED_ENV`, `UNKNOWN_TAG`) |
| VAL-20 | 🟡 | Messages localized; keyed by old codes |
| VAL-21 | 🟡 | Severity word + icon + "Source line N"; no manuscript location (fol./line), no action buttons |
| VAL-22 | ❌ | Row tap = jump only |
| VAL-23 | ❌ | No manual links |
| VAL-24 | ✅ | `Issues ✕{errors} ⚠{warnings} ℹ{notes}` |
| VAL-25 | ✅ | `IssuesPanel` `strip` / `sheet` |
| VAL-26 | ❌ | No quick fixes |
| VAL-30 | ❌ | See table |
| VAL-31 | ✅ | Nunes gloss rewritten to `{GL. [^…]}` |

### 3.3 SPEC-EDITOR

| ID | State | Evidence |
|----|-------|----------|
| ED-1 | ✅ | `spellCheck: false`, `autoCorrect={false}`, `autoCapitalize="none"`, `data-gramm="false"`, `translate="no"` |
| ED-2, 3 | ✅ | Gutter with ✕/⚠/ℹ markers, scroll-synced. Gutter `maxHeight: 640` while the editor is ≥ 60 % of the window; check long files |
| ED-4 | 🟡 | Editor min height 60 %; the editor-tools card still sits above it |
| ED-5, 6 | ❓ | |
| ED-10 | ✅ | Side by side at window width ≥ 1024 (spec: content area); no Tabs/Side-by-side override |
| ED-11, 12 | ❌ | `utils/editorLineMap.ts` is built but **not imported anywhere** |
| ED-20, 21 | ✅ | `pairBraces`, `getMnemonicCompletions` |
| ED-22, 23 | ❌ | No character palette, no snippets |
| ED-24 | ❌ | No inline underlines |

### 3.4 SPEC-CONCORDANCE-LANGUAGE

LEX-1, 2, 3, 6, 10 ✅ (verified on Nunes, see §1). Also done although the repo spec didn't list them: KWIC three-column rows (LEX-13), `fol. 3r:9` hit refs (LEX-14), sort (LEX-16), CSV export (`concordanceExport.ts`, LEX-17). Not done: language override UI (LEX-4), uncertainty (LEX-5), group-by toggle (LEX-11), variants list (LEX-12), copilot "related forms" (LEX-21). The method line is an English literal in `formatConcordanceMethodLine()`; move it to i18n.

### 3.5 SPEC-STUDIO-IA

| Area | State | Evidence |
|------|-------|----------|
| §3.1 one place per action | ✅ | Ask, Issues, Export only in the witness toolbar; TEI button gone |
| §3.2 open as new workspace | ✅ | `openAsNewWorkspace()` for samples, import and Library |
| §3.2 Open ▾ menu | ❌ | The editor-tools card (New blank scriptorium, Batch folder, Import .hsms, Nunes demo, Simple, LAT span, Graphics) is still there |
| §3.3 Export sheet | ✅ | 8 formats incl. TEI diplomatic/normalized and `.hsms` bundle |
| §4 Display popover | ✅ | Text / Layout / Compare groups, helper text, focus trap; presets ❌ |
| §5 IA-20…23 | ✅ | |
| §6 IA-30, 32 | ✅ | |
| §6 IA-31 | ✅ | `LocalePickerCompact` in the Studio header |
| §7 wording | ❌ | Still "Advanced editor", "Hide editor tools", "New blank scriptorium", "Nunes demo", "Transcription Code" |

### 3.6 SPEC-LIBRARY

✅ LIB-1, 3, 4, 11, 14, 15 (schema v2, unknown-author handling, grouping with year range, isolated open). ❌ LIB-2 (overrides file), LIB-5 (report), LIB-12 (sort), LIB-13 (search-all, year ranges), LIB-20/21/22 (catalog metadata in the Studio).

### 3.7 SPEC-ACCESSIBILITY

✅ A11Y-1, 2 (rule loaded as warn; 0 violations across `app/` and `components/`, so it can be promoted to error now), A11Y-3. 🟡 A11Y-6: focus trap on Concordance, Display, Export and Consent sheets; not on the Assistant or Issues sheet. ❌ A11Y-7 (no `lang` / `accessibilityLanguage` on witness text), A11Y-8 (initials not hidden from screen readers). Tab bar uses localized titles (A11Y-5 effectively met).

### 3.8 SPEC-ORNATE-INITIALS

The repo spec says the old generator is no longer called. **It still is.** `buildInitialScene()` (`utils/initials/scene.ts`) wraps `buildOrnateInitialGeometry()`, which calls `pickLetterform()`; the tradition only chooses which old matrix to use (e.g. `print.woodcut` → `gothic_textura` / `renaissance_foliated`).

| Finding | State |
|---------|-------|
| I1 one pipeline for native, web, SVG and HTML export | ✅ |
| I2 style per witness | 🟡 tradition from `{RMK:}` picks a matrix; the matrices are the old ones |
| I3 markup-driven grades | 🟡 Supplied and Unexecuted states exist; Illuminated/Historiated not distinct |
| I4 system fonts | 🟡 `Impact`/`Arial Black`/`Courier New` swapped at render; still in the stacks |
| I5 rounded corners, shadows, underlay | ❌ `rx` and the letter underlay still emitted |
| I6 flat gold, I7 invented palette | ❌ `ILLUMINATED_THEMES` still drives colour; `PIGMENT_PALETTE` used only for Supplied/Unexecuted |
| I8 penwork in margin | ❌ |
| I9 letter-aware width | 🟡 `letterAspect()` per letter |
| OI-PP period profile | ❌ |

---

## 4. Fix list, in order

1. **Make the build green.** Break the two Tier 0 → copilot imports (lazy-load `manuscriptTfidf` / `librarySidecars` or move the shared stats helpers out of `utils/copilot/`). Remove the duplicate trigger keys in five locale files (merge the two arrays). Fix the duplicate export in `utils/reasoningGraph/index.ts`. Rerun `justifiedLineCompact` on Windows.
2. **FV-2:** remove `pageHeight={1100}`; drop the vertical `maxHeight: 1200` scroller.
3. **The walkthrough's validation case:** match `{CW.` / `{SG.` anywhere inside an open `{CB.}`, count unclosed braces from any mnemonic, make the lexical scan read `HSMS_MNEMONICS` (kills the `{GLR.}` warning), and fix `CALDERON_SPACING` after `[^` so the Nunes sample is clean. Add those four cases as regression tests (they're the table in §3.2).
4. **Studio wording + Open ▾ menu** (§7, §3.2) — mostly string and layout work.
5. **Wire `editorLineMap`** into IssueRow (manuscript location, Edit line, Show on page) and cursor ↔ page sync.
6. **Initials:** replace the old geometry inside `buildInitialScene()` with the treatments in §5 of the spec, starting with removing `rx`, the underlay and `ILLUMINATED_THEMES`; then OI-0 and OI-PP.
7. Promote `a11y/pressable-needs-role` to error; add `lang` to witness text; hide decorative initials.
8. Correct the status notes in the repo specs that disagree with the code (SPEC-FOLIO-VIEWPORT §0 says not wired; SPEC-ORNATE-INITIALS §9.1a says `pickLetterform` isn't called; SPEC-EDITOR puts completion in ED-P2).
