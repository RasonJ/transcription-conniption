# Spec: Studio Layout, Controls, Export, and Wording

**Status:** Approved · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) · [SPEC-VALIDATION.md](SPEC-VALIDATION.md) · [SPEC-EDITOR.md](SPEC-EDITOR.md) · [SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) · [SPEC-LIBRARY.md](SPEC-LIBRARY.md) · [SPEC-COPILOT.md](SPEC-COPILOT.md) §4, §11 · [SPEC-I18N.md](SPEC-I18N.md) §2, §6, §7
**Fixes:** walkthrough findings 7 (too many controls, jargon, three export paths), 8 (assistant answer card), 11 (Sources page), and the duplicated header and toolbar actions in finding 5

---

## 1. Goal

A researcher can tell at a glance what each control does, which ones change the document, and where to find any action. Each action appears in exactly one place. Labels use words a paleographer already uses. The main Studio screen is the same for reading and editing; editing adds controls without moving the reading controls.

### Implementation anchors (IA-P1 / IA-P2)

| Concern | Module |
|---------|--------|
| Unified export formats | `utils/exportFormats.ts` (`ManuscriptExportFormat`, `EXPORT_FORMAT_OPTIONS`) |
| Export sheet + pre-export syntax warning | `components/ExportManuscriptSheet.tsx` |
| Non-destructive open | `utils/workspaceTransactions.ts` (`openAsNewWorkspace`) |
| Display popover (Text / Layout / Compare) | `components/DisplaySettingsPopover.tsx` |
| Shared diagnostics | `utils/validation/store.ts` + `hooks/useValidationStore.ts` |
| Facsimile fit scale | `components/svgFacsimile/FolioViewport.tsx` |

### Non-goals

- Visual rebranding. Keep the current palette and type unless a change is required for accessibility ([SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md)).
- Adding features. This spec reorganizes and renames what exists.

---

## 2. Findings (observed 2026-10-20)

| # | Observation |
|---|-------------|
| S1 | **Ask** and **Export** appear twice on the same screen: once in the header card and again in the witness toolbar. |
| S2 | The editor-tools card mixes **sample loaders** (*Nunes demo, Simple, LAT span, Graphics*) with **file actions** (*New blank scriptorium, Batch folder, Import .hsms, Export .hsms*), with nothing to show which ones replace the current work. |
| S3 | Thirteen display switches sit in one flat grid. *Off* is red and *on* is teal, so off looks like an error, and color is the only cue. Several labels are implementation terms: *MUFI PUA font, Suppress otiose, SVG canvas, Place figure, Synoptic pane*. |
| S4 | **Export has three entry points:** the Export sheet (txt, html, svg, png, jpg), a separate **TEI export** button, and **Export .hsms** in editor tools. TEI isn't in the sheet. The HTML option is described as "Legacy table layout for browsers". |
| S5 | Assistant answer cards show "A · Exact", a bare "64%", and a developer timer "4.90 ms". The overview chips carry unexplained counts ("Zipf 62"). SPEC-COPILOT §11 already says the tier badge has "a one-line localized explanation on tap". |
| S6 | The Sources tab opens with the full language list, including the pseudo-locale "[Ëñglîsh ~~~]" (`PSEUDO_LOCALE`, imported by `LocalePicker`). SPEC-I18N §6 says the pseudo-locale is for dev builds only. |
| S7 | The Sources page copy is written for engineers ("real-time vector rendering engine… precise coordinate vector metrics", "MCP: audit_hsms_syntax", "See docs/OSTA-guide.md"). |
| S8 | The header subtitle changes between modes ("Upload, drop, or paste…" vs "Advanced scriptorium: edit HSMS source…"), and the mode button reads "Advanced editor" / "Hide editor tools". |
| S9 | Opening a Library witness or a sample replaces the active workspace without asking (observed with Library → *Celestina auto 02*; the samples are presumed to behave the same). |

---

## 3. Information architecture

