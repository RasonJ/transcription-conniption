# Spec: Lightweight Core and Backend-Ready Boundary

**Status:** Draft, partly implemented · **Owner:** TBD · **Last updated:** 2026-10-16 (implementation status added)
**Related:** [SPEC-I18N.md](SPEC-I18N.md) · [SPEC-COPILOT.md](SPEC-COPILOT.md) · [SPEC-PDF-INGEST.md](SPEC-PDF-INGEST.md) · [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 1. Goal

Transcription Conniption should stay **as light as possible until backend processing is turned on**, while still being a real research tool for paleographers, historical linguists, and corpus linguists working offline on one witness or a small local corpus.

"Lightweight" here means four measurable things:

| Dimension | Meaning |
|-----------|---------|
| **Download** | Small initial JS bundle and app binary; no large data shipped that a reader-only user never touches |
| **Startup** | Reader path (open → upload → parchment) does no scholarly precomputation |
| **Runtime** | Per-keystroke compile does only what the visible UI needs |
| **Network** | Zero requests at startup and zero requests at all while the backend flag is off (Library tab aside, on demand) |

"Still useful" means every analysis in the copilot catalog marked Tier A–C ([SPEC-COPILOT.md §4](SPEC-COPILOT.md)) runs fully on-device, and every result can be exported.

### Non-goals

- Running an on-device LLM. The copilot is deterministic (see SPEC-COPILOT).
- Shrinking the parser or renderers. They are the product; the work here is about what loads *around* them.

---

## 2. Current-state findings (measured 2026-10-15)

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| F1 | **Lemma index is statically bundled.** `utils/hsmsDictionary.ts` does `import lemmaIndexData from "./generated/hsmsLemmaIndex.json"`, and `utils/concordance.ts` imports it. | `hsmsLemmaIndex.json` = 6.07 MB raw, ~1.07 MB gzip, 271,898 entries | Ships to every user, including reader-only users; parsed at module init |
| F2 | **Concordance is built on every debounced compile.** `enrichParsedManuscript()` calls `buildConcordance(parsed)` unconditionally. | `utils/analyzeManuscript.ts` | O(N) work + lemma lookups every 400 ms while typing, even when the drawer is closed |
| F3 | **Dependencies with no imports** in `app/ components/ context/ utils/ hooks/ constants/`: `zustand`, `expo-location`, `@rork-ai/toolkit-sdk`, `expo-blur`, `expo-symbols`, `expo-image`, `expo-image-picker`. | grep of import specifiers | Install size, native binary size, and (for `expo-location`) a permissions surface for no benefit |
| F4 | **`assets/` holds 36 MB** (16 MB `HSMS-manual.pdf`, 8.5 MB `dic/`, 5.7 MB `examples/`, 6.3 MB `images/`). No app code `require`s the PDF or `dic/`. | `du -sh assets/*` | Fine today because Metro bundles only required assets; must stay that way |
| F5 | **Vector index is already lazy** (`useMemo` inside `ManuscriptChatbotDrawer`). | `components/ManuscriptChatbotDrawer.tsx` | Good pattern; generalize it |
| F6 | **No i18n layer exists.** UI strings are inline English literals. | grep for `i18n`, `Intl.` | Handled in SPEC-I18N; must not add a heavy runtime |

---

## 3. Load tiers

Every module belongs to exactly one tier. A tier may import from tiers above it, never below.

```text
Tier 0  CORE (always loaded)
        parser (lexer, structural assembly, manuscriptParser, spatialAst),
        RN parchment renderer, workspace persistence, i18n runtime + active locale catalog,
        validation/linter (cheap, line-level)

Tier 1  SCHOLAR (loaded on first use, then cached for the session)
        concordance, lemma dictionary, facet index, copilot router + recipe executors,
        vector index, synoptic/normalized pane, TEI/HTML/SVG export, SVG facsimile,
        ornate initials, batch compiler, library catalog

Tier 2  BACKEND (only when EXPO_PUBLIC_ANALYSIS_BACKEND=1 at build time)
        remote AnalysisProvider, upload/consent UI, server-only copilot recipes,
        PDF ingest + HTR job UI (SPEC-PDF-INGEST)
```

### Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| LW-1 | Tier 0 modules must not statically import any Tier 1 module. | ESLint `no-restricted-imports` rule with a path allow-list per tier; CI fails on violation |
| LW-2 | Tier 1 modules load through `import()` behind a typed loader (`utils/lazy/loadScholar.ts`) and are wrapped in `React.lazy` + `Suspense` where they render UI. | Opening the app and rendering a parchment executes zero Tier 1 module bodies (verified by a Jest test that mocks the modules and asserts no evaluation) |
| LW-3 | Enable Metro `inlineRequires` (native) so even bundled Tier 1 code is not evaluated at startup. | `metro.config.js` transformer option set; cold-start trace shows no Tier 1 init |
| LW-4 | Tier 2 code is excluded from the bundle when the flag is 0. | `EXPO_PUBLIC_ANALYSIS_BACKEND` is inlined at build time; the remote provider lives in its own module reached only through a guarded `import()`; bundle diff shows no remote-provider symbols |

---

## 4. Specific changes

### 4.1 Concordance on demand (fixes F2)

- Remove `buildConcordance` from `enrichParsedManuscript()`. `ParsedManuscript.concordance` becomes optional and is **not** populated by compile.
- Add `getConcordance(parsed, key)` in Tier 1: memoized by `manuscriptIdentity` hash (already in `utils/manuscriptIdentity.ts`) + parser version.
- `stats.uniqueWords` (used in `computeManuscriptStats`) is computed lazily when the stats modal opens.
- Validation stays in compile (it is cheap and drives the editor banner).

**Acceptance:** typing in the editor with the concordance drawer closed performs no concordance work (spy test); drawer opens on Pedro Nunes in ≤ 150 ms on the reference device (§6).

### 4.2 Lemma dictionary as a lazy asset (fixes F1)

| Step | Detail |
|------|--------|
| Format | Replace the JSON object with a sorted, tab-separated, **front-coded** text file (`hsmsLemmaIndex.v2.tsv`): `surface\tlemmaId`, plus a lemma table. Generated by `scripts/generate-hsms-dictionary-index.mjs`. Target ≤ 2.5 MB raw / ≤ 0.8 MB gzip (measure; front coding on sorted Old Spanish surface forms typically removes much of the shared-prefix redundancy). |
| Location | `assets/dic/generated/`. Native: loaded with `expo-asset` + `expo-file-system` on first use. Web: emitted to `public/` and fetched from same origin (works offline once cached by the service worker in §4.5). |
| Lookup | Binary search over a decoded `string[]` + `Uint32Array` of lemma ids; build once, keep in memory for the session. |
| Fallback | `resolveLemma()` already falls back to the normalized surface form. While the dictionary loads, concordance and copilot use surface forms and show a one-line "lemmatizing…" hint, then refresh. |
| Optional sharding | If the decoded size still hurts low-end Android memory, shard by first letter (≈27 files) and load shards on demand. Decide after measuring. |

**Acceptance:** web initial bundle no longer contains `hsmsLemmaIndex`; lemmatized concordance results are identical to today's on the Pedro Nunes and OSTA golden files (snapshot test).

### 4.3 Dependency audit (fixes F3)

1. Run `npx depcheck` and the import grep in CI.
2. Remove packages with no imports and no config-plugin role. Candidates: `zustand`, `expo-location`, `@rork-ai/toolkit-sdk`, `expo-blur`, `expo-symbols`, `expo-image`, `expo-image-picker`. Confirm each by building iOS, Android, and web after removal. (`expo-font` and `expo-web-browser` stay: they are config plugins in `app.json`.)
3. Any new dependency needs a PR note giving install size, gzip contribution to the web bundle, and why an in-house version is not reasonable.

### 4.4 Asset hygiene (protects F4)

- Lint rule: no `require()` / `import` of anything under `assets/HSMS-manual.pdf`, `assets/dic/` (except the generated lazy dictionary), or `assets/examples/` from app code.
- The manual stays reachable from the Sources tab as a link to [hispanicseminary.org/manual-en.htm](https://hispanicseminary.org/manual-en.htm) and the in-repo Markdown, not a bundled PDF.

### 4.5 Offline web (PWA-lite)

- Add a small service worker for the web export that caches the app shell, the active locale catalog, and the lemma dictionary after first use.
- No background sync, no push. The goal is "works on a train" for a researcher who opened the app once.

### 4.6 Main-thread budget for large witnesses

- Measure `compileManuscriptTree` on the largest OSTA file. If the p95 compile exceeds 100 ms on the reference device:
  - **Web:** move compile to a Web Worker (the pipeline is already pure and synchronous, so it can be posted as a message).
  - **Native:** keep it synchronous, but raise the debounce adaptively (400 ms → 800 ms above a line-count threshold).
- Don't build this until the measurement says it's needed.

---

## 5. Backend boundary (`AnalysisProvider`)

All scholarly computation goes through one interface, so turning the backend on later doesn't touch UI code.

```typescript
// utils/analysis/provider.ts  (Tier 1)
export type Capability =
  | "concordance" | "facets" | "ngrams" | "collocations"   // local
  | "pos_tagging" | "clause_parsing" | "corpus_diachronic"  // backend only
  | "aljamiado_mapping" | "dialect_features"                // backend only
  | "pdf_ingest" | "htr" | "iiif_hosting";                  // backend only (SPEC-PDF-INGEST)

export interface AnalysisProvider {
  readonly id: "local" | "remote";
  capabilities(): ReadonlySet<Capability>;
  run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>>;
}

export interface AnalysisRequest {
  recipeId: string;               // see SPEC-COPILOT recipe catalog
  params: Record<string, unknown>;
  witness: { hash: string; title: string };  // never the text itself for local
}
```

| Rule | Detail |
|------|--------|
| Default | `LocalAnalysisProvider` only. `capabilities()` never claims backend-only capabilities. |
| Composition | When the flag is on, a `CompositeProvider` routes each request to local when local can answer, remote otherwise. Local stays the default for anything it can do. |
| Consent | The first remote request for a witness shows a per-witness consent sheet (what is sent, where, retention). Consent is stored in the workspace record. Nothing is uploaded without it. |
| Degradation | With the backend off, backend-only recipes still appear in the copilot, marked "Needs server processing", and offer the nearest local approximation (SPEC-COPILOT §4). |
| Privacy statement | ARCHITECTURE.md §Security stays true when the flag is off: transcription content never leaves the device. |

---

## 6. Budgets and measurement

Measure baselines before changing anything. Record them in this table, then enforce targets in CI.

| Metric | How measured | Baseline | Target |
|--------|--------------|----------|--------|
| Web initial JS (gzip) | `npm run build:web` + `scripts/size-report.ts` | _measure_ | ≤ baseline − 1 MB (F1 alone), then ≤ +2% per PR |
| Web total precache (gzip) | service-worker manifest | _measure_ | Tracked, not gated |
| Android release APK/AAB | EAS build artifact | _measure_ | Tracked; −F3 removals |
| Cold start → interactive (reader) | reference device, 5-run median | _measure_ | ≤ 1.5 s on Moto G-class Android; ≤ 0.8 s on recent iPhone |
| Upload → first parchment paint | Pedro Nunes TRS | _measure_ | ≤ 400 ms |
| Keystroke → preview (debounced) | Pedro Nunes, drawer closed | _measure_ | Compile ≤ 50 ms p95 |
| Concordance first open | Pedro Nunes | _measure_ | ≤ 150 ms (surface forms), lemmas ≤ 600 ms incl. dictionary load |
| JS heap after reader load | Hermes heap snapshot | _measure_ | ≤ baseline − 30 MB (F1 decoded JSON) |
| Network requests at startup | proxy log, backend flag off | _measure_ | **0** |

**Reference devices:** one low/mid Android (Moto G class), one recent iPhone, desktop Chrome with 4× CPU throttle.

`scripts/size-report.ts` writes `out/size-report.json`. A CI job compares against `main` and fails at > +5% initial JS without a `size-budget-approved` label.

---

## 7. "Useful without a backend" checklist

Release gate for any build with the backend flag off:

- [ ] Upload, parse, and render any OSTA witness offline (airplane mode).
- [ ] Concordance with lemmas, KWIC, and jump-to-line.
- [ ] Copilot answers every Tier A, B, and C recipe in all Tier 1 locales (SPEC-COPILOT §9).
- [ ] Every copilot result exports to CSV/TSV, and the exported "method" line names the recipe id and parser version, so the result can be cited and reproduced.
- [ ] TEI, HTML, SVG, and `.hsms` export work offline.
- [ ] Batch compile of a local folder populates the registry, and corpus-level recipes run across the registry.
- [ ] UI fully usable in every Tier 1 locale (SPEC-I18N).

---

## 8. Rollout

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| P0 | Baselines (§6), size-report script, CI job | Table filled in |
| P1 | F2 lazy concordance, F3 dependency removal, LW-1 lint rule | Budgets hold; tests green |
| P2 | F1 lazy dictionary v2 format, `inlineRequires`, lazy Tier 1 UI | Web bundle −1 MB or better; lemma snapshot parity |
| P3 | `AnalysisProvider` interface; copilot moved onto it | No UI imports a concrete provider |
| P4 | Web service worker; worker compile if §4.6 measurement requires it | Offline checklist passes |

## 9. Open questions

1. Is a 0.8 MB gzip lemma file acceptable as a one-time lazy download on web, or should sharding be on from day one?
2. Should the Library tab's catalog fetch count as "network at startup" if it is the landing tab for some users?
3. Minimum supported Android device for the budgets: pick one and buy it for the test lab.

---

## 10. Implementation status (2026-10-16)

| Item | Status | Measured |
|------|--------|----------|
| Web initial JS | `npm run size:check` (+5% budget over `size-baseline.json`) | 9.46 MB / 1.76 MB gzip before → **3.64 MB / 688 KB gzip** now (owner's HEAD before this merge: 693 KB) |
| Copilot really lazy on web | Fixed a leak: unused module loaders in `utils/lazy/loadScholar.ts` made Metro hoist all copilot code into the eagerly loaded `__common` chunk (198 KB). Now `__common` is 3.7 KB and the drawer chunk carries the copilot (226 KB raw) | `check-tiers` only sees static imports; this class of leak needs a build check (see open items) |
| LW-1 tier check | `npm run check:tiers` passes | |
| Lemma dictionary (F1) | Lazy front-coded `hsmsLemmaIndex.v2.tsv` | 2.72 MB raw / **0.87 MB gzip** (target 0.8) |
| Concordance (F2) | On demand only | |
| Dependencies (F3) | 4 unused packages removed earlier | |
| Service worker (§4.5) | `public/sw.js` | |
| `AnalysisProvider` (§5) | Local provider executes recipes; remote provider + composite routing behind the flag | `RemoteConsentSheet` in `app/_layout.tsx` when `EXPO_PUBLIC_ANALYSIS_BACKEND=1`; `ConsentGatedRemoteProvider` in `utils/analysis/getProvider.ts` |
| Sidecar alignment | `touchWorkspace` realigns the machine-transcription sidecar on every text change (adds `sidecarAlign` ≈ 2.5 KB gzip to Tier 0) | |
| Device budgets (§6) | Not measured on reference devices | |

**Open items:** a build-output check that no `utils/copilot/` module lands in an eager chunk; device measurements for §6. The consent sheet is `RemoteConsentSheet` (see the `AnalysisProvider` row).
