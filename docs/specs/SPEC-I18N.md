# Spec: Instant i18n for Iberian and Latin American Languages

**Status:** Approved, partly implemented · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) · [SPEC-COPILOT.md](SPEC-COPILOT.md) · [SPEC-PDF-INGEST.md](SPEC-PDF-INGEST.md)

---

## 0. Runtime primitives (2026-10-20)

| API | Location | Role |
|-----|----------|------|
| `getFallbackChain(locale)` | `i18n/core.ts` | BCP-47 fallback chain |
| `formatIcuMessage` / ICU parser | `i18n/messageFormat.ts` | `{var}`, plural, select |
| `useT` / `t` | `i18n/runtime.ts` | UI message lookup |
| `useWitnessLanguage(parsed)` | `hooks/useWitnessLanguage.ts` | Witness lang ≠ UI locale (collation, stopwords) |

## 1. Goal

Every screen, message, validation diagnostic, export dialog, and copilot answer is available in the major languages of the Iberian Peninsula and Latin America. Switching language is **instant**: no reload, no network, no visible delay.

### Two languages, never confused

| Concept | Example | Affects |
|---------|---------|---------|
| **UI locale** | `pt-BR` | Labels, messages, copilot phrasing and answers, number/date format |
| **Witness language** | Old Castilian with `{LAT.}` spans | Concordance stopwords, collation order, copilot heuristics (graph patterns, contraction lists) |

The UI locale **never** changes transcription text, HSMS mnemonics (`{CB1.}`, `{RUB.}`, `[fol. 1r]`), token values, or exported files. A Brazilian researcher can read a Catalan witness with a Portuguese UI.

### Non-goals

- Translating the HSMS manual. Link to the authoritative manual instead.
- Right-to-left UI. None of the target UI locales is RTL. Arabic and Hebrew appear only as witness content, which is handled by the renderer, not i18n.

---

## 2. Locales

### Tier 1: complete, expert-reviewed, release-blocking

| Tag | Language | Fallback chain | Notes |
|-----|----------|----------------|-------|
| `en` | English | — | Source locale; all keys originate here |
| `es-ES` | Spanish (Spain) | `es` → `en` | |
| `es-419` | Spanish (Latin America) | `es` → `en` | Regional override files allowed (`es-MX`, `es-AR`, `es-CO`, `es-CL`, `es-PE`, …) for vocabulary only, e.g. *computadora* vs *ordenador* |
| `pt-PT` | Portuguese (Portugal) | `pt` → `en` | |
| `pt-BR` | Portuguese (Brazil) | `pt` → `en` | |
| `ca` | Catalan | `es` → `en` | `ca-ES-valencia` override file for Valencian forms |
| `gl` | Galician | `es` → `en` | Fallback is configurable (some users would prefer `pt`) |
| `eu` | Basque | `es` → `en` | Ergative, agglutinative: full-sentence messages are mandatory (§5) |

`es` and `pt` are **shared base files**. Most strings live there, and the regional files hold only the differences. That keeps the bundle small and avoids drift.

### Tier 2: community-maintained, per-key fallback allowed

| Tag | Language | Fallback |
|-----|----------|----------|
| `ast` | Asturian | `es-ES` |
| `an` | Aragonese | `es-ES` |
| `oc-aranes` | Aranese Occitan | `ca` → `es-ES` |
| `qu` | Quechua | `es-419` |
| `gn` | Guaraní | `es-419` |
| `ay` | Aymara | `es-419` |

Tier 2 locales may ship partial catalogs. Missing keys resolve through the fallback chain and are never shown as raw key ids. Settings marks the locale "community translation".

### Detection and selection

1. On first launch, read the device locales (`expo-localization` `getLocales()`; web: `navigator.languages`).
2. Pick the best match with BCP 47 lookup against the supported list (`es-MX` → `es-419` overrides + `es` base; `pt-AO` → `pt-PT`; `ca-ES` → `ca`).
3. The user can override in Settings and in a one-tap picker in the Studio header. The choice persists in AsyncStorage (`hsms.i18n.locale.v1`).
4. Settings shows each language in its own name (*Español (Latinoamérica)*, *Euskara*, *Runa Simi*).

---

