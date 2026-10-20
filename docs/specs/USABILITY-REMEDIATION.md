# Usability Remediation Plan

**Status:** Draft · **Owner:** TBD · **Last updated:** 2026-10-20
**Source:** hands-on walkthrough of the web build (`localhost:8081`, commit `41b6637d`) on 2026-10-20, tested at 705 px and 375 px; code graph at the same commit; HSMS manual. Annotated screenshots are in the "Transcription Conniption walkthrough" report.

This document maps each walkthrough finding to the spec that fixes it, sets the order of work, and defines when the whole effort is done. The detailed requirements, designs and tests live in the area specs.

---

## 1. Specs in this set

| Spec | Area | Requirement prefix |
|------|------|--------------------|
| [SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) | Fit, zoom and pan for the page view | `FV-` |
| [SPEC-VALIDATION.md](SPEC-VALIDATION.md) | Single validation pipeline, mnemonic registry, rules, diagnostics UI | `VAL-` |
| [SPEC-EDITOR.md](SPEC-EDITOR.md) | Source editor: gutter, spellcheck, linked views, typing help | `ED-` |
| [SPEC-CONCORDANCE-LANGUAGE.md](SPEC-CONCORDANCE-LANGUAGE.md) | Language-aware lemmas, KWIC drawer, export | `LEX-` |
| [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) | Screen structure, Open menu, Export sheet, display settings, assistant card, About page, wording | `IA-` (plus section refs) |
| [SPEC-LIBRARY.md](SPEC-LIBRARY.md) | Catalog metadata, grouping, opening witnesses | `LIB-` |
| [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) | Button/switch primitives, dialogs, language tags, contrast | `A11Y-` |

These sit alongside, and must stay consistent with, [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) (load tiers, size budget), [SPEC-I18N.md](SPEC-I18N.md) (all new strings are i18n keys; terms glossary) and [SPEC-COPILOT.md](SPEC-COPILOT.md) (answer card, tiers, exports).

---

## 2. Finding → spec map

| # | Finding (severity) | Fixed by | Key requirements |
|---|--------------------|----------|------------------|
| 1 | Page view cut off below ~740 px; unreadable on phones (**Broken**) | SPEC-FOLIO-VIEWPORT | FV-1, FV-2, FV-4, FV-5 |
| 2 | Banner and panel disagree; structural check waits for blur (**Broken**) | SPEC-VALIDATION | VAL-1, VAL-2, VAL-3, VAL-25 |
| 3 | Catchword in a column passes; `{GLR.}` renders but is flagged; samples non-standard (**Broken**) | SPEC-VALIDATION | VAL-10…13, rule table §3.3, VAL-30, VAL-31 |
| 4 | Spanish lemmas applied to Portuguese (**Broken**) | SPEC-CONCORDANCE-LANGUAGE | LEX-1…3, LEX-10, LEX-20 |
| 5 | "Errors (1)" counts warnings; unlabeled line numbers; jump doesn't highlight or reach source (**Confusing**) | SPEC-VALIDATION · SPEC-FOLIO-VIEWPORT | VAL-21, VAL-22, VAL-24; FV-6, §4.4 |
| 6 | Plain-text editor: no gutter, spellcheck on, can't see source and page together (**Confusing**) | SPEC-EDITOR | ED-1…4, ED-10…12 |
| 7 | Duplicated actions, mixed samples/actions, 13 flat switches, three export paths, jargon (**Confusing**) | SPEC-STUDIO-IA | §3.1, §3.2, §3.3, §4, §7 |
| 8 | Assistant card: unexplained "A · Exact", "64%", dev timer, chip counts (**Polish**) | SPEC-STUDIO-IA §5 · SPEC-CONCORDANCE-LANGUAGE | IA-20…24, LEX-21 |
| 9 | Library titles are file paths; ". desconocido"; ungrouped *Celestina* (**Polish**) | SPEC-LIBRARY | LIB-1…4, LIB-10, LIB-11, LIB-20 |
| 10 | Controls exposed as generic elements; unlabeled switches and tabs (**Polish**, high impact) | SPEC-ACCESSIBILITY | A11Y-1…5 |
| 11 | Pseudo-locale visible; engineer copy on Sources (**Polish**) | SPEC-STUDIO-IA §6 | IA-30…34 |
| — | First review: mnemonic autocomplete, MUFI palette, brace pairing, manual-linked messages | SPEC-EDITOR §3.3 · SPEC-VALIDATION §3.4 | ED-20…24, VAL-23 |
| — | Opening a sample or Library entry replaces the active workspace (observed during walkthrough) | SPEC-STUDIO-IA §3.2 · SPEC-LIBRARY | IA open rule, LIB-15 |

---

## 3. Order of work

Ordered by user impact first, then by dependency. Each phase is shippable on its own.

