# Spec: Multilingual Research Copilot with Precompiled Recipes

**Status:** Approved, Implemented · **Owner:** Lead AI Engineer · **Last updated:** 2026-10-20
**Related:** [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) · [SPEC-I18N.md](SPEC-I18N.md) · [SPEC-PDF-INGEST.md](SPEC-PDF-INGEST.md) · [REASONING-GRAPH.md](../REASONING-GRAPH.md) · [AZURE_HSMS_AGENT_ORCHESTRATION.md](../AZURE_HSMS_AGENT_ORCHESTRATION.md) · [ARCHITECTURE.md § Local manuscript assistant](../ARCHITECTURE.md)

---

## 1. Goal

Turn the existing **Ask** drawer (folio regex fast path → 5-intent hash-embed classifier → passage search) into a research copilot that answers the questions paleographers, historical linguists, and corpus linguists actually ask of HSMS transcriptions, in any Tier 1 language, offline, in milliseconds.

The key idea is **recipes**: each common question family is a precompiled, deterministic analysis over the parsed witness. The copilot's job is to route a natural-language question (in Spanish, Portuguese, Catalan, Galician, Basque, or English) to the right recipe, fill its parameters, run it, and present a reproducible, citable result.

### Principles

1. **Deterministic, not generative.** No on-device LLM. Every answer is computed from the markup and can be reproduced by re-running the same recipe id + params + parser version.
2. **Honest about evidence.** Every answer carries an evidence tier (§4) saying whether it is exact from markup, a lexical heuristic, a statistic, or something that needs the server.
3. **Markup first.** HSMS already encodes most of what paleographers ask about (hands, deletions, reconstructions, initials, glosses). Prefer token types over string guessing.
4. **Lightweight.** The copilot is a Tier 1 lazy module (SPEC-LIGHTWEIGHT §3). Nothing loads until the drawer opens.

### Non-goals

- Free-form chat, summarization, or translation of the witness.
- Part-of-speech tagging, clause parsing, or dialect classification on device. These are backend recipes (Tier D).

---

## 2. Current state

| Piece | File | Keep / change |
|-------|------|---------------|
| Folio fast path (`go to fol. 2v`) | `utils/manuscriptSearch.ts` `resolveFolioJump` | Keep; add localized verb patterns (*ir a*, *ir para*, *anar al*, *joan*) |
| Intent prototypes (5, English) | `constants/manuscriptIntents.ts` | Replace with the recipe catalog (§5) |
| Hash-embed (FNV-1a trigram, 384-d) | `utils/embeddings/hashEmbed.ts` | Keep. Character trigrams work across Romance languages and on accent-stripped text |
| Cosine classifier, threshold 0.55 | `utils/embeddings/intentClassifier.ts` | Keep; per-locale prototype matrices; recalibrate threshold per locale |
| Passage vector search | `utils/manuscriptVectorIndex.ts` | Keep as the fallback recipe `search.passages` |
| Drawer UI | `components/ManuscriptChatbotDrawer.tsx` | Rebuild around result cards (§8) |

---

## 3. Architecture

```text
 query (any Tier 1 language)
   │
   ▼
 normalize ─ NFD, strip marks, lowercase, collapse spaces          (SPEC-I18N §8)
   │
   ├─► DSL fast path: input parses as a copilot query expression?  (§10)  ──► executor
   ├─► Folio fast path: localized "go to fol. 2v" patterns                 ──► navigate
   │
   ▼
 Router: cosine vs recipe prototype matrix (UI locale ∪ en ∪ witness-language locale)
   │      top-1 ≥ threshold? else show top-3 recipe chips + passage search
   ▼
 Slot extraction: localized grammars fill params (lemma, graph, folio range, window, lang)
   │      missing required slot → inline prompt chip ("Which word?")
   ▼
 Executor: recipe.run(facetIndex, params) via AnalysisProvider (local | remote)
   │
   ▼
 Answer card: localized template + table/KWIC/chart + method line + tier badge + export
```

### 3.1 Modules (all Tier 1, lazy)

```text
utils/copilot/
  catalog/            # recipe definitions, one file per category (§5)
  router.ts           # normalization, locale union, classify, top-k
  slots.ts            # slot grammars per locale
  dsl.ts              # tiny query language (§10)
  facetIndex.ts       # per-witness precomputed structures (§6)
  precompute.ts       # idle-time scheduler + cache (§7)
  executors/          # tierA.ts tierB.ts tierC.ts
  stats.ts            # TTR/STTR, hapax, PMI, t-score, log-likelihood G², n-grams
  graphPatterns.ts    # configurable graph/grapheme pattern sets per witness language
i18n/locales/*.json   # copilot.* keys: triggers, templates, slot words
scripts/
  compile-copilot.ts  # build-time validation + prototype emission (§7.1)
```