## 3. "Instant" requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| I18N-1 | Locale switch re-renders the whole tree synchronously from in-memory catalogs. | Switch → fully translated frame in ≤ 1 frame (16 ms) after catalogs are loaded; measured with a React Profiler test |
| I18N-2 | No network is ever needed to change language. | Airplane-mode test switches through all Tier 1 locales |
| I18N-3 | Startup loads only `en` + the active locale's chain. | Bundle analysis on web; native evaluates other catalogs lazily (Metro `inlineRequires`) |
| I18N-4 | All other Tier 1 catalogs are prefetched in an idle callback after first paint (web) so the first switch is also instant. | Catalogs are small (§4.4); prefetch completes in < 200 ms on reference device |
| I18N-5 | No layout jump on switch. Text containers tolerate +40% length (§6). | Visual regression screenshots per locale |

---

## 4. Runtime design

### 4.1 Library choice: in-house, about 2 KB

A full i18n framework would add more weight than this app needs. Build a minimal typed runtime:

```text
i18n/
  runtime.ts          # I18nProvider, useT(), t(), formatters, fallback resolution
  messageFormat.ts    # ICU MessageFormat subset: {var}, plural, select
  plural.ts           # Intl.PluralRules wrapper + static fallback table
  locales/
    en.json  es.json  es-ES.json  es-419.json  es-MX.json …
    pt.json  pt-PT.json  pt-BR.json  ca.json  ca-ES-valencia.json  gl.json  eu.json
    ast.json an.json oc-aranes.json qu.json gn.json ay.json
  terms/              # HSMS terminology glossaries (§7)
  STYLE.md            # Register, tone, and terminology decisions per locale
scripts/
  i18n-check.ts       # Missing keys, placeholder parity, unused keys, ICU syntax
  i18n-types.ts       # Generates MessageKey union type from en.json
```

- `useT()` returns `t(key: MessageKey, params?)`. Keys are typed, so a misspelled key is a compile error.
- Supported ICU subset: `{name}`, `{n, plural, one {…} other {…}}` (plus `many`, which CLDR uses for Spanish, Portuguese, and Catalan large-number forms), `{g, select, …}`. No nested `selectordinal`. Formatter conformance tests are taken from ICU examples.
- **Plural rules:** use `Intl.PluralRules` when present. Hermes' `Intl` coverage must be verified on the shipped React Native version; ship a static fallback table for the Tier 1 and Tier 2 locales so pluralization works regardless.
- **Numbers and dates:** `Intl.NumberFormat` / `Intl.DateTimeFormat` with the UI locale, e.g. `1.234,5` in `es-ES` vs `1,234.5` in `es-MX`. Copilot statistics (TTR, PMI) use the same formatter.

### 4.2 Keys and namespaces

```text
common.*        buttons, generic states
studio.*        upload, reader/editor, toggles
editor.*        code view, linter banner, samples
facsimile.*     SVG canvas, drop caps, figure slots
export.*        formats, share sheets
batch.*         batch compiler UI
library.*       library tab
copilot.*       router UI, answer templates (see SPEC-COPILOT §7)
validation.*    diagnostics, keyed by issue code
ingest.*        PDF upload and review (SPEC-PDF-INGEST)
hsms.term.*     glossary-backed terms (§7)
```

### 4.3 Validation messages become codes

`ValidationError` currently carries a pre-rendered English `message`. Change it to:

```typescript
interface ValidationError {
  code: string;                      // e.g. "ENV_UNCLOSED", "FOLIO_BEFORE_CLOSE"
  params?: Record<string, string | number>;
  severity: "error" | "warning" | "info";
  line: number;
  snippet?: string;
  /** @deprecated English fallback for CLI and logs. */
  message: string;
}
```

UI renders ``t(`validation.${code}`, params)``. CLI tools (`lint:hsms`, `batch:osta`, issue logs) stay English, since logs are diffed across runs and must be stable. The batch issue reports already group by code (`ostaIssueReport.ts`), so the code set exists in part. Unify it.

### 4.4 Size budget

| Item | Budget |
|------|--------|
| Runtime + formatter + plural fallback | ≤ 3 KB gzip |
| Shared base catalog (`es`, `pt`) | ≤ 15 KB gzip each |
| Regional override file | ≤ 2 KB gzip each |
| Full Tier 1 set on native (all bundled) | ≤ 90 KB gzip total |