| Wave | Phases | Why now | Depends on |
|------|--------|---------|------------|
| **W1 — Correctness** | FV-P1 · VAL-P1 · LEX-P1 · ED-P1 · IA-30, IA-22 | Fixes the four "Broken" findings and the cheap release-build leaks (pseudo-locale, timer, spellcheck). Researchers currently see wrong lemma counts, hidden marginalia and contradictory validation. | — |
| **W2 — Foundations** | A11Y-P1 · VAL-P2 | Shared `ActionButton`/`LabeledSwitch` primitives before any UI is rebuilt; mnemonic registry before editor completion and new rules. Sample cleanup removes the warning on first open. | W1 |
| **W3 — Structure** | IA-P1 · IA-P2 · LIB-P1 · FV-P2 | One place per action, single Export sheet with TEI, open-as-new-workspace, readable Library rows, zoom controls. | A11Y-P1 |
| **W4 — Editing flow** | VAL-P3 · ED-P2 · LEX-P2 · A11Y-P2 | Manual-linked rules with quick fixes, side-by-side linked views, language override, dialog focus behavior. | VAL-P2, FV-P1 |
| **W5 — Refinement** | ED-P3 · IA-P3 · LEX-P3 · LIB-P2/P3 · FV-P3 · A11Y-P3 · VAL-P4 | Typing help, display presets, KWIC layout and export, Library grouping, native zoom parity, contrast audit, worker offload if measured. | W4; ED-P3 needs the editor engine decision (SPEC-EDITOR §4.1) |

```text
W1 ─► W2 ─► W3 ─► W4 ─► W5
FV-P1        A11Y-P1 ─► IA-P1/P2, LIB-P1
VAL-P1 ─► VAL-P2 ─► VAL-P3 ─► (VAL-P4)
                 └──────────► ED-P3
ED-P1 ──────────────► ED-P2 (needs FV-P1, VAL-P1)
LEX-P1 ─► LEX-P2 ─► LEX-P3
```

---

## 4. Cross-cutting rules

| Rule | Applies to |
|------|-----------|
| All new UI strings are i18n keys with named placeholders; HSMS terms come from the terms glossary (SPEC-I18N §5, §7). New keys ship with `_status: "draft"` in non-English locales. | All specs |
| New modules declare their load tier (SPEC-LIGHTWEIGHT §3). Reader-path additions (FolioViewport, validation store, registry) are Tier 0 and must keep `size:check` within budget; editor engine, quick fixes, manual reader and palette are Tier 1 (lazy). | FV, VAL, ED |
| All new controls use `ActionButton` / `LabeledSwitch` (SPEC-ACCESSIBILITY A11Y-1, A11Y-3). | IA, LIB, ED, LEX |
| No action outside the editor changes the active workspace's text (SPEC-STUDIO-IA §3.2). | IA, LIB |
| Every derived result a researcher might cite (concordance, assistant, export) names its method, source data version and parser version. | LEX, IA §5 |
| Manual references use `docs/HSMS-manual.md` section numbers and resolve to an anchor in the in-app manual (SPEC-VALIDATION VAL-23). | VAL, ED, IA |

---

## 5. Definition of done (whole effort)

- [ ] Walkthrough replay at 375, 705, 1024 and 1440 px: no clipped content; every marginal element reachable (FV Playwright suite green).
- [ ] With the editor focused, banner, panel and badge always agree; no "Parsing…" indicator that fails to resolve (VAL regression tests green).
- [ ] The `{CW. a` case from the walkthrough is reported with code, manual §4.2 and a fix.
- [ ] Every bundled sample opens with zero errors and zero warnings.
- [ ] Nunes concordance contains no Spanish lemmas; OSTA Castilian concordance snapshots unchanged.
- [ ] Each action appears once; TEI and `.hsms` are in the Export sheet; samples and Library open as new workspaces.
- [ ] Release build shows no pseudo-locale, no timing badge, no repository paths.
- [ ] axe: 0 critical/serious violations on Studio, Library, About and every drawer; keyboard-only script passes.
- [ ] Library shows titles and authors (no path titles in the top 100 rows; ". desconocido" gone); *Celestina* grouped.
- [ ] `size:check`, `check:tiers`, `i18n:check`, `check:mnemonics` all pass.

---

## 6. Validation with users

After W3, run a task-based test with 4–5 researchers (paleographers or historical linguists; at least one who works in Portuguese or Catalan, one on a phone or tablet):

1. Open the Nunes sample and find the marginal gloss on fol. 3r.
2. Fix a seeded transcription with three errors (unclosed brace, catchword inside a column, period inside a remark field).
3. Find every occurrence of a word and export the list.
4. Export one folio as TEI and as an image for a paper.
5. Find a specific *Celestina* act in the Library and open it without losing the current work.

Record time on task, errors, and where each participant hesitated. Feed the results into SPEC-STUDIO-IA open questions (display presets, Library as tab vs modal) and SPEC-FOLIO-VIEWPORT open question 2 (phone default view).

---

## 7. Not covered by the walkthrough

PDF / page-image ingest (needs the backend flag), batch folder processing, facsimile images attached to folios, native iOS/Android builds, and the copilot beyond one question. Each needs its own pass before release; SPEC-PDF-INGEST already covers ingest.