---

## 4. Evidence tiers

Shown as a badge on every answer and in every export.

| Tier | Badge | Meaning | Example |
|------|-------|---------|---------|
| **A** | Exact | Counted directly from HSMS token or block types. Correct if the transcription is. | Scribal vs editorial deletions; insertions by hand 2 |
| **B** | Heuristic | Pattern matching over diplomatic surface forms (regex, closed word lists). Precision varies; examples shown so the researcher can judge. | *nn* vs *n~* for /ɲ/; *enel*/*delos* contractions |
| **C** | Statistic | Computed measure over the word stream (one witness or the local registry). | TTR, hapax, PMI, top n-grams |
| **D** | Needs server | Requires models or corpora not on device. Shown with "Needs server processing" and, where possible, a local Tier B approximation. | Enclisis in main vs subordinate clauses (needs parsing) |

When a question maps to Tier D and the backend is off, the card still answers the **approximable part** (e.g. "Here are all verb + *-l/-lo/-la* forms found by pattern (Tier B). Splitting them by clause type needs server processing.").

---

## 5. Recipe schema

```typescript
interface Recipe<P = Record<string, unknown>, R = unknown> {
  id: string;                         // "corr.deletions_scribal_vs_editorial"
  version: number;                    // bump when output semantics change
  category: RecipeCategory;           // paleography | linguistics | corpus | navigation | ingest
  tier: "A" | "B" | "C" | "D";
  /** Localized trigger phrases; ≥ 6 per Tier 1 locale. Keys live in i18n catalogs. */
  triggers: MessageKey;               // copilot.recipe.<id>.triggers  (array-valued)
  slots: SlotSpec[];                  // required/optional params with types
  requires: Capability[];             // SPEC-LIGHTWEIGHT §5
  precompute: "eager" | "on_demand";  // eager = zero-param, run at idle (§7.2)
  run(ctx: RecipeContext, params: P): R | Promise<R>;
  present: {
    view: "count" | "table" | "kwic" | "distribution" | "chart";
    template: MessageKey;             // copilot.recipe.<id>.answer (ICU, per locale)
    columns?: MessageKey[];
  };
  /** Human-readable method; rendered into exports and the method line. */
  method: MessageKey;
}

type SlotSpec =
  | { name: "lemma" | "word"; type: "string"; required: boolean }
  | { name: "graphSet"; type: "enum"; values: string[] }      // e.g. "palatal_nasal"
  | { name: "range"; type: "folioRange" }                     // fol. 3r–10v, "quire 2"
  | { name: "window"; type: "int"; default: 5; min: 1; max: 10 }
  | { name: "lang"; type: "hsmsLang" }                        // LAT, ARG, …
  | { name: "hand"; type: "int" }
  | { name: "n"; type: "int"; default: 3; min: 2; max: 5 }
  | { name: "scope"; type: "enum"; values: ["witness", "registry"] };
```

### 5.1 Example: one recipe, six languages

```jsonc
// en.json
"copilot.recipe.corr.deletions_scribal_vs_editorial.triggers": [
  "show scribal deletions versus editorial deletions",
  "where did the scribe expunge or strike through text",
  "punteado tachado scribal cancellations",
  "compare (^text) and (text) deletions",
  "list scribal corrections",
  "editorial cancellations"
],
"copilot.recipe.corr.deletions_scribal_vs_editorial.answer":
  "{scribal, plural, one {# scribal deletion} other {# scribal deletions}} and {editorial, plural, one {# editorial deletion} other {# editorial deletions}} across {folios, plural, one {# folio} other {# folios}}."

// es.json
"…triggers": [
  "muestra las tachaduras del copista frente a las del editor",
  "dónde expungió o tachó el escriba",
  "punteado y tachado del copista",
  "compara supresiones (^texto) y (texto)",
  "correcciones del escriba",
  "cancelaciones editoriales"
],
"…answer": "{scribal, plural, one {# supresión del copista} other {# supresiones del copista}} y {editorial, plural, one {# supresión editorial} other {# supresiones editoriales}} en {folios, plural, one {# folio} other {# folios}}."