On web, each locale chain is a separate chunk. On native, all Tier 1 catalogs are bundled (no code splitting there) but evaluated lazily.

---

## 5. Writing rules for translatable strings

These are mandatory because of the grammar of the target languages.

| Rule | Why | Bad → Good |
|------|-----|-----------|
| **Never concatenate sentence fragments.** One key per full sentence. | Basque and Quechua word order differ; Romance agreement crosses fragments | `t("found") + n + t("rubrics")` → `t("copilot.rubrics.found", {n})` |
| **No generic "{n} {noun} found".** Each countable result has its own key. | Gender and number agreement: *3 glosas encontradas* vs *3 reclamos encontrados* (es); *3 rubricas encontradas* (pt) | One key per recipe result (SPEC-COPILOT §7) |
| Placeholders are named, never positional. | Translators reorder | `{folio}`, not `%1` |
| Mnemonics, folio ids, and token text are placeholders, never translated. | HSMS contract | `"Unclosed {mnemonic} on line {line}"` |
| Register is decided per locale in `STYLE.md` (e.g. *tú* vs *usted*) and applied consistently. | Consistency | — |
| Strings carry translator context in `en.json` via a sibling `"_key.description"` entry. | Short UI labels are ambiguous ("Gloss" noun vs verb) | — |

---

## 6. Layout and accessibility

- Allow +40% text expansion over English in all chrome. Buttons wrap to two lines rather than truncating. No fixed-width labels.
- **Pseudo-locale `en-XA`** (accented, ~40% longer, bracketed) is available in dev builds for catching hard-coded strings and clipping.
- Set `accessibilityLanguage` on text nodes so screen readers pronounce UI text in the UI locale and witness text in the witness language (map HSMS codes: `LAT`→`la`, `PRT`→`pt`, `CAT`→`ca`, `GAL`→`gl`, `BAS`→`eu`, `SPN`→`es`).
- Lint rule `no-literal-string` for JSX text in `app/` and `components/` (allow-list for HSMS mnemonics and symbols).

---

## 7. HSMS terminology glossaries

Scholarly terms need fixed, reviewed translations so the same concept never gets two names.

`i18n/terms/<locale>.json` maps a concept id to a term. UI strings reference terms via `{term:catchword}`, which the formatter resolves.

| Concept id | en | es | pt | ca | gl |
|------------|----|----|----|----|----|
| `catchword` | catchword | reclamo | reclamo | reclam | reclamo |
| `signature` | signature | signatura | assinatura | signatura | sinatura |
| `rubric` | rubric | rúbrica | rubrica | rúbrica | rúbrica |
| `gloss` | gloss | glosa | glosa | glossa | glosa |
| `calderon` | calderón (¶) | calderón | caldeirão | calderó | calderón |
| `drop_initial` | initial | inicial | inicial | inicial | inicial |
| `expansion` | expansion | desarrollo de abreviatura | desdobramento de abreviatura | desenvolupament d'abreviatura | desenvolvemento de abreviatura |
| `folio` | folio | folio | fólio | foli | folio |

The table above is a **draft seed**. Every entry, plus Basque and the Tier 2 languages, needs sign-off from a paleographer who works in that language before release. The manual itself notes Spanish terms (e.g. *reclamo*, *signatura*), so prefer the manual's usage where it gives one.

---

## 8. Witness-language features (research utility)

These affect analysis, not the UI, and they ship with the i18n work because they share data and review.

