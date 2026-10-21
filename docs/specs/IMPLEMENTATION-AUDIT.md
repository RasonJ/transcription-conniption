# Implementation Audit: Usability Remediation

**Date:** 2026-10-21 · **Code:** commit `b8e0c8c3` (graph report) · **Specs:** repo copies dated 2026-10-20
**Method:** each requirement's status comes from (1) the implementation notes in the repo specs and (2) the symbols present in the graph report for `b8e0c8c3`. **Nothing here has been run or read in source yet.** "Claimed" means a spec or the graph says it exists, not that it works. The code pass (§5) turns claims into pass/fail.

---

## 1. Summary

Wave 1 of [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) was meant to fix the four "Broken" findings first. It is not complete, while work from later waves has shipped:

| Finding | Wave | State |
|---------|------|-------|
| 1. Page view cut off / unreadable on phones | W1 | **Open.** `FolioViewport` exists, but SPEC-FOLIO-VIEWPORT §0 says it is not wired into `SvgFacsimilePage` until FV-P2. Until it is, the page clips exactly as in the walkthrough. |
| 2. Validation panels disagree; blur gate | W1 | **Claimed fixed.** `validationStore` feeds banner and panel; compile reads the live buffer. Needs the V1/V2 regression test. |
| 3. Missed `{CW.}` error; `{GLR.}` mismatch; samples with warnings | W2/W4 | **Open.** No new rules (§3.3) are reported, no `check:mnemonics`, no sample cleanup. A mnemonic table (`HSMS_MNEMONICS`) appears in the graph, location unconfirmed. |
| 4. Spanish lemmas on Portuguese | W1 | **Claimed fixed** (LEX-P1, with a test). |
| 5. Issue counts, line labels, navigation | W1/W4 | **Partly.** `IssuesPanel` exists; "Edit line" / "Show on page" and the highlight hook are not reported. |
| 6. Plain-text editor | W1 | **Partly.** `SourceEditor` and `editorLineMap.ts` exist; ED-1 (spellcheck off) and ED-2 (gutter) are not confirmed. |
| 7. Duplicated actions, export paths, switches | W3 | **Mostly done** (IA-P1 done; 8-format export sheet; grouped Display popover with neutral switches). |
| 8. Assistant card badges and timer | W1 (IA-22) / W3 | **Open.** IA-20…24 listed as follow-ups. |
| 9. Library titles and grouping | W3 | **Mostly done** (catalog v2, grouping, isolated open). Witness card metadata not done. |
| 10. Accessibility | W2 | **P1 done** (primitives, lint as warn, focus trap on two sheets). |
| 11. Pseudo-locale and engineer copy | W1 (IA-30) | **Open.** |

---

## 2. Spec integrity

Three repo specs were cut down when implementation notes were added, and lost requirements that are not yet implemented:

| Spec | Repo size vs original | Requirements no longer in the repo copy |
|------|----------------------|------------------------------------------|
| SPEC-ACCESSIBILITY | 391 vs 916 words | A11Y-4 segmented controls, A11Y-5 tab names, A11Y-9 line-number exposure, A11Y-11 shortcuts sheet, A11Y-12 touch targets (partly folded into ActionButton) |
| SPEC-CONCORDANCE-LANGUAGE | 394 vs 1,523 words | LEX-11 group toggle, LEX-12 form variants, LEX-14 hit refs, LEX-15 scrollbar, LEX-16 sort, LEX-17 export, LEX-20/21 copilot consistency, LEX-5 uncertainty |
| SPEC-LIBRARY | 278 vs 985 words | LIB-2 title source order, LIB-5 metadata report, LIB-10 row layout, LIB-12 sort, LIB-13 search, LIB-21/22 Studio metadata and back-link |

Fixed in this pass: the restored copies keep every original requirement and add an "Implementation status" section with what the repo reports as shipped. One ID was reused: the repo's SPEC-LIBRARY calls workspace isolation **LIB-20**; in the full spec that is **LIB-15**, and LIB-20 is the witness-card metadata.

SPEC-ORNATE-INITIALS in the repo predates the period-profile addition. The merged copy keeps the repo's shipped notes (§9.1) and adds §3.2.0 period profile, §3.5 period styling, OI-PP and OI-P6.

---

## 3. Status by requirement

Legend: ✅ claimed shipped · 🟡 partial · ⬜ not started · ❓ unknown (not mentioned)

### SPEC-FOLIO-VIEWPORT

| ID | State | Note |
|----|-------|------|
| FV-1, 2, 4 | 🟡 | Component and `computeFitScale` exist; not mounted around the page |
| FV-3 | ⬜ | Zoom controls/shortcuts (`cycleZoomMode`, `clampZoom` exist in the component) |
| FV-5 | 🟡 | `belowLegibilityFloor` + Reading View prompt in the component; not reachable until mounted |
| FV-6 | ⬜ | Scale-aware anchors and `highlight()` |
| FV-7, 8, 9 | ❓ | |