### 3.1 Screen regions (top to bottom, Studio tab)

| Region | Contents | Notes |
|--------|----------|-------|
| **A. App bar** | App name · witness title (or file name until metadata loads) · language chip (opens the full picker) · **Open ▾** · **Edit source** toggle | One row on desktop. Wraps to two rows on phones. Remove the descriptive subtitle; move it to the empty state (§3.4). |
| **B. Witness card** | Title, author, imprint (from RMK metadata) · "Language: Portuguese (detected) ▾" ([SPEC-CONCORDANCE-LANGUAGE.md](SPEC-CONCORDANCE-LANGUAGE.md) LEX-4) | Exists today for Nunes; make it standard for every witness |
| **C. Witness toolbar** | **Concordance** · **Ask** · **Issues** (`✕ n ⚠ n`) · **Export** · **Display ▾** · zoom controls ([SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) FV-3) | The only place these actions live. Sticky under the app bar while scrolling the page. |
| **D. Content** | Page view, or Source + Page ([SPEC-EDITOR.md](SPEC-EDITOR.md) ED-10) | — |

**Remove:** the header Ask, the header Export, and the separate TEI export button (S1, S4). The **Advanced editor** button becomes the **Edit source** toggle, which reads "Done editing" while on.

### 3.2 The Open menu (replaces the editor-tools card; S2)

```text
Open ▾
  File…                     (.txt, .hsms, .docx, page image, PDF)   ← was "Upload" + "Import .hsms"
  Folder of transcriptions… (batch)                                  ← was "Batch folder"
  New blank transcription                                            ← was "New blank scriptorium"
  ─────────
  Library…                                                           (goes to the Library tab)
  Samples ▸  Pedro Nunes, Tratado da sphera (1537)
             Simple layout
             Latin passage ({LAT.} span)
             Figures and diagrams
  ─────────
  Recent ▸   (last 5 workspaces from the workspace index)
```

**Export .hsms** moves into the Export sheet (§3.3).

**Opening never overwrites (S9).** Samples, Library entries, and New blank always open as a **new workspace** (`createWorkspace()` + `setActiveWorkspace()`). The previous workspace stays in Recent. Rule: no action outside the editor may change the active workspace's text.

### 3.3 One Export sheet (S4)

Grouped by purpose. Each format has a one-line description of when to use it.

| Group | Format | Extension | Source | Description (en) |
|-------|--------|-----------|--------|------------------|
| Edition | TEI XML (diplomatic) | `.xml` | `exportToTEIXML()` | For digital editions and archives |
| Edition | TEI XML (normalized) | `.xml` | `exportNormalizedTEI()` | Expanded abbreviations, modern word division |
| Page | Web page | `.html` | `exportToLegacyHTML()` | Opens in any browser; keeps the page layout |
| Page | Vector image | `.svg` | `exportToSvgDocument()` | For print and publication figures |
| Page | PNG / JPEG | `.png` `.jpg` | raster via `svgTextToRasterBase64()` | For slides and documents |
| Text | Plain text | `.txt` | existing | The HSMS source as plain text |
| Project | Transcription bundle | `.hsms` | bundle v2 | Source, page images and settings, to reopen later |

- Add `tei`, `tei-normalized`, and `hsms` to `EXPORT_FORMAT_OPTIONS` (`utils/exportFormats.ts`), with extension inference: `.xml` is ambiguous, so the explicit format wins.
- The default file name comes from the witness title (`exportBaseName()`), e.g. `Nunes_Tratado-da-sphera_fol3r.html`, not `Nunes_Demo`.
- If the transcription has **errors** (not warnings), show a non-blocking note: "This transcription has 1 error. Exported files may not open in other HSMS tools. Review issues · Export anyway" ([SPEC-VALIDATION.md](SPEC-VALIDATION.md) open question 3).
- Remove the "Legacy table layout" wording.

### 3.4 Empty and first-run states