| Feature | Current | Spec |
|---------|---------|------|
| **Stopwords** | One Spanish list (`constants/stopwords.ts`) | Per-language lists: Old Castilian, Old Portuguese / Galician-Portuguese, Catalan, Latin, plus modern `es`/`pt` for printed editions. Selected by witness language; user-editable per workspace (also ARCHITECTURE extension point #7). |
| **Witness language** | Not recorded | `workspace.witnessLanguage` (HSMS code). Default guessed by stopword-overlap scoring over the first ~2,000 tokens (cheap, deterministic); user can override. |
| **Collation** | `localeCompare()` with no locale in `concordance.ts` | `Intl.Collator(witnessLocale, { sensitivity: "base" })` for lemma lists. Optional "traditional Spanish" order (ch, ll as letters) as a toggle for older reference works. |
| **Language codes** | 13 codes in `constants/languageTags.ts` | Add missing Iberian codes that OSTA files use (e.g. `ARG` Aragonese, which the researcher question set references). Confirm each code against HSMS/OSTA conventions before adding. Labels become `t("hsms.lang.ARG")`. |
| **Accent-insensitive search** | — | Query normalization: NFD, strip combining marks, lowercase with UI locale. *rubricas* matches *rúbricas*. Applies to concordance search and copilot routing. Diplomatic matching (exact `n~`) stays available as an explicit mode. |

---

## 9. Translation workflow

1. Developers add keys to `en.json` only. `npm run i18n:types` regenerates `MessageKey`.
2. `npm run i18n:check` in CI fails on: missing Tier 1 keys, placeholder mismatch, ICU syntax errors, keys unused in code, and Tier 1 strings identical to English (except allow-listed ones like "TEI").
3. Machine-drafted strings are allowed as a starting point, but each is flagged `"_status": "draft"` and Tier 1 releases require zero drafts.
4. Reviewers: one fluent reviewer per Tier 1 locale for UI, plus a domain reviewer for `hsms.term.*`, `validation.*`, and `copilot.*`.
5. Translation files are plain JSON in the repo. Any platform that reads JSON (Weblate, Crowdin) can be added later without code changes.

---

## 10. Testing

| Test | Scope |
|------|-------|
| Unit | Formatter conformance (plural `one/many/other`, select, escaping); fallback resolution chains; BCP 47 best-match table |
| Catalog CI | `i18n:check` (above) |
| Snapshot | Each screen rendered in `en`, `es-419`, `pt-BR`, `eu`, `en-XA` |
| Instant switch | Profiler test: switch cycles through all Tier 1 locales; each commit ≤ 16 ms on CI hardware budget-adjusted |
| Offline | Airplane-mode switch (manual release check) |
| Witness language | Stopword auto-detect picks the right list on golden files (Pedro Nunes → Portuguese; OSTA Castilian samples → Old Castilian) |

## 11. Rollout

| Phase | Scope |
|-------|-------|
| P1 | Runtime, `en` extraction of all literals, lint rule, pseudo-locale |
| P2 | `es`, `es-ES`, `es-419`, `pt`, `pt-PT`, `pt-BR` |
| P3 | `ca`, `gl`, `eu`; terminology sign-off; validation codes |
| P4 | Witness-language features (§8) |
| P5 | Tier 2 locales as community contributions arrive |

## 12. Open questions

1. Galician fallback: `es` or `pt`? Ask Galician-speaking users.
2. Should the copilot accept queries in **any** Tier 1 language regardless of UI locale? Recommended yes, see SPEC-COPILOT §6.3.
3. Is there an official Spanish or Portuguese edition of the HSMS manual to link per locale?

---

## 13. Implementation status (2026-10-16)

| Item | Status |
|------|--------|
| Locales | Tier 1: en, es (+ es-ES, es-419, es-MX, es-AR), pt (+ pt-PT, pt-BR), ca (+ ca-ES-valencia), gl, eu. Tier 2: ast, an, oc-aranes, qu, gn, ay. Pseudo-locale en-XA |
| Catalog size | 533 keys; `npm run i18n:check` passes (no missing Tier 1 keys, placeholders match, ICU parses, no unused keys except `studio.action.transcribeScan`, which the owner's in-progress Studio code no longer references) |
| Release gate | `i18n:check --release` fails by design: machine-drafted strings in es/pt/ca/gl/eu (including all `copilot.recipe.*` templates and the vision-transcription strings) are listed in `i18n/review-status.json` until a fluent reviewer signs them off |
| Numbers | `{var}` placeholders now format numbers in the message's locale (`38.484` in es; Spanish keeps 4-digit numbers ungrouped per CLDR) |
| Instant switch | Catalogs load lazily per chain, prefetched at idle; switch test passes |
| Copilot | Queries route over UI locale ∪ en ∪ witness language; answer cards render from per-recipe ICU templates (§5 rules: one key per result, no concatenated fragments) |
| Owner-added strings | New Studio/vision keys from the owner's work translated into ca/gl/eu (drafts); the owner's newest `es`/`pt` text for `studio.action.transcribeScanDropUnsupported` still describes the older behaviour |