**Rollout mismatch:** the spec's §8 puts FV-1/2/4/6 in FV-P1, but its §0 defers wiring to FV-P2. FV-P1's exit (Playwright bounds test at 8 widths) cannot pass until the viewport is mounted.

### SPEC-VALIDATION

| ID | State | Note |
|----|-------|------|
| VAL-1 | 🟡 | Store shipped and shared; the lint rule restricting `lintHsmsTranscription` imports is not reported. `EditorLinterBanner` still calls it in the baseline graph; confirm it now reads the store |
| VAL-2 | ❓ | Revision stamping / stale display |
| VAL-3 | ✅ | Lexical 150 ms + structural 400 ms, blur gate removed |
| VAL-4, 5 | ❓ | |
| VAL-10…13 | 🟡 | `HSMS_MNEMONICS` / `BY_CODE` seen; derivation of `ENVELOPE_MAP` etc. and `check:mnemonics` not reported |
| §3.3 rules | ⬜ | No new codes reported, including `HSMS-E-CW-PLACEMENT` (the walkthrough's missed error) |
| VAL-20…26 | 🟡 | `IssuesPanel` with `severityWord()` exists; Edit line / Show on page / Fix / Manual links not reported |
| VAL-30, 31 | ⬜ | Sample cleanup and the `{GL. [^…]}` rewrite |

### SPEC-EDITOR

| ID | State | Note |
|----|-------|------|
| ED-1…6 | ❓ | `SourceEditor` exists; spellcheck, gutter and layout not stated. The rollout puts all of ED-1…6 in P1 |
| ED-10…13 | 🟡 | Foundation only: `utils/editorLineMap.ts` (`buildSourceLineMap`) |
| ED-20…24 | ⬜ | The repo note files mnemonic completion under ED-P2; it is ED-21 in ED-P3 |

### SPEC-CONCORDANCE-LANGUAGE

LEX-1, 2, 3, 6, 10 ✅ (with `lemmaLanguageGating.test.ts`). Everything else ⬜. Castilian parity test not yet run.

### SPEC-STUDIO-IA

| Area | State |
|------|-------|
| §3.1 regions, §3.2 open-as-new-workspace (`openAsNewWorkspace`) | ✅ claimed |
| Open ▾ menu with Samples and Recent | ❓ (duplicates removed; menu not described) |
| §3.3 Export sheet, 8 formats, error note | ✅ claimed |
| §3.4 empty state | ❓ |
| §4 Display popover groups + neutral switches | ✅ claimed; presets ⬜ |
| §5 IA-20…24 assistant card | ⬜ |
| §6 IA-30…34 Sources page, pseudo-locale | ⬜ |
| §7 wording | ❓ |

### SPEC-LIBRARY

See the status table in the restored spec: LIB-1, 3, 4, 11, 14, 15 ✅ claimed; LIB-10 ❓; LIB-2, 5, 12, 13, 20–22 ⬜.

### SPEC-ACCESSIBILITY

A11Y-1, 2 (warn), 3 ✅; A11Y-6 🟡 (two of five dialogs); others ⬜.

### SPEC-ORNATE-INITIALS

| Phase | State |
|-------|-------|
| OI-0 font inventory | ⬜ |
| OI-PP period profile | ⬜ (`deriveTraditionFromRmk` covers medium + ≤ 1500) |
| OI-P1 scene builder + 4 adapters | ✅ claimed. Dead code remains: `pickLetterform`, `matrixOrnaments`, `ILLUMINATED_THEMES`, `ornateInitialInventory.ts`. Palette is `PIGMENT_PALETTE` in `scene.ts` rather than its own module (fine) |
| OI-P2…P6 | ⬜ |

---

## 4. Recommended order from here

1. **Mount `FolioViewport`** around both `SvgFacsimilePage` variants and remove the `overflow-x: hidden` ancestor. This is the most visible open defect. Then add the Playwright bounds test.
2. **Release-build leaks:** IA-30 (pseudo-locale), IA-22 (timer), ED-1 (spellcheck). Each is a few lines.
3. **VAL-P2/P3 minimum:** `HSMS-E-CW-PLACEMENT`, `HSMS-E-BRACE-UNCLOSED` regression, `HSMS-I-EXTENSION` for `GLR`, Nunes sample rewrite, `check:mnemonics`.
4. **VAL-21/22** row actions (Edit line / Show on page) on top of `editorLineMap.ts` and the FV-6 highlight hook.
5. Remove the dead initial code; then OI-0 and OI-PP.
6. Promote the a11y lint rule to error once remaining `Pressable`s are migrated.

---

## 5. Code pass still to do

With the repo reachable:

- Run `npm test`, `npm run lint`, `size:check`, `check:tiers`, `i18n:check` and record results here.
- Grep for each "claimed" symbol and its call sites (e.g. is `FolioViewport` imported anywhere; does `EditorLinterBanner` still import `lintHsmsTranscription`; is `PSEUDO_LOCALE` still offered in release; is `spellCheck={false}` on the editor input).
- Replay the walkthrough at 375 / 705 / 1440 px against the definition of done in USABILITY-REMEDIATION §5.
- Replace every 🟡 / ❓ above with pass or fail.