- No workspace: show three large choices: **Open a file**, **Browse the Library**, **Try a sample (Pedro Nunes, 1537)**, plus one sentence on what the app does.
- First open of the Nunes sample: no issue badge (requires [SPEC-VALIDATION.md](SPEC-VALIDATION.md) VAL-30/31).

---

## 4. Display settings (S3)

### 4.1 Grouping, labels, defaults

Display settings move into a **Display ▾** popover (sheet on phones) with three groups and an optional preset row. Labels below are proposals. The "Meaning" column must be confirmed against `DisplaySettings` (`components/svgFacsimile/tokenRendering.ts`) before shipping, and every label goes through the HSMS terminology glossary (SPEC-I18N §7).

| Group | Current label | Proposed label | Helper text (one line) | Default (observed) |
|-------|---------------|----------------|------------------------|--------------------|
| **Text** | Expansions (<>) | Show expanded abbreviations | Letters supplied by the editor, shown in a lighter color | On |
| Text | Deletions (()) | Show deletions | Text the scribe or editor struck out | On |
| Text | Unicode diacritics | Combine diacritics | Show `n~` as ñ, `e~` as ẽ | On |
| Text | MUFI graphemes | Medieval letterforms | Long s, r rotunda and other MUFI characters | Off |
| Text | MUFI PUA font | Use medieval font | Needed for MUFI private-use characters | On |
| Text | Suppress otiose | Hide otiose strokes | Strokes with no abbreviating function | Off |
| **Layout** | Line numbers | Line numbers | — | On |
| Layout | Reading flow | Reading view (reflowed) | Text wraps to the screen instead of keeping the page layout | Off |
| Layout | Facsimile canvas | Show page image | Show the scan behind or beside the transcription | Off |
| Layout | Place figure | Edit figure positions | *Confirm meaning* | Off |
| Layout | SVG canvas | Vector page renderer | *Confirm meaning; consider moving to a developer setting* | On |
| **Compare** | Synoptic pane | Side-by-side modern text | *Confirm the difference from the next row* | Off |
| Compare | Modern text (line-by-line) | Modern text under each line | *Confirm* | Off |

**Presets** (optional, IA-P3): *Diplomatic* (expansions off, deletions on, medieval letterforms on), *Semi-diplomatic* (current defaults), *Reading* (expansions on, deletions off, reading view on). Selecting a preset sets the switches. Changing any switch shows "Custom".

### 4.2 Switch styling

- *Off* uses a neutral track (the muted token), *on* uses the accent. **No red** for off.
- The state is also shown by thumb position and an accessible state ([SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) A11Y-3). On phones each row also shows "On" or "Off" text.
- In edit mode the editor-tools card is gone (replaced by Open ▾), so the editor starts right below the toolbar ([SPEC-EDITOR.md](SPEC-EDITOR.md) ED-4).

---

## 5. Assistant answer card (S5)

These are fixes to the existing `ManuscriptChatbotDrawer` card rendering, aligned with SPEC-COPILOT §4 and §11.

| ID | Requirement | Acceptance |
|----|-------------|------------|
| IA-20 | The tier badge reads as words: "Exact count", "Pattern match", "Statistic", "Needs server" (localized), not "A · Exact". Tapping or hovering shows the one-line explanation from SPEC-COPILOT §4. Exports keep `tier A` in the footer. | Snapshot |
| IA-21 | Find out what "64%" is (router cosine score or Tier B precision). If it is router confidence, show it only when below the auto-dispatch threshold + 0.1, as "Best match for your question (64%) · Other readings ▾" with the top-3 alternatives. If it is precision, label it "~64% precision on reference set" (SPEC-COPILOT §12). Never show a bare percentage. | Snapshot for both cases |
| IA-22 | Hide the timing badge ("4.90 ms") unless `__DEV__` or a developer setting is on. | Release build snapshot |
| IA-23 | Overview chips show only the recipe name. Counts move to the chip's accessible label and tooltip ("Zipf · 62 word types"), or are removed if they aren't meaningful to a user. Decide per recipe from the chip's data source. | Snapshot |
| IA-24 | "Related forms" line for exact-form answers ([SPEC-CONCORDANCE-LANGUAGE.md](SPEC-CONCORDANCE-LANGUAGE.md) LEX-21). | — |

