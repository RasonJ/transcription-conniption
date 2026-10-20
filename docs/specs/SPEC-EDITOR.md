# Spec: HSMS Source Editor

**Status:** Approved (P1 scaffold) · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-VALIDATION.md](SPEC-VALIDATION.md) · [SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) · [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md)
**Fixes:** walkthrough finding 6 (the editor is a plain text box), plus the editing-speed items from the first review (mnemonic autocomplete, special-character palette, brace pairing)

---

## 0. Implementation (P1)

- `utils/editorLineMap.ts` — `buildSourceLineMap(parsed, rawSource)` for O(1) source↔folio:line lookups (ED-11/12 foundation).
- Mnemonic autocomplete (`getMnemonicCompletions`) remains ED-P2.

## 1. Goal

Make editing HSMS source fast and safe. Every diagnostic can be found by line number, the editor never marks medieval spelling as a typo, a change and its rendered result can be seen together on wide screens, and the hard-to-type parts of HSMS (mnemonics, braces, MUFI characters) take one or two keystrokes.

### Non-goals

- A general-purpose IDE. No multi-file editing, minimap, or settings UI.
- Changing HSMS syntax or the parser.

---

## 2. Findings (observed 2026-10-20)

| # | Observation |
|---|-------------|
| E1 | The source editor is a multiline text input with no line-number gutter. Diagnostics say "L19", but the only numbers visible are the manuscript line prefixes inside the text ("13 {GLR. …"). |
| E2 | `spellcheck` is `true` on the textarea (DOM probe). The browser underlines nearly every Old Portuguese / Old Spanish word, which looks like errors and competes with real diagnostics. |
| E3 | Source and Page are mutually exclusive tabs ("Transcription Code" / "Parchment Sheet") at every width. You can't see a change and its result together. |
| E4 | In edit mode the editor is the fourth block on the screen, after the header, the editor-tools card, and the two validation panels. It also has a short fixed height with its own scrollbar inside the page scroll. |
| E5 | Cursor → page sync exists (the focus bar follows the cursor's manuscript line, "Focus: [fol. 3r] · line 12"), but the page doesn't scroll or highlight, and there is no page → cursor sync. |
| E6 | (First review) There is no help typing mnemonics, braces, or MUFI characters, and no inline diagnostics. |

---

## 3. Requirements

### 3.1 Basics (ED-P1)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| ED-1 | Turn off all text assistance on the source input: `spellCheck={false}`, `autoCorrect={false}`, `autoCapitalize="none"`, `autoComplete="off"`, and on web also `data-gramm="false"` (Grammarly) and `translate="no"`. | DOM probe: `spellcheck === false`. No red squiggles in a screenshot of the Nunes sample. |
| ED-2 | A source line-number gutter, 1-based, matching the "Source line N" in diagnostics ([SPEC-VALIDATION.md](SPEC-VALIDATION.md) VAL-21), kept in sync with the editor's scroll. | Line 19 in the gutter is the line a diagnostic on source line 19 points to (Playwright). |
| ED-3 | The gutter shows a severity marker (✕ / ⚠ / ℹ, with the color as a second cue) on each line that has a diagnostic. Hover or tap shows the message and its fixes. | Snapshot |
| ED-4 | The editor fills the available height in edit mode (min 60% of the viewport). The page scroll and the editor scroll do not nest. The issues strip sits under the editor, collapsed when there are 0 errors. | At 705 × 832 the editor's first line is visible without scrolling once editor tools are collapsed ([SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §4.2). |
| ED-5 | Monospace font with HSMS glyph coverage. Use a MUFI-capable mono face if one is licensable; otherwise the system mono font, with MUFI PUA code points falling back to the bundled MUFI font. | Tilde, macron, and PUA characters render in the editor (visual check on the Nunes and OSTA samples). |
| ED-6 | Cursor and selection survive switching Source ↔ Page and back. | Unit test on the workspace editor state. |

### 3.2 Linked views (ED-P2)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| ED-10 | **Side-by-side** layout when the Studio content area is ≥ 1024 px wide: Source on the left, Page on the right (FolioViewport fit to its pane). Below 1024 px keep the Source / Page tabs. The user can override with a "Layout: Tabs \| Side by side" control, remembered in browser storage (wrapped in try/catch). | Resize test across the breakpoint. |
| ED-11 | **Cursor → page:** moving the cursor to a different manuscript line scrolls the page pane so that line is visible and outlines it (no 2 s pulse here; a steady outline while the cursor stays on that line). | Playwright: put the cursor on source line 14 → page row "fol. 3r, line 8" is in view and outlined. |
| ED-12 | **Page → cursor:** clicking or tapping a line on the page (in edit mode) puts the cursor at the start of the matching source line and scrolls the editor to it. Uses the block → source-line map from the parse (`BlockEntry` / spatial AST line refs). | Playwright |
| ED-13 | Scroll sync is opt-in ("Sync scrolling" toggle, default on in side-by-side). | Manual |

### 3.3 Typing help (ED-P3)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| ED-20 | **Brace pairing:** typing `{` inserts `}` after the cursor, and typing `}` before an auto-inserted `}` steps over it. Same for `[` `]` and `<` `>` (expansions). Backspace on an empty pair deletes both. | Unit tests on the input transform |
| ED-21 | **Mnemonic completion:** after `{` show a completion list from the mnemonic registry ([SPEC-VALIDATION.md](SPEC-VALIDATION.md) §4.2), filtered as the user types and ranked by context (`placement`). Example: after `[fol. …]` on the next line, `HD` ranks first. Each item shows the code, a plain-language name ("Catchword"), and the manual section. Enter inserts the code plus its delimiter (`CW. `), and for numbered codes selects the number. | Playwright: `{` `c` `w` Enter → `{CW. ` with cursor after the space. |
| ED-22 | **Character palette:** a toolbar button (and `Ctrl/Cmd+Shift+K` on web) opens a searchable palette of HSMS special characters and MUFI characters, using the existing MUFI catalog (`MUFI_CHARS`, `mufiChars.ts`). Search by name ("long s", "tilde n", "con abbreviation"). A "Recent" row (last 12) is kept per device in browser storage, wrapped in try/catch. Inserting puts the HSMS ASCII form when one exists (e.g. `n~`), otherwise the Unicode/PUA character. | Unit test on the search ranking; Playwright insert |
| ED-23 | **Snippets** for structures that have to come in a fixed order: `newfolio` → `[fol. ${n}${r\|v}]\n{HD. }\n{CB1.\n\n}`; `cw` → a catchword line placed after the last column (only offered when the cursor is after the last `{CB.}` closes). | Snapshot of the expansion |
| ED-24 | **Inline diagnostics:** underline the diagnostic range (wavy for error, dotted for warning) using the same codes as the gutter. | Visual check |

---

## 4. Design

### 4.1 Editor engine (decision)

| Option | Pros | Cons |
|--------|------|------|
| **A. Keep `TextInput`, add an overlay gutter and decorations** | No new dependency; works the same on native | Overlay alignment needs a fixed line height and monospace font; inline underlines are hard; completion popups have to be built by hand |
| **B. CodeMirror 6 on web (lazy Tier 1 editor chunk), `TextInput` + gutter on native** | Gutter, decorations, completion, undo, and large documents for free; accessible; designed to be lightweight | Adds roughly 100–150 KB gzip to the editor chunk (**measure**); two code paths |

**Recommendation:** ED-P1 with option A, which delivers spellcheck, gutter, and layout quickly. Prototype B for ED-P2/P3 behind a flag, measure its chunk size with `npm run size:check`, and keep it out of the reader path (it loads only when "Edit source" opens, per SPEC-LIGHTWEIGHT LW-2). Adopt B if the editor chunk stays within budget. Native keeps A permanently.

### 4.2 Source ↔ manuscript line map

The parse already knows each block's source line (needed for "Jump to line"). Expose it as:

```ts
interface LineMap {
  sourceToMs(sourceLine: number): { folioId: string; line?: number } | null;
  msToSource(folioId: string, line: number): number | null;
}
```

Build it during compile and store it with the parse result, keyed by revision. Validation (`msLocation`), the cursor focus bar, and page clicks all use this one map.

### 4.3 Undo

Quick fixes, completions, palette inserts, and snippets all go through the editor's transaction API, so `Ctrl/Cmd+Z` undoes them one at a time. On native with option A, add a small undo stack (ring buffer of 100 revisions) in the workspace editor state.

---

## 5. Tests

| Test | Gate |
|------|------|
| `spellcheck` false; no `autocorrect` (DOM) | Pass |
| Gutter line numbers match diagnostics on 3 fixtures | Pass |
| Side-by-side breakpoint at 1023 / 1024 px | Pass |
| Cursor → page and page → cursor on Nunes (5 lines each) | Pass |
| Brace pairing and step-over unit tests | Pass |
| Completion ranking: context `after folio line` → `HD` first; inside `CB` → `RUB`, `GL`, `IN` before `CW`/`SG` | Pass |
| Palette search: "long s" → ſ first; "tilde" → ñ / n~ forms | Pass |
| Editor chunk size (option B) within budget | `size:check` |

## 6. Rollout

| Phase | Scope |
|-------|-------|
| ED-P1 | ED-1…6 (option A) |
| ED-P2 | ED-10…13 (linked views); requires FV-P1 and VAL-P1 |
| ED-P3 | ED-20…24; requires VAL-P2 (registry). Engine decision B made before starting |

## 7. Open questions

1. Is there a licensable monospace font with MUFI coverage, or do we keep the system mono font with a MUFI fallback?
2. Should completion offer only standard mnemonics, hiding registered extensions such as `GLR` unless "Show extensions" is on? Recommended: yes.
