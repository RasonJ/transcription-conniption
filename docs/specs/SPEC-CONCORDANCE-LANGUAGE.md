# Spec: Language-Aware Lemmatization and Concordance Usability

**Status:** Approved, partly implemented · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-I18N.md](SPEC-I18N.md) §1 and §8 (witness language) · [SPEC-COPILOT.md](SPEC-COPILOT.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) §4.2 (lazy lemma dictionary)
**Fixes:** walkthrough finding 4 (Spanish lemmas on Portuguese text; KWIC layout, line refs, export), plus the related part of finding 8 (assistant word-form counts don't match concordance lemma counts)

---

## 1. Goal

The concordance and every lemma-based copilot recipe give results a researcher can cite. A word gets a lemma only when there is a lemma source for that word's language. Otherwise the app groups by normalized word form and says so. The KWIC drawer meets scholarly conventions: keyword column, exact references, export.

### Non-goals

- Building a Portuguese, Galician, Catalan or Latin lemmatizer in this spec. §6 covers how one plugs in later, on device or as SPEC-LIGHTWEIGHT Tier 2 backend capability.
- Changing the OSTA Old Spanish dictionary or its codec (`lemmaDictionaryCodec.ts`).

---

## 2. Findings (observed 2026-10-20, Pedro Nunes, *Tratado da sphera*, fol. 3r)

| # | Observation | Evidence |
|---|-------------|----------|
| L1 | 5 of the 6 hits filed under **haber** are the Portuguese copula *he* ("é"): "a primeira **he** sustancial", "que **he** o primeyro mobile". Only "DUas diuisoẽs **ha**" is arguably *haver*. | Walkthrough screenshot "concordance" |
| L2 | Other mappings are wrong or truncated: **atar** (from *ate* = "até"), **acid** (from *acidẽtal*), **tu**, **dar**, **saber** (probably *se*/*sabe* collisions). | Walkthrough concordance list |
| L3 | `buildConcordance()` calls `detectWitnessLanguage()` and `stopwordsFor()`, then `lookupHsmsLemma()` / `normalizeLemma()` **for every token, whatever the language**. The only lemma source is the OSTA Old Spanish dictionary (`hsmsLemmaIndex.v2.tsv`). SPEC-I18N §10 already expects Nunes to be detected as Portuguese, so detection works and the lookup is the part that doesn't check it. | Code graph call edges at `41b6637d`; confirm in `utils/concordance.ts` |
| L4 | Language spans inside a witness (`{LAT.}`, `{PRT.}`, … per manual §3.236) aren't used to choose a lemma source per token. | Code review needed; `innerLanguageCode()` exists in `app/(tabs)/index.tsx` for rendering |
| L5 | The KWIC keyword isn't in a fixed column. Hits show "[fol. 3r]" but no line number. The scrollbar covers the frequency counts. There's no export from the drawer. | Walkthrough |
| L6 | The assistant reports "sphera: 4" (exact word form) while the concordance shows "esfera: 6" (lemma; includes *spheras* ×2). Neither explains the difference. | Walkthrough "copilot" vs "concordance" |
| L7 | The drawer header says "53 indexed terms", but whether those are lemmas or word forms, and which dictionary was used, isn't shown. | Walkthrough |

---

## 3. Requirements

### 3.1 Lemma gating

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LEX-1 | Lemma sources are registered by language: `LemmaSource { id, version, languages: WitnessLanguage[], load(), lookup(form) }`. The OSTA dictionary is registered as `osta-old-spanish` for the Old Castilian / Spanish witness language only. | Unit test: the registry returns no source for Portuguese, Galician, Catalan, Latin |
| LEX-2 | Every token is assigned an effective language: the innermost language mnemonic around it (`{LAT.}`, `{PRT.}`, …, mapped through the mnemonic registry's `bcp47`, [SPEC-VALIDATION.md](SPEC-VALIDATION.md) §4.2), or else the witness language. | Unit test with a Castilian witness containing a `{LAT.}` span: the Latin tokens get no Spanish lemma |
| LEX-3 | A token gets a lemma only when a source exists for its effective language. Otherwise `lemma = null` and the grouping key is the normalized word form (`foldForSearch()`, accent-folded, `u/v`, `i/j`, `y` normalization as already used for search). | **Nunes golden:** no entry `haber`, `atar`, `acid`, `dar`, `saber`, `tu`; `he` is grouped as a word form (6 hits) |
| LEX-4 | Witness language can be overridden per workspace: a "Language: Portuguese (detected) ▾" chip in the concordance header and in the witness header card. The override is saved in the workspace record (`witnessLanguageOverride`) and invalidates concordance and facet caches. | Changing it to Old Spanish brings Spanish lemmas back, with a warning in the method line |
| LEX-5 | When detection confidence is low (the `WitnessLanguageGuess` score is below a threshold; define it from the golden set), the chip reads "Language: uncertain — choose" and lemma mode stays off until the user picks one. | Golden: a 2-line mixed fixture shows "uncertain" |
| LEX-6 | Lemma cache keys include the lemma source id and version and the effective-language map hash, as well as the existing `manuscriptIdentity` + `PARSER_VERSION` + `lemmaDictionaryGeneration()`. | Cache test: an override change invalidates |

### 3.2 Concordance drawer

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LEX-10 | Header line states the grouping: "53 lemmas · Old Spanish dictionary (OSTA v…)" or "61 word forms · no dictionary for Portuguese". | Snapshot per language |
| LEX-11 | **Group by: Lemma \| Word form** toggle. Lemma is disabled, with the reason as helper text, when no source applies. | Snapshot |
| LEX-12 | Each lemma entry lists its word forms with counts: "esfera — sphera 4 · spheras 2". Word-form entries list spelling variants that fold to the same key: "he 6". | Unit test on the variant aggregation |
| LEX-13 | KWIC rows use a three-column layout: left context right-aligned, keyword centered in a fixed column, right context left-aligned. Monospace or tabular figures; the context width adapts to the drawer (≈ 40 / 12 / 40 characters at 705 px). | Visual snapshot; the keyword column's x position is the same on every row |
| LEX-14 | Every hit shows "fol. 3r:9" (folio and manuscript line). Tapping it opens Page view at that line with a highlight ([SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) §4.4). | Playwright |
| LEX-15 | Counts are never covered by the scrollbar (`paddingRight` ≥ scrollbar width; numbers use tabular figures). | Visual check |
| LEX-16 | Sort: frequency (default), alphabetical (witness collator `witnessCollator()`), first occurrence. Filter matches lemma and word forms. | Unit test |
| LEX-17 | **Export** CSV/TSV from the drawer, in the same format as copilot exports (SPEC-COPILOT, Exports row): header, rows (`lemma, form, folio, line, left, keyword, right`), method line ("Grouped by word form; no lemma source for Portuguese; parser vN"), recipe-style footer (`concordance group=form lang=pt`). | Deterministic export test (byte-identical on rerun) |

### 3.3 Copilot consistency

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LEX-20 | Lemma-based recipes (`Top lemmas`, `search.kwic` with `lemma=`, collocations by lemma) use the same gating. When no lemma source applies, they answer by word form and the method line says so. A recipe that *requires* lemmas returns its "none" card with the reason. | Golden copilot answers for Nunes |
| LEX-21 | Exact word-form answers (`stats.term_frequency word=…`) add a "Related forms" line from the concordance aggregation: "Exact form only. Related: spheras (2)". The "Open concordance" button opens the drawer filtered to that entry. | Snapshot |

---

## 4. Design

```text
utils/lemma/
  sources.ts        # LemmaSource registry; registers osta-old-spanish (wraps hsmsDictionary.ts)
  effectiveLanguage.ts   # token → WitnessLanguage using block/span language tags + witness language/override
utils/concordance.ts
  buildConcordance(parsed, { languageOverride? })
    lang = override ?? detectWitnessLanguage(...)
    for token: effLang = effectiveLanguage(token, lang)
               src = lemmaSourceFor(effLang)       // may be null
               key = src ? normalizeLemma(src.lookup(form) ?? form) : foldForSearch(form)
               entry[key].forms[form]++
  returns { mode: "lemma" | "form" | "mixed", sources: [{id, version, langs}], entries }
```

`mode = "mixed"` when some tokens were lemmatized and others weren't (e.g. a Castilian text with Latin passages). The header then says "Lemmas for Old Spanish; Latin passages by word form".

`resolveLemma()` in `hsmsDictionary.ts` currently has no callers outside its own file (code graph). Fold it into the `osta-old-spanish` source or delete it.

---

## 5. Tests

| Test | Gate |
|------|------|
| Nunes golden: concordance has no Spanish lemmas; `he` = 6 as a word form; header says "no dictionary for Portuguese" | Pass |
| OSTA Castilian golden files: results **identical** to today's (parity with the SPEC-LIGHTWEIGHT §4.2 snapshot) | Pass |
| Castilian + `{LAT.}` span fixture: Latin tokens are word forms; mode = mixed | Pass |
| Override to Old Spanish on Nunes: lemmas return; method line carries the override note | Pass |
| KWIC column alignment snapshot at 375 / 705 / 1440 | Reviewed |
| Drawer export deterministic | Pass |

## 6. Future lemma sources

A Portuguese/Galician or Latin source plugs in by registering a `LemmaSource`. Options to evaluate, none committed: a compact on-device list built from an open-licensed historical Portuguese corpus (check license and size against SPEC-LIGHTWEIGHT budgets), or a Tier 2 backend capability `lemmatize` behind `AnalysisProvider`. Either way, the method line names the source and version.

## 7. Rollout

| Phase | Scope |
|-------|-------|
| LEX-P1 | LEX-1…3, 6, 10, 11, 20 (correctness first) |
| LEX-P2 | LEX-4, 5 (override, uncertainty), 12, 14, 21 |
| LEX-P3 | LEX-13, 15, 16, 17 (KWIC layout, sort, export) |

## 8. Open questions

1. Old Galician-Portuguese vs Portuguese: does `detectWitnessLanguage()` tell them apart, and does it matter before a lemma source exists? Probably not until §6.
2. Should "mixed" mode be allowed at all, or should the user choose all-lemma (with unlemmatized forms passed through) vs all-form? Recommended: allow mixed, and label it clearly.

---

## 9. Implementation status (2026-10-20, from the repo)

What the repo copy of this spec reports as done. Not yet checked against the code.

| Item | Status |
|------|--------|
| LEX-1 `LemmaSource` registry (`utils/lemma/sources.ts`); `osta-old-spanish` v2.0 registered for `SPN` only | Shipped |
| LEX-2 effective token language (`utils/lemma/effectiveLanguage.ts`): workspace override → `envLayers` language span → `block.language` → detected witness language | Shipped |
| LEX-3 gated grouping in `buildLanguageAwareConcordance` / `buildConcordance`; `mode` = `lemma` or `word_form` | Shipped |
| LEX-6 cache key includes source id + version + `lemmaDictionaryGeneration()` | Shipped |
| LEX-10 method line (`formatConcordanceMethodLine`) under the drawer title | Shipped |
| Test `__tests__/lemmaLanguageGating.test.ts` (registry, effective language, PRT gating) | Shipped |
| LEX-4, 5, 11, 12, 14, 20, 21 (override UI, uncertainty, group toggle, variants, hit refs, copilot consistency) | LEX-P2, not started |
| LEX-13, 15–17 (KWIC columns, scrollbar, sort, export) | LEX-P3, not started |
| Castilian snapshot parity; `{LAT.}` mixed-mode fixture | Not yet tested |
