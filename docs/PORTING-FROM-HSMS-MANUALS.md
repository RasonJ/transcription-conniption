# Porting notes: `gu/manuals` → Transcription Conniption

Survey of the sibling repo [`C:\jason\dev\dev\gu\manuals`](file:///C:/jason/dev/dev/gu/manuals) (HSMS user manuals, Spanish, CC BY-NC-SA 4.0) against what this Expo app already implements. Goal: call out **product / validation / corpus features** worth porting—not Bootstrap HTML chrome or DOS/R install instructions.

**Source manuals**

| Folder | Tool covered | Authors |
|--------|--------------|---------|
| `HSMS-proofer/` | Legacy DOS proofer + modern R/Shiny validator | Fradejas Rueda, Gago Jover |
| `OSTA/` | Old Spanish Textual Archive search UI | Gago Jover, Pueyo Mena |
| `analizador/` | Analizador Corpus OSTA (lemmatize / correct / dictionary edit) | Gago Jover |
| `voyant/` | Voyant Tools distant-reading guide | Gago Jover |

**License caveat:** Manual prose is [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Port *behaviors and catalogs*, not large verbatim HTML. Attribute HSMS when shipping derived UI copy.

**Ignore safely:** `jquery.min.js`, `popper.js`, Bootstrap CSS/SCSS, and other static-site scaffolding. This workstation uses React Native / Expo Web with SVG facsimile rendering.

---

## Summary checklist (canonical targets)

| Old repo module | What to extract | Target in this repo |
|-----------------|-----------------|---------------------|
| `HSMS-proofer/` | Incident list & structural validation rules | `utils/hsmsLinter.ts`, `utils/parseValidation.ts` (+ MCP `audit_hsms_syntax`) |
| `analizador/` | Lemmatization tagset & dictionary rules | `scripts/generate-hsms-dictionary-index.mjs` → lemma/POS index |
| `OSTA/` | Citation norms & corpus reference guides | `docs/OSTA-guide.md` + `app/(tabs)/about.tsx` |
| `voyant/` | Distant-reading recipes & n-gram logic | `utils/copilot/catalog/index.ts`, `utils/concordance.ts` |

---

## Already covered here (do not re-port wholesale)

| Manual topic | Where we already have it |
|--------------|--------------------------|
| HSMS mnemonic grammar / folio-column layout | `docs/HSMS-manual.md`, parser, facsimile renderer |
| Structural lint / parse validation (partial) | `utils/hsmsLinter.ts`, `utils/validation.ts`, batch `*.issues.log` |
| Concordance / KWIC | `utils/concordance.ts`, `ConcordanceDrawer` |
| Lemma surface lookup | `utils/hsmsDictionary.ts` + `assets/dic/hsms.src` |
| Library catalog by author / year / keywords | `utils/libraryCatalog.ts`, Library tab |
| Corpus TF-IDF, facets, codicological graph | `utils/corpusPrecompute.ts`, MCP sidecar tools |
| Copilot paleography recipes | `utils/copilot/catalog/index.ts` |
| Export HTML / TEI / native bundles | export pipeline + `batch:osta` |

---

## 1. Proofer incident list → `utils/hsmsLinter.ts` (+ MCP)

**Source:** `HSMS-proofer/` (`incidencias.html`, `validacion.html`, `HSMSproofer.html`)

**What's in the old repo:** Comprehensive transcription validation rules, error messages, and incident lists used by the original DOS proofer and the modern R/Shiny app. Philosophy: *“Proofer señala; el editor decide”* — flag only, never auto-rewrite. Incidents are grouped **technical / editorial / structural**.

**How to port**

1. Extract incident rules and error codes from `HSMS-proofer/incidencias.html` (and any related tables).
2. Upgrade `utils/hsmsLinter.ts` (and align codes with `utils/parseValidation.ts` where compile-time checks belong) so Studio validates these structural edge cases **in real time while typing**.
3. Expose proofer checks as a precompiled MCP diagnostic tool (e.g. `audit_hsms_syntax`) so Copilot can highlight bracket, column, and mnemonic errors without a full re-parse narrative.
4. Prefer proofer-compatible report columns: `line`, `column`, `type`, `snippet`, `explanation`; optional TXT/TSV download matching the Shiny proofer export.

### Technical incidents to cover

- Filename convention `TEXT.SIGLA.txt` (alphanumeric uppercase sigla)
- UTF-8 encoding sniff / reject
- Ban **combining** Unicode diacritics (require precomposed or HSMS ASCII forms)
- Unmatched `[ ] { } < > ( )`
- Invisible junk: NBSP, TAB, ZWSP
- Leading/trailing ASCII spaces; consecutive spaces; >1 consecutive blank lines
- Soft line-length warning (~150 chars — OCR/HTR paste detection)

### Editorial incidents to cover

- `...` only inside `[...]`
- Calderón spacing (`%`, `%2`, `%3` and glyph forms): space before/after except line edges; warn on consecutive calderones
- `}` then `{` on same line requires intervening space
- No hyphen immediately before `}`
- Tags must be uppercase
- Illegibility only `??` / `???` (not `????+`)
- Continuation `+}` rules (must resume same tag type later; some tags forbid `+`)
- `=` vector only in tags that allow it (`{MIN.`, `{DIAG.`)
- `{AD.` / `{GL.` special follow-on: space + `[^` + text
- `<…>` / `<<…>>` must close on the **same physical line**; non-empty; no internal spaces; no nested angles
- Insertion/deletion emptiness and hand markers: `[ ]`, `( )`, `[^text]`, `(^text)`, `[^2#text]`, `[*…]`, `[*^2#…]`
- Substitution adjacency: `(x)[y]` with no space between `)` and `[`
- Tags generally forbidden inside `[…]` / `(…)` (exception: non-structural tags inside `[^…]` in `{AD.`/`{GL.`)
- Brackets/parens opened inside a tag or textual container must close before that container’s `}`
- `{CW.` / `{SG.` placement (start of line / after column close) and same-line close with text
- `{RMK:` same-line close, trailing `.` before `}`, header-only empty `{RMK:.}`

### Structural catalog checks

Proofer maintains internal tables (**Characters**, **Mnemonics**, **Functional Characters**). Port as data:

- Unknown structural tag
- Tag must / must not carry a number
- Tag must use the catalog delimiter (`.` vs `:` etc.)

**First concrete step:** Diff `incidencias.html` ↔ current linter/parse codes → tracked gap matrix → close gaps without changing the non-destructive philosophy.

---

## 2. Lemmatization & tagging → `scripts/generate-hsms-dictionary-index.mjs`

**Source:** `analizador/` (`lematizado.html`, `etiquetas.html`, `editor.html`, `corrector.html`, `eagles`-related PoS guidance also in `OSTA/eagles.html`)

**What's in the old repo:** Tagsets, lemmatization dictionaries, and morphological correction rules for Old Spanish (EAGLES-style tags; verb+clitic marking; OOV highlighting).

**How to port**

1. Incorporate the lemmatizer tag dictionary / morphological rules documented in `analizador/` into `scripts/generate-hsms-dictionary-index.mjs`.
2. Extend the generated lemma lookup so surface forms in the editor (e.g. *fazer*, *facer*) map to **canonical lemmas and POS tags** during local vector indexing and concordance.
3. Keep runtime access via `utils/hsmsDictionary.ts` (lazy load); enrich the index schema if needed (lemma + POS + optional ambiguity list).

### Related analizador workflows (follow-ons)

| Workflow | Manual | Porting idea |
|----------|--------|--------------|
| Triple HTML export | `lematizado.html` | `TEXT.SIGLA.html` / `.tagged.html` / `.vrt.html` (expansions + optional lemma hover) |
| Correction loop | `corrector.html` | Red = OOV, blue = verb+clitic on parchment; jump to source line |
| Dictionary editor | `editor.html` | Workspace-scoped lemma overrides + EAGLES tag assistant (`?`) |
| Known issues | `problemas.html` | Regression fixtures |

We already ship a **read-only** lemma index from `assets/dic/hsms.src`. The build-script enrichment is the highest-ROI slice; tagged export and override UI can follow.

---

## 3. In-app reference docs → `docs/` + `app/(tabs)/about.tsx`

**Source:** `OSTA/` (especially `cita.html`, `experta.html`, `comodines.html`, `filtrado.html`, structural/editorial/language appendices)

**What's in the old repo:** Complete reference appendices for OSTA citation norms, search syntax, corpus metadata, taxonomies, and authority lists.

**How to port**

1. Convert the useful `.html` documentation pages from `OSTA/` into Markdown under `docs/` (start with **`docs/OSTA-guide.md`**: citation, query cheat-sheet, tag crosswalk).
2. Surface them in the Sources & Documentation tab (`app/(tabs)/about.tsx`) so researchers can check syntax and citation rules **without leaving the workstation**.
3. Keep links to live HSMS/OSTA sites; prefer summarized Markdown over pasting entire Bootstrap pages.

### Content map for `docs/OSTA-guide.md` (+ About cards)

| Manual page | Topic to include |
|-------------|------------------|
| `cita.html` | How to cite witnesses / the archive |
| `basica.html` / `avanzada.html` / `experta.html` | Word vs HSMS form vs lemma vs PoS; `%c` / `%d` |
| `comodines.html` | Wildcard / operator cheat-sheet |
| `filtrado.html` | Metadata filters researchers expect |
| `estructural.html` | HSMS ↔ meaning / OSTA tag crosswalk |
| `taxonomia.html`, `eagles.html`, authority lists | Optional deeper appendices or JSON assets |

### Optional data assets (for Library / graph, not only docs)

| Appendix | Suggested artifact |
|----------|-------------------|
| `taxonomia.html` | `assets/intent-taxonomy.json` (there is no `assets/library/taxonomy.json`) |
| `eagles.html` | POS index from the dictionary generator: `public/dic/hsmsPosIndex.json` and `utils/generated/hsmsPosIndex.json` (there is no `assets/library/eagles-tags.json`) |
| `produccion.html`, `copimpr.html`, `autor.html`, `traductor.html` | Seed / validate catalog + graph nodes |
| `teclados.html` / `tecladosvirt.html` | Studio soft-keyboard component |

Spanish manuals remain a good source for **i18n** (es/pt) when adding these About sections.

---

## 4. Distant-reading recipes → `utils/copilot/catalog/index.ts`

**Source:** `voyant/` (`herramientas.html`, `lectura.html`, `codigo.html`, `imagenes.html`)

**What's in the old repo:** Distant-reading workflows — word frequencies, trend analysis, KWIC/collocation patterns, stopword clouds, relative frequency and skewness.

**How to port**

1. Convert Voyant analysis patterns into **precompiled Copilot intent recipes** in `utils/copilot/catalog/index.ts` (not an embedded Voyant instance).
2. Add intent chips in the Copilot drawer for queries such as:
   - “Show word frequency distribution”
   - “Extract N-grams”
   - “Analyze vocabulary density across quires / folios”
   - Relative frequency / hapax density / STTR (we already compute related stats)
3. Implement recipe runners on top of `utils/concordance.ts`, `utils/copilot/stats.ts`, and corpus sidecars (`corpus-tfidf.json`, `corpus-stats.json`, facet termFreq)—keeping Tier A local and sub-millisecond where possible.

| Voyant idea | Our near-equivalent | Gap / recipe target |
|-------------|---------------------|---------------------|
| Term frequency / Cirrus | TF-IDF sidecars, concordance | `corpus.term_frequency` chip + optional chart |
| Relative frequency + skewness | `corpus-stats.json` | Per-term distribution recipe |
| Stopwords | `constants/stopwords.ts` | User-editable lists (ARCHITECTURE ext. #7) |
| Trends across segments | — | Folio/quire trend recipe |
| KWIC / collocation | Concordance drawer | N-gram / collocate recipe in catalog |
| Export charts | Facsimile SVG/raster | Export of corpus chart payloads |

Prefer **native** recipes on precomputed indexes over embedding Voyant’s Java stack.

---

## Broader OSTA search product (stretch, after §1–4)

The OSTA manual also describes a full CQP-style corpus query UI we do not yet match. Treat as a later phase once documentation and lemma/POS indexes exist:

| Concept | Manual | Porting idea |
|---------|--------|--------------|
| Paleographic / HSMS / lemma / PoS fields | `avanzada`, `experta` | Search slots on postings + dictionary |
| Wildcards & operators | `comodines` | Query DSL lite over inverted indexes |
| Library filters (century, format, taxonomy…) | `filtrado` | Enrich `LibraryCatalogEntry` + filter UI |
| Sort by metadata / KWIC context | `filtrado` | Library + concordance sort options |

---

## Explicitly low value to port

- DOSBox / Pascal `proofer` history (one heritage paragraph max)
- RStudio / `proofer_app.R` / Shiny install steps
- Analizador Windows/macOS installers
- Voyant desktop install / Java stack
- Bootstrap sidebar HTML/CSS/JS, jQuery, Popper
- Screenshot-heavy tours tied to obsolete desktop chrome

---

## Implementation status

| Step | Status | Landing zone |
|------|--------|--------------|
| 1. Proofer → linter + MCP | **Done** | `utils/prooferIncidents.ts`, `lintHsmsTranscription`, MCP `audit_hsms_syntax` |
| 1b. Proofer/linter → agent memory | **Done** | `utils/hsmsAgentRuleCatalog.ts`, `npm run export:agent-memory` → `assets/agent-memory/` |
| HSMS-tools HTR → HSMS (83 rules) | **Done** | `utils/htrConverter.ts`, `npm run convert:htr`, MCP `convert_htr_to_hsms` |
| HSMS-tools proofer HTR leftovers | **Done** | `UNCONVERTED_HTR_MARKER`, `INVALID_AD_GL_FORMAT` in `prooferIncidents.ts` |
| HSMS-tools `diccionario/hsms.src` | **Done** | `generate-hsms-dictionary-index.mjs` resolves sibling `gu/HSMS-tools/diccionario/hsms.src` |
| 2. Dictionary POS / tagset | **Done** | `generate-hsms-dictionary-index.mjs` → `hsmsPosIndex.json`, `lookupHsmsPos` |
| 3. OSTA guide + About | **Done** | [OSTA-guide.md](OSTA-guide.md), About tab cards |
| 4. Voyant Copilot recipes | **Done** | `corpus.term_frequency`, `corpus.ngrams`, `corpus.vocab_density` |
| 5. Azure vision → HSMS | **Done** | Hybrid gpt-4o + batched Pass 2 (`gpt-5.4-mini`); [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md), Studio **Transcribe Scan (AI)** |
| 6. Library filters / soft keyboard / tagged HTML | Stretch | See § “Broader OSTA search product” |

---

## Quick reference — manual entry points

```
gu/manuals/
├── README.md
├── HSMS-proofer/   # index.html → incidencias.html, validacion.html
├── OSTA/           # index.html → cita.html, experta.html, comodines.html, filtrado.html
├── analizador/     # index.html → lematizado.html, editor.html, etiquetas.html
└── voyant/         # index.html → herramientas.html, lectura.html
```

---

## Sibling repo: `gu/HSMS-tools`

Additional high-value ports from [`C:\jason\dev\dev\gu\HSMS-tools`](file:///C:/jason/dev/dev/gu/HSMS-tools) (R/Shiny + diccionario; NW.js samples ignored):

| Legacy path | Modern landing |
|-------------|----------------|
| `HTR_to_HSMS/HTR_to_HSMS.R` (ordered regex table) | `utils/htrConverter.ts` · `npm run convert:htr` · MCP `convert_htr_to_hsms` |
| `HSMS_proofer/validator_*.R` (HTR leftovers, AD/GL) | `UNCONVERTED_HTR_MARKER`, `INVALID_AD_GL_FORMAT` in `utils/prooferIncidents.ts` (diagnostics feed Pass 2 / `runBatchPassTwoRepair`) |
| `diccionario/hsms.src` (~275k forms) | `scripts/generate-hsms-dictionary-index.mjs` (picks largest of local / sibling / `HSMS_SRC_PATH`) |

Last updated: 2026-10-16 — pillars 1–4 + Azure hybrid vision / batched Pass 2 + HSMS-tools HTR/dictionary ports.
