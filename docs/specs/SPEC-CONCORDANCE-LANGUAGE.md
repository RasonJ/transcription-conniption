# Spec: Language-Aware Lemmatization and Concordance Usability

**Status:** Approved · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-I18N.md](SPEC-I18N.md) §1, §8 · [SPEC-COPILOT.md](SPEC-COPILOT.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) §4.2
**Fixes:** Walkthrough finding 4 (Spanish lemmas applied to Portuguese text; KWIC layout, line refs, export), plus finding 8 (Copilot word counts vs concordance lemma counts)

---

## 1. Goal

Ensure the concordance index and Copilot recipes deliver accurate, citable results by enforcing **language-gated lemmatization**. Tokens are mapped to lemmas only when an authorized `LemmaSource` exists for that token's / witness's effective language. Otherwise, the engine groups by normalized surface form and explicitly notifies the user.

### Non-goals

- Building a Portuguese, Galician, Catalan or Latin lemmatizer in this spec.
- Changing the OSTA Old Spanish dictionary codec (`lemmaDictionaryCodec.ts`).

---

## 2. Technical Requirements & Architecture

### 2.1 Language-gated lemma lookup (`LEX-1` – `LEX-6`)

1. **Lemma Source Registry (`utils/lemma/sources.ts`)**:
   - `LemmaSource` instances register explicit `WitnessLanguage` codes (`SPN` | `PRT` | `GAL` | `CAT` | `LAT`).
   - The OSTA dictionary (`osta-old-spanish` v2.0) is registered **only** for `SPN`.

2. **Effective Token Language (`utils/lemma/effectiveLanguage.ts`)**:
   - Stack: `workspaceOverride` → innermost `token.envLayers` (`language_span`) → `block.language` → detected witness language.
   - Mnemonics: `LAT`/`LA` → `LAT`; `POR`/`PRT`/`PT` → `PRT`; `SPA`/`SPN`/`ES` → `SPN`; etc.

3. **Gated grouping (`utils/concordance.ts`)**:
   - `buildLanguageAwareConcordance` / `buildConcordance` call `lemmaSourceRegistry.getSourceForLanguage(witnessLang)`.
   - If no source: key = `foldForSearch(surface)`; `mode = "word_form"`.
   - If source lookup hits: key = normalized lemma; `mode = "lemma"`.
   - Method line via `formatConcordanceMethodLine` (LEX-10).
   - Cache keys include source id + version + `lemmaDictionaryGeneration()` (LEX-6).

4. **Acceptance (Nunes / Portuguese)**:
   - No Spanish lemma collapse of *he* → *haber*.
   - Header: *"N word forms · no dictionary for PRT"*.

### 2.2 Concordance drawer (LEX-10+)

- Method line under the title (implemented).
- KWIC three-column layout, folio:line anchors, CSV export → LEX-P3.

---

## 3. Module map

```text
utils/lemma/sources.ts           # LemmaSource registry + osta-old-spanish
utils/lemma/effectiveLanguage.ts # resolveEffectiveTokenLanguage
utils/concordance.ts             # buildLanguageAwareConcordance, formatConcordanceMethodLine
components/ConcordanceDrawer.tsx # method line + dialog focus trap
```

---

## 4. Tests

| Test | Gate |
|------|------|
| `__tests__/lemmaLanguageGating.test.ts` — registry, effective lang, PRT gating | Pass |
| Castilian parity when dictionary loaded | LEX-P2 |
| Override / mixed LAT spans | LEX-P2 |

---

## 5. Rollout

| Phase | Scope |
|-------|-------|
| LEX-P1 | LEX-1…3, 6, 10 (correctness + method line) — **done** |
| LEX-P2 | LEX-4, 5, 12, 14, 20–21 (override, variants UI, copilot) |
| LEX-P3 | LEX-13, 15–17 (KWIC columns, sort, export) |