// pt.json  — "mostra as rasuras do copista e as do editor", "onde o escriba expungiu ou riscou", …
// ca.json  — "mostra les supressions del copista i les de l'editor", "on va ratllar el copista", …
// gl.json  — "amosa as supresións do copista e as do editor", …
// eu.json  — "erakutsi kopistaren ezabaketak eta editorearenak", …   (draft — needs review)
```

All non-English triggers and templates are drafts until reviewed (SPEC-I18N §9).

---

## 6. Facet index (per witness, built lazily)

One linear pass over `ParsedManuscript` when the drawer first opens, cached in memory and keyed by `manuscriptIdentity` hash + parser version + catalog version.

### 6.1 Word stream (struct-of-arrays)

```typescript
interface WordStream {
  count: number;
  surfaceId: Uint32Array;     // interned diplomatic surface (raw, tildes kept)
  normId: Uint32Array;        // interned normalized form
  lemmaId: Uint32Array;       // 0 until lemma dictionary loaded (SPEC-LIGHTWEIGHT §4.2)
  folio: Uint16Array;         // folio index
  block: Uint32Array;         // block index within witness
  flags: Uint32Array;         // bitmask, below
  strings: string[];          // intern table
}
```

**Flag bits:** `LINE_FINAL`, `LINE_INITIAL`, `HYPHEN_SPLIT` (stitched across line), `CROSS_COLUMN`, `CROSS_FOLIO`, `IN_RUBRIC`, `IN_GLOSS`, `IN_ADDENDUM`, `IN_HEADING`, `IN_CATCHWORD`, `IN_FOREIGN` (+ language id in a side `Uint8Array`), `HAS_EXPANSION`, `HAS_SUPERSCRIPT`, `NON_ORIGINAL_HAND`, `RECONSTRUCTED`, `IN_FIGURE`.

Words come from the hyphen-stitched `reconstructedFlow` logic already used by the concordance, so stats and KWIC stay consistent (ARCHITECTURE § Structural parser).

### 6.2 Token facets

| Facet | Structure |
|-------|-----------|
| Token-type counts | `Map<TokenType, { total, byFolio: Uint32Array }>` |
| Token occurrences | `Map<TokenType, Uint32Array>` of packed (block, tokenIdx) refs for KWIC |
| Hands | `Map<hand, refs>` from `token.hand` / `block.hand` |
| Language spans | `Map<HSMS code, { tokens, words }>` from `envLayers` / `block.language` |
| Initials | histogram of `initialDepth` 1–10; refs; adjacency to `{BLNK.}` |
| Layout | per folio: headings, CW, SG, column layouts, `%2` / `%3` refs |
| Quires | inferred gathering boundaries (§6.3) |

### 6.3 Quire inference

Several questions ask about "later quires" or catchwords "between quires". HSMS has no quire mnemonic, so:

1. A catchword `{CW.}` on a verso marks a probable quire end. Signatures `{SG.}` refine it.
2. The user can override with a collation formula in workspace settings (e.g. `1–8⁸ 9¹⁰`), which wins over inference.
3. Recipes that group by quire state which source they used ("quires inferred from catchwords" vs "quires from collation formula").

### 6.4 Build cost

Target: ≤ 150 ms for Pedro Nunes, ≤ 600 ms for the largest OSTA witness on the reference device. Build in ≤ 8 ms idle slices on web (`requestIdleCallback`), or one synchronous pass on native behind the drawer's opening animation. Memory target: ≤ 24 bytes per word excluding the intern table.

---

## 7. Precompilation

"Precompiled" means two things, at two times.

### 7.1 At build time: the catalog

`scripts/compile-copilot.ts` (run in CI and before export):

1. Loads every recipe and every locale's triggers and templates.
2. **Validates:** each Tier 1 locale has ≥ 6 triggers per recipe; ICU templates parse; template placeholders match the recipe's result fields; slot words exist per locale.
3. **Checks routing quality** on the paraphrase test set (§12). Fails CI if top-1 accuracy drops below the floor.
4. **Emits** `utils/generated/copilotCatalog.ts` with recipe metadata and, per locale, the normalized trigger strings.

Prototype **vectors are not shipped.** They are cheap to compute (about 50 recipes × 6–10 phrases per locale) and would cost ~75 KB per locale at 384-d float32. They are built on drawer open for the active locale union and cached for the session. If profiling shows that build exceeds 30 ms, switch to shipping int8-quantized 256-d matrices (~13 KB per locale).

### 7.2 Per witness, in idle time: the answers

After the facet index exists, `precompute.ts` runs every recipe marked `precompute: "eager"` (zero-param, Tier A/C) in idle slices and caches results:

- **Cache key:** witness hash + recipe id + recipe version + parser version.
- **Store:** memory always; AsyncStorage (small JSON, LRU capped at 2 MB total) so reopening a witness shows answers instantly.
- **Opening view:** the drawer opens to an **Overview** of ready answers grouped by category, as localized chips with counts ("Supresiones del copista · 42", "Manos no originales · 7", "Iniciales IN1–IN5 · 31"). Tapping one opens the full card. That is the precompiled-interaction experience: the common questions are already answered before the researcher types.

---

## 8. Multilingual routing

### 8.1 Locale union

The router scores the query against the prototype matrices of:

1. the **UI locale chain** (e.g. `es-419` → `es`),
2. **English** (researchers often write in English regardless of UI),
3. the **witness language's** modern locale (e.g. a Portuguese witness adds `pt`), when it's a Tier 1 locale.

Scores are max-pooled per recipe across locales. This lets a Brazilian researcher type in Spanish or English and still be understood, with no language-ID step.

### 8.2 Thresholds

`INTENT_THRESHOLD` (0.55 today) is calibrated **per locale** from the paraphrase set, because trigram overlap differs by language. Below threshold, the card shows the top 3 recipe chips ("Did you mean…") plus passage search results, never a silent guess.

### 8.3 Slot extraction

Small per-locale grammars in i18n catalogs, not code:

| Slot | en | es | pt | ca |
|------|----|----|----|----|
| folio range | `from 3r to 10v`, `fols. 3r–10v` | `de 3r a 10v`, `entre 3r y 10v` | `de 3r a 10v`, `entre 3r e 10v` | `de 3r a 10v`, `entre 3r i 10v` |
| quire | `quire 2` | `cuaderno 2` | `caderno 2` | `quadern 2` |
| window | `within 5 words` | `en una ventana de 5 palabras` | `numa janela de 5 palavras` | `en una finestra de 5 paraules` |
| word | quoted `"rey"` or *of/for X* | *de X*, *para X* | *de X*, *para X* | *de X*, *per a X* |

Quoted strings always win as `word`/`lemma`. HSMS notation in the query (`(^text)`, `[*text]`, `{GL.}`, `%2`) is recognized as a strong routing signal: the mnemonic is also added to the triggers.

---

## 9. Recipe catalog (v1)

Mapped from the researcher question set. **Tier** per §4. **Eager** = precomputed at idle.

### 9.1 Paleography and codicology

| Recipe id | Question family | Mechanics | Tier | Eager |
|-----------|-----------------|-----------|------|-------|
| `abbr.nasal_tilde_vs_geminate` | Tilde over *n* vs *nn* for /ɲ/ | Graph-pattern set `palatal_nasal` over diplomatic surfaces, by folio/quire | B | ✓ |
| `abbr.expansion_by_quire` | Latinate abbreviations (`q<ue>`, `p<er>`, `p<ro>`) abbreviated vs written in full, early vs late quires | `expansion` tokens grouped by expanded form; full-form matches of the same normalized word; split by quire | A+B | ✓ |
| `abbr.superscripts` | Superscript vowels (`<<a>>`) vs interlinear insertions | `superscript` vs `scribal_insertion` tokens, KWIC | A | ✓ |
| `corr.deletions_scribal_vs_editorial` | `(^text)` vs `(text)` | `scribal_deletion` vs `editorial_deletion` | A | ✓ |
| `corr.non_original_hands` | `[^2#text]`, `[^3#text]` | tokens with `hand ≥ 2`, grouped by hand and type | A | ✓ |
| `corr.editorial_overrides` | Editor overriding a scribal deletion / transposition | `scribal_deletion` followed by `editorial_insertion` in the same line; transposition notation if the lexer supports it (verify) | B | |
| `layout.hyphen_boundaries` | Line-end hyphens crossing column/folio | words with `CROSS_COLUMN` / `CROSS_FOLIO`; also reports §3.12 violations (a `{CB.}` closing on an incomplete word) | A | ✓ |
| `layout.wrapback` | `%2` / `%3` occurrences | `calderon_two`, `calderon_three` refs with position (column foot, heading) | A | ✓ |
| `codex.nonsequitur_after_cw` | Non-sequitur `[—]` after `{CW.}` | folio-end sequence check. **Lexer gap:** `[—]` is not tokenized today; add `non_sequitur` TokenType | A | ✓ |
| `chars.sibilant_graphs` | Sigma-like graphs vs c-cedilla vs long-s | Graph-pattern set `sibilants` defined against the witness's diacritic map (`hsmsDiacriticMap.ts`) | B | ✓ |
| `chars.accents` | Acute, grave, circumflex, dieresis (`@'`, `@^`, `@#` …) by language span | Resolved legacy-diacritic tokens grouped by mark × `envLayers` language | A | ✓ |
| `chars.numerals_symbols` | Roman numerals bounded by periods, apothecary symbols, Greek formulas (`xp`, `ih`) | regex `\.[ivxlcdm]+j?\.` + closed lists; `{SYMB.}` anchors | B | ✓ |
| `illum.initial_hierarchy` | Distribution of `{IN1.}`–`{IN10.}`; blank spaces left for illuminators | `initialDepth` histogram; `{BLNK.}` within/adjacent to `{IN.}` | A | ✓ |
| `marg.gloss_vs_addenda` | Contemporary glosses vs later addenda | block types `gloss` vs `addendum`, with hand | A | ✓ |
| `figure.interior_text` | `{MIN.}` / `{DIAG.}` with embedded text | figure brace blocks with non-empty text content | A | ✓ |
| `damage.illegible` | `[??]`, `[???]` | `illegible_text` (by length), `missing_fragment` | A | ✓ |
| `damage.reconstructions_by_hand` | `[*text]` vs `[*^2#text]` | `reconstructed_text` grouped by hand | A | ✓ |

### 9.2 Historical linguistics

| Recipe id | Question family | Mechanics | Tier | Eager |
|-----------|-----------------|-----------|------|-------|
| `phon.sibilants` | Intervocalic *-s-* vs *-ss-*; *ç* vs *z* | Context-aware graph patterns (`intervocalic`, `word_initial`, `word_final`) on diplomatic forms, excluding foreign spans | B | ✓ |
| `phon.palatal_nasal` | *n~* vs *nn* vs *n* for /ɲ/ | Same as `abbr.nasal_tilde_vs_geminate`, linguist framing; plain-*n* cases need a lemma list → lemmas resolved via dictionary | B | ✓ |
| `phon.palatal_lateral` | /ʎ/ as *ll*, *li*, *l* | Graph patterns + lemma filter; *li* is noisy, so examples are always shown | B | |
| `phon.apocope` | Final *-e* apocope (*noch/noche*) | Lemma groups with surface forms differing only in final *e* | B | ✓ |
| `morph.enclisis` | Enclitics on finite verbs (*dixol*, *llamol*) vs proclitic | Closed verb-stem list + clitic suffix patterns; clause split needs Tier D | B (+D) | |
| `morph.clitic_elision` | *yl recibio* vs *y le recibio* | Bigram patterns over closed clitic lists | B | |
| `morph.contractions` | *enel*, *delos*, *sobrel*, *entressi* vs separate | Closed contraction list per witness language; co-occurrence counts | B | ✓ |
| `morph.prefix_separation` | Editorial prefix separator `[+]` | **Lexer gap:** confirm `[+]` tokenization (likely parsed as `editorial_insertion` with value `+`); expose as a flag on the word | A | ✓ |
| `morph.prefix_linebreak` | Prefix split at line end (`de[+]-`) | `[+]` + `HYPHEN_SPLIT` | A | ✓ |
| `lex.latinate_doublets` | *sancto/santo*, `fcta`→*fecha* | Closed doublet list; expansion tokens whose expanded form is in the list | B | ✓ |
| `lex.greek_formulas` | *xp*, *ih* and their Romance environment | Patterns + KWIC with ±5 words | B | ✓ |
| `lex.code_switching` | `{LAT.}`, `{ARB.}`, `{CAT.}`, `{FRN.}` spans and switch points | Language facet; switch = adjacent words with different language ids | A | ✓ |
| `dial.tagged_spans` | Aragonese `{ARG.}` / Leonese spans | Language facet (add missing codes, SPEC-I18N §8). Feature-based dialect detection is Tier D | A (+D) | ✓ |
| `aljamiado.symb_spans` | Transliterated `{SYMB: …}` material | Lists spans and their Romance context. Phoneme mapping analysis is Tier D | A (+D) | |
| `syntax.punctuation` | Colons, virgules, periods vs breath groups | `scribal_punctuation` + plain punctuation distribution by line position; clause alignment is Tier D | A (+D) | ✓ |
| `discourse.calderones` | `%`, `%2`, `%3` as discourse markers | Calderón refs with following-word KWIC; dialogue-turn detection heuristic (`dixo`, `respondio` nearby) | A+B | ✓ |

### 9.3 Corpus linguistics

`scope` = `witness` (default) or `registry` (all witnesses loaded via batch compile).

| Recipe id | Question family | Mechanics | Tier | Eager |
|-----------|-----------------|-----------|------|-------|
| `stats.ttr_hapax` | TTR, hapax legomena, per witness/quire | TTR **plus STTR per 1,000 tokens** (raw TTR is length-dependent, and the card says so); hapax and dis legomena counts | C | ✓ |
| `stats.top_lemmas` | Top N lemmas without function words | Lemma counts minus witness-language stopwords (SPEC-I18N §8) | C | ✓ |
| `stats.variant_share` | Spelling variants of a lemma (*fazer/facer/façer*) | All surfaces mapped to `lemma`, with percentages | C | |
| `stats.zipf` | Rank-frequency | log-log series for a chart | C | ✓ |
| `colloc.window` | Collocates of *rey* within ±k | PMI and t-score, **plus log-likelihood G²**; minimum frequency 3 by default (PMI overrates rare pairs, and the card says so) | C | |
| `ngrams.top` | Top 3-/4-grams, formulaic sequences | Rolling hash over `normId`; excludes n-grams crossing folio boundaries unless asked | C | ✓ (n=3) |
| `colloc.prep_article` | *en* + article (*enel*, *en la*) vs zero article | Contraction list + bigram counts | B | ✓ |
| `compare.genre` | Lexical density across genres | Needs `genre` metadata per registry witness (from `{RMK:}` or the library catalog); otherwise Tier D | C/D | |
| `compare.diachronic` | Frequency change by century/decade | Needs `date` metadata per registry witness; local plot when metadata exists, otherwise Tier D | C/D | |
| `syntax.clitic_position` | Enclitic vs proclitic by clause type | — | D | |
| `morph.subordinators` | *porque/paraque/anteque* fused vs split | Closed list, bigram vs unigram counts | B | ✓ |
| `morph.prefix_productivity` | `[+]` counts by semantic domain | Counts are Tier A; semantic domains are Tier D | A (+D) | |
| `ml.foreign_ratio` | % tokens in `{LAT.}` etc. | Language facet / total words | A | ✓ |
| `ml.aljamiado_density` | Romance vs Arabic/Hebrew loanwords in `{SYMB:}` | — | D | |
| `codex.catchword_hyphen_bias` | Hyphenated words at quire feet vs internal lines | Contingency table (`IN_CATCHWORD`/folio-final vs internal × `HYPHEN_SPLIT`), G² with p-value; warns when expected counts < 5 | A+C | ✓ |
| `marg.vocab_ratio` | Unique vocabulary in glosses vs body | Type sets by `IN_GLOSS`; Jaccard and gloss-only types | C | ✓ |

### 9.4 Navigation, search, and ingest

| Recipe id | Purpose | Tier |
|-----------|---------|------|
| `nav.folio` | Existing fast path, localized | A |
| `search.passages` | Existing hash-embed passage search (fallback) | C |
| `search.kwic` | Concordance lookup for a word/lemma | A |
| `ingest.low_confidence` | Lines in a PDF-derived witness with recognition confidence below threshold (SPEC-PDF-INGEST §6) | A |
| `ingest.unreviewed` | Folios not yet marked reviewed | A |

---

## 10. Query DSL (for reproducibility and power users)

Every answer card shows the equivalent expression, which can be copied, pasted back, and cited in a paper's methods section. Typing an expression runs it directly, bypassing the router.

```text
count  tokens  where type = scribal_deletion            group by folio
count  tokens  where hand >= 2                          group by hand, type
list   words   where lang = LAT                         kwic 5
count  graphs  set = palatal_nasal                      group by quire
stats  ttr     scope = registry                         group by witness
colloc lemma = "rey"  window = 5  measure = pmi,tscore,g2  min = 3
ngrams n = 3   top = 50  exclude = stopwords
```

The grammar is about 15 productions, parsed by a hand-written recursive-descent parser in `dsl.ts` (no parser generator dependency). Keywords are English only; values (words, lemmas) are free text. Exports include the DSL line, recipe id + version, parser version, witness hash, and timestamp.

---

## 11. Answer UX

Each answer is a card:

1. **Headline:** localized template with counts (`copilot.recipe.<id>.answer`).
2. **Badge:** evidence tier A/B/C/D with a one-line localized explanation on tap.
3. **Body:** count, table, distribution (by folio/quire/hand), KWIC list, or small chart. Charts use `react-native-svg` (already a dependency).
4. **Evidence rows:** every row is tappable → `navigateToAnchor` to folio/line on the parchment (existing `ScrollAnchorProvider`). Tier B answers always show examples first, so the researcher can judge precision.
5. **Actions:** Export CSV/TSV · Copy DSL · Refine (opens slot chips) · Related recipes.
6. **Method line:** localized `method` text, e.g. "Counted `scribal_deletion` tokens (HSMS `(^…)`), parser 2026.10."

Accessibility: cards are announced with headline and tier; tables have row/column headers; charts carry a text summary.

---

## 12. Testing and quality gates

| Test | Gate |
|------|------|
| **Recipe correctness** | Each Tier A recipe has golden expectations on Pedro Nunes TRS and ≥ 2 OSTA files (counts + first 10 refs). Snapshot tests. |
| **Tier B precision** | For each Tier B recipe, a hand-labeled sample of 100 hits per golden witness; record precision in the recipe file and show it in the badge tooltip ("~87% precision on reference set"). |
| **Routing accuracy** | Paraphrase set: ≥ 10 held-out paraphrases per recipe per Tier 1 locale, written by native speakers, not taken from the triggers. Gate: top-1 ≥ 85%, top-3 ≥ 95% per locale. Cross-language set: Spanish queries with `pt-BR` UI, etc. |
| **No false confidence** | Out-of-scope queries ("translate folio 3r", "who wrote this") must fall below threshold in ≥ 95% of a negative set. |
| **Performance** | Facet build and per-recipe p95 measured on the reference device: Tier A ≤ 20 ms, Tier B ≤ 80 ms, Tier C ≤ 300 ms (witness scope). |
| **Determinism** | Running any recipe twice with the same inputs gives byte-identical CSV. |
| **i18n** | `i18n:check` covers `copilot.*`; `compile-copilot.ts` validates placeholders. |

---

## 13. Backend handoff (Tier D)

When `EXPO_PUBLIC_ANALYSIS_BACKEND=1` and the user has consented for a witness:

- Tier D recipes route through the remote `AnalysisProvider` (SPEC-LIGHTWEIGHT §5) with the same `recipeId` + params. Answer cards, DSL, and exports are unchanged; only the badge changes to "Server".
- Candidate server capabilities: POS tagging and clause parsing for medieval Ibero-Romance, cross-corpus diachronic queries over the full OSTA corpus with date metadata, Aljamiado transliteration mapping, dialect feature classification.
- Each server recipe must state its model and version in the method line.

---

## 14. Rollout

| Phase | Scope |
|-------|-------|
| C1 | Facet index, recipe schema, catalog compiler, Tier A recipes (§9.1 + exact §9.2/9.3), `en` + `es` triggers; Overview chips |
| C2 | Tier C stats + DSL + CSV export; `pt`, `ca`, `gl` triggers; paraphrase test sets |
| C3 | Tier B recipes with precision measurements; `eu`; cross-language routing gates |
| C4 | Registry scope (corpus-level recipes over batch-compiled witnesses) |
| C5 | Tier D via backend (after SPEC-LIGHTWEIGHT P3) |

## 15. Open questions

1. Lexer gaps: confirm handling of `[—]` (non-sequitur), `[+]` (prefix separation), and transposition notation before the dependent recipes ship.
2. Where should genre and date metadata for registry witnesses come from: `{RMK:}` conventions, the library catalog, or a workspace sidecar?
3. Do we want user-defined recipes (a saved DSL expression plus localized label) in v1, or only after C2?

---

## 16. Implementation status (2026-10-16)

Measured on the repo after merging with the owner's Voyant recipes, vision transcription and library sidecars.

| Area | Status | Notes |
|------|--------|-------|
| Catalog | **57 recipes** (A 29 · B 15 · C 11 · D 2), incl. the owner's `corpus.term_frequency`, `corpus.ngrams`, `corpus.vocab_density` | `scripts/compile-copilot.ts` now fails on < 6 triggers per Tier 1 locale or a missing `chip` / `answer` / `method` template in any base catalog (0 errors) |
| Router | IDF-weighted sparse hashing over words, 5-letter stems, trigrams and HSMS symbols; out-of-scope pseudo-recipe; threshold 0.3 | Locale union = UI locale ∪ `en` ∪ witness language (`routingLocales`), wired into the drawer |
| Routing gate (held-out paraphrases) | top-1 / top-3: en 85.7 / 97.3 · es 85.7 / 96.4 · pt 91.1 / 100 · ca 87.5 / 96.4 · gl 89.3 / 96.4 · eu 92.9 / 96.4 | **Gap:** 1–2 paraphrases per recipe per locale written by Claude, not the ≥ 10 native-speaker paraphrases §12 asks for. Overlapping recipes (`stats.ttr_hapax` ≈ `corpus.vocab_density`, `ngrams.top` ≈ `corpus.ngrams`) count as equivalent |
| Negative set | 90% rejected (10 queries) | **Below the 95% gate.** Needs a larger negative set and threshold tuning |
| Slots | `utils/copilot/slots.ts`: word/lemma (quoted wins), window, n, top, hand, folio range (narrows any recipe), lang, scope; missing required slot → inline prompt in the card | |
| DSL | `count tokens where …` (existing) + `recipe <id> k=v`, `stats ttr|zipf|lemmas`, `ngrams`, `colloc`, `kwic`, `count graphs set=…`; every card shows the expression; pasting it re-runs the same recipe and parameters | |
| Localized cards | `copilot.recipe.<id>.{chip,answer,method,none,server,…}` and `copilot.label.<key>` in en/es/pt/ca/gl/eu; numbers and ratios use the UI locale (`0,142` in es) | Non-English strings are listed in `i18n/review-status.json` pending native review |
| Exports | Copy expression; CSV/TSV with header, rows, breakdown, method line and `recipe … (vN, tier X)` footer; deterministic (tested) | |
| Precompute | In-memory cache + **AsyncStorage overview cache** (LRU, 2 MB) keyed by source hash + catalog version; batch sidecars (`precompiledFacets`) still preferred | |
| Tier B precision | `npm run tierb:precision -- sample` wrote 41 labeling sheets to `reports/tierb-precision/`; `-- score` records precision in `utils/copilot/tierBPrecision.json` and the card shows "~N% precision" | **Not measured yet:** sheets need a human to label. Executors cap evidence rows at 50, so sheets hold ≤ 50 rows, not 100 |
| Backend handoff | `LocalAnalysisProvider` runs catalog recipes; `RemoteAnalysisProvider` (`POST {EXPO_PUBLIC_ANALYSIS_URL}/v1/recipes/{id}`, no text sent) behind `EXPO_PUBLIC_ANALYSIS_BACKEND=1` via `CompositeProvider` | The drawer still calls `askCopilot` directly; Tier D cards show the local approximation + localized "Needs server processing" note |
| Ingest recipes | `ingest.unreviewed` reads the workspace sidecar created by vision transcription; rows offer "Mark fol. … reviewed"; `ingest.low_confidence` reports that the vision agent gives no per-line confidence | |
| Performance gate | Not measured on reference devices | |

---

## 17. MCP synthesis & Azure hybrid boundary (2026-10-20)

### 17.1 MCP tool projection

`scripts/compile-copilot.ts` emits `utils/generated/mcpManuscriptTools.ts` (`renderMcpToolDefinitions` / `renderMcpGraphTools`). Recipe IDs map to MCP tools such as `audit_hsms_syntax`, `convert_htr_to_hsms`, `transcribe_manuscript_image`, `query_codicological_graph`, `rank_witnesses_tfidf`.

### 17.2 Azure hybrid vision / syntax

For `transcription.vision_ocr` / attached scans (`services/batchTranscriptionService.ts` + `azureAgentOrchestrator.ts`):

1. Client PDF slicer → upright PNG/JPEG (never raw PDF upload).
2. **Pass 1** vision (`gpt-4o`, `temperature=0`, capped output tokens) per frame.
3. Local `lintHsmsTranscription` gate.
4. **Pass 2** batch syntax repair (`gpt-5.4-mini`) only when critical errors remain — structural envelopes only, no orthographic modernization.

### 17.3 Precompiled intent chains

`assets/precompiled-intent-chains.json` (from `scripts/precompile-graph-intents.ts`) binds intent → recipe → `doActions` for sub-millisecond Tier-A dispatch without live multi-hop graph walks on device.