---

## 6. Sources tab (S6, S7)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| IA-30 | `LocalePicker` omits `PSEUDO_LOCALE` unless `__DEV__`. | Release build: no `[Ëñglîsh ~~~]` |
| IA-31 | The **language chip in the app bar** opens the full picker (SPEC-I18N §2.3, the "one-tap picker in the Studio header"). On the Sources tab the picker moves into a "Language" section below the documentation, not at the top. | Manual |
| IA-32 | Rename the tab from **Sources** to **About & manual**. Sections: *About this app* (2–3 plain sentences), *HSMS manual* (in-app reader, with anchors used by [SPEC-VALIDATION.md](SPEC-VALIDATION.md) VAL-23), *OSTA guide* (in-app page), *How to cite*, *Credits*, *Language*. | Snapshot |
| IA-33 | No repository paths or tool names in user-facing copy ("docs/OSTA-guide.md", "MCP: audit_hsms_syntax"). Link to in-app pages or public URLs. | `no-literal-string` lint plus a reviewer checklist item |
| IA-34 | Proposed intro (en, for review): "Transcription Conniption displays and checks transcriptions written in the HSMS format, the line-by-line system of the Hispanic Seminary of Medieval Studies. Open a transcription to see it laid out as a page, find words across it, and export it as TEI, HTML or images. Everything runs on your device." | Copy review |

---

## 7. Wording rules (apply across the app)

| Avoid (developer term) | Use (researcher term) |
|------------------------|-----------------------|
| Scriptorium (as a noun for the workspace) | Transcription |
| Parchment Sheet | Page |
| Transcription Code | Source |
| Advanced editor / Hide editor tools | Edit source / Done editing |
| Errors (n) when n counts warnings | Issues |
| Witness overview (chips header) | Quick questions |
| Upload | Open |
| Leaf [fol. 3r] | fol. 3r |

Every string goes through i18n keys (SPEC-I18N §5) and the HSMS terms glossary (SPEC-I18N §7).

---

## 8. Tests

| Test | Gate |
|------|------|
| Each action ID appears once in the rendered Studio tree (test over `testID`s) | Pass |
| Opening a sample or Library entry creates a new workspace, and the previous one is still in the index with unchanged text | Pass |
| Export sheet lists 8 formats; TEI round-trips through `ostaCorpusIntegration` | Pass |
| Release build: no pseudo-locale, no timing badge | Pass |
| Locale snapshots (`en`, `es-419`, `pt-BR`, `eu`, `en-XA`) of the app bar, toolbar, Display popover and Export sheet, with no truncation at +40% text length (SPEC-I18N §6) | Reviewed |

## 9. Rollout

| Phase | Scope | Status |
|-------|-------|--------|
| IA-P1 | Remove duplicates; open-as-new-workspace; Edit source toggle (§3.1, §3.2) | **Done** — Ask/Export live only on Witness Toolbar; samples/imports/library use `openAsNewWorkspace` |
| IA-P2 | Single Export sheet (§3.3); assistant card fixes (§5); Sources tab cleanup (§6) | **Partial** — 8-format sheet + critical-error gate shipped; assistant/Sources remain follow-ups |
| IA-P3 | Display popover with groups, labels, switch styling (§4); presets after a user check | **Partial** — `DisplaySettingsPopover` groups + neutral-off switches; presets deferred |

## 10. Open questions

1. Confirm the meaning of *Place figure*, *SVG canvas*, *Synoptic pane*, and *Modern text (line-by-line)* (§4.1) before renaming them.
2. Should the Library become a modal opened from Open ▾ instead of a tab? Keep the tab for now; revisit after the user tests in USABILITY-REMEDIATION §6.
