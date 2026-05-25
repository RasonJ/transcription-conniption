# Transcription Conniption

A cross-platform app for previewing **Hispanic Seminary (HSMS)**–style diplomatic transcriptions as manuscript-inspired pages. **Upload & Convert** a plain-text file to see a parchment-style leaf immediately, or open **Advanced editor** for HSMS source editing, validation, facsimiles, and export.

Built with [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/).

## Acknowledgments

This project implements markup conventions from the **[Hispanic Seminary of Medieval Studies (HSMS)](https://hispanicseminary.org/index.htm)**. The authoritative transcription rules are in the [HSMS *Manual of Manuscript Transcription* (English)](https://hispanicseminary.org/manual-en.htm).

Corpus regression testing is designed for transcriptions from **[OSTA](https://github.com/hispanicseminary/OSTA)** (*Open Spanish Textual Archive* — paleographic transcriptions maintained by the Hispanic Seminary). **`npm test` never reads the OSTA tree** — integration tests are opt-in via `npm run test:osta` when the OSTA repository is cloned as a sibling directory (`OSTA/transcriptions/`). Headless batch conversion and issue aggregation use `npm run batch:osta` (writes to `out/`).

| Resource | Link |
|----------|------|
| Hispanic Seminary | [hispanicseminary.org](https://hispanicseminary.org/index.htm) |
| HSMS manual (English) | [hispanicseminary.org/manual-en.htm](https://hispanicseminary.org/manual-en.htm) |
| OSTA transcription guide | [hispanicseminary.org/osta-en.htm](https://hispanicseminary.org/osta-en.htm) |
| OSTA corpus (GitHub) | [github.com/hispanicseminary/OSTA](https://github.com/hispanicseminary/OSTA) |

A local copy of the manual also lives in [docs/HSMS-manual.md](docs/HSMS-manual.md) (converted from the 5th ed., 1997 plain-text source).

| Doc | Topic |
|-----|--------|
| [docs/HSMS-LAYOUT.md](docs/HSMS-LAYOUT.md) | Columns, baselines, spatial AST, SVG grid |
| [docs/HSMS-TYPOGRAPHY.md](docs/HSMS-TYPOGRAPHY.md) | Parchment aesthetics, ink semantics, ornate drop caps |
| [docs/HSMS-EDITOR.md](docs/HSMS-EDITOR.md) | Editor, validation, batch, export |

### Pedro Nunes reference corpus (legacy HTML parity)

For side-by-side checks against the original desktop converter, use the sibling folder [../PedroNunes-TRS](../PedroNunes-TRS):

| File | Role |
|------|------|
| `text-TRS.txt` | Full HSMS transcription (load via **Upload & Convert** in the app) |
| `text-TRS.txt_cc-test.htm` | Legacy Word/HTML output (`float:left` initials, normalized Unicode, `<i>` expansions) |

Automated regression: `PEDRO_NUNES_TRS_PATH` → `npx jest __tests__/pedroNunesTrsParity.test.ts` (defaults to `../PedroNunes-TRS/text-TRS.txt`).

## Features

### Reader workflow (default)

- **Upload & Convert** — pick a `.txt` file; a compilation overlay shows progress while the manuscript tree is built
- **Clean parchment view** — publication metadata (author, title, imprint from `{RMK:}` lines) appears in a card **above** the leaf, not duplicated inside the transcription body
- **Diplomatic defaults** — expansions, deletions, and Unicode diacritics toggles are hidden until you need them

### Advanced editor

Toggle **Advanced editor** on the home screen to unlock:

- **Transcription code** / **Parchment sheet** switcher, live validation, and HSMS source `TextInput`
- **Scholarly tools** — virtualized KWIC concordance, TEI export, syntax error sheet, synoptic normalized pane (scroll-sync on wide layouts)
- **Display toggles** — expansions `<>`, deletions `()`, Unicode diacritics, otiose `~`, reading flow, synoptic split, facsimile canvas, figure placement, optional **SVG canvas** renderer (fixed 800 px logical leaf; web: HTML ForeignObject inside SVG parchment; native: baseline grid)
- **Scriptorium workspace** — rename witness, new blank slate, batch folder import, `.hsms` export/import, built-in samples
- **Figure placeholders** — `{ILL.}` margin track, `{MIN.}` inline, `{DIAG.}` full-width; tap-to-upload facsimile slots
- **Facsimile canvas** — folio leaf scans and tap-to-place image fragments
- **HTML export** — legacy-styled offline `.html` (LightGoldenrodYellow tables, float initials, `<i>` expansions); share or download
- **Generic export** — `.txt` (source), `.html`, `.svg`, `.png`, `.jpg` via filename extension or format picker

### Parsing & parity

- **HSMS-aware parsing** — three-pass compiler: structural lexer, environment stack, folio driver; `{RMK:}` lines populate metadata only (stripped from folio body via `utils/metadataBlocks.ts`)
- **Spatial layout** — `utils/spatialAst.ts` lifts each folio into column blocks and physical lines for the SVG facsimile path; see [docs/HSMS-LAYOUT.md](docs/HSMS-LAYOUT.md)
- **Legacy HTML parity** — inline `{INn.}` drop caps (one historiated grapheme per mnemonic; particle remainders stay in the body line, e.g. `{IN4.} AO` → cap **A**, text **O muyto…**), Portuguese `c'o~` compounds, balanced-brace figure lines (`utils/legacyDiacritics.ts`, `utils/dropInitial.ts`, `utils/braceBlocks.ts`); paleographic brackets (`[*]`, `[??]`, loose `??`, `[ ]`) via `utils/hsmsLexer.ts`; web SVG facsimile targets `PedroNunes-TRS` HTML float/justify behaviour
- **Reference tab** — links to HSMS manual, OSTA guide, and Hispanic Seminary resources

## Requirements

- [Bun](https://bun.sh/) (used for install and scripts)
- Expo Go on a device, or iOS/Android simulator / web browser for development

## Getting started

Install dependencies:

```bash
bun install
```

Start the dev server (mobile, with tunnel):

```bash
bun run start
```

Start for web:

```bash
bun run start:web
```

Scan the QR code with Expo Go, or press the platform key in the terminal to open a simulator.

## Project layout

| Path | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Main studio screen — reader/editor modes, parchment preview, RN layout engine |
| `context/ScriptoriumContext.tsx` | Workspace, registry, import/compile status, parsed manuscript |
| `components/CompilationOverlay.tsx` | Full-screen loader during file / bundle import |
| `components/BlockFigureLayout.tsx` | Margin/inline/full-width figure tracks; merged prose `Text` runs |
| `components/svgFacsimile/pageLayout.ts` | Fixed `CANVAS_W=800`, margins, gutter (shared web/native SVG) |
| `components/svgFacsimile/folioGroups.ts` | Spatial folio → column-block layout groups |
| `components/svgFacsimile/tokenRendering.ts` | Line height `LH`, token → styled segments (immutable; shared web/native SVG) |
| `components/svgFacsimile/renderOrnateInitial.tsx` | Native SVG historiated caps (four seeded style matrices) |
| `components/svgFacsimile/dropInitialLetterform.ts` | Seeded RNG, illuminated themes, legacy geometry helpers |
| `components/svgFacsimile/HtmlOrnateDropCap.tsx` | Web drop-cap SVG inside HTML facsimile rows |
| `utils/renderMarkupLeakage.ts` | Post-render HTML leakage scan (batch + tests; lacuna checks optional) |
| `components/SvgFacsimilePage.tsx` | Native SVG facsimile (baseline grid, auto-flow TSpans, wrap-back) |
| `components/SvgFacsimilePage.web.tsx` | Web SVG shell + HTML ForeignObject (justify, float caps) |
| `components/ConcordanceDrawer.tsx` | Virtualized KWIC side drawer (memoized rows) |
| `components/SynopticFolioSplit.tsx` | Wide-layout diplomatic + normalized split |
| `components/FolioFacsimileCanvas.tsx` | Folio leaf scans and tap-to-place fragments |
| `constants/manuscript.ts` | Token, block, folio, and manuscript types |
| `constants/scriptoriumTheme.ts` | Shared sienna/gold UI palette |
| `utils/compiler.ts` | Public compiler entry (`compileManuscriptTree`, `buildSpatialFolio`) |
| `utils/spatialAst.ts` | Column blocks, physical lines, `{CB2.}` zip, `%2` wrap-back |
| `utils/metadataBlocks.ts` | Strip `{RMK:}` from printable folio body |
| `utils/concordance.ts` | O(N) KWIC index from hyphen-stitched folio flows |
| `utils/manuscriptParser.ts` | Folio state machine, `{RMK:}` metadata, reading-flow reconstruction |
| `utils/dropInitial.ts` | `{INn.}` → single-grapheme `drop_initial` token |
| `utils/hsmsLexer.ts` | Sticky lexical rules (paleographic brackets, expansions, lacunae) |
| `utils/hsmsLinter.ts` | Fast pre-render lint (`lintHsmsTranscription`) — wraps `validateTranscription` |
| `utils/validation.ts` | Line-level structural + lexical validation pass |
| `components/EditorLinterBanner.tsx` | Live lint banner in Transcription code view |
| `scripts/lint-hsms.ts` | CLI for `npm run lint:hsms` |
| `utils/legacyDiacritics.ts` | Data-driven `@` notation and Portuguese compound resolution |
| `utils/metadataText.ts` | Normalize `{RMK:}` title strings for display |
| `utils/exportFormats.ts` | Extension → format mapping (txt, html, svg, png, jpeg) |
| `utils/manuscriptExport.ts` | Build export payload by format |
| `utils/svgDocumentExport.ts` | Standalone SVG facsimile document |
| `utils/exportFile.ts` | Save/share export (web download or native share sheet) |
| `utils/htmlExport.ts` | Legacy HSMSLib-style HTML document generation |
| `utils/expoFileSystem.ts` | Web shims for workspace directories and file reads |
| `utils/platformShadow.ts` | Web `boxShadow` / native shadow helper for UI cards |
| `utils/ostaBatchConverter.ts` | Headless OSTA batch compile → HTML, native TS bundles, issue logs |
| `utils/ostaIssueReport.ts` | Aggregate `out/*.issues.log` → `issues-summary.txt` / `issues.json` |
| `scripts/batch-convert-osta.ts` | CLI entry for `npm run batch:osta` |
| `scripts/aggregate-osta-issues.ts` | CLI entry for `npm run report:osta` |
| `app/(tabs)/about.tsx` | Sources and references |
| `app/_layout.tsx` | Root providers (`ScriptoriumProvider`, `ScrollAnchorProvider`) |
| `docs/HSMS-EDITOR.md` | HSMS editor/builder — workflows, workspace, validation, export |
| `docs/ARCHITECTURE.md` | System design and extension notes |
| `docs/HSMS-LAYOUT.md` | HSMS → physical page coordinates (parse + SVG/HTML layout) |
| `docs/HSMS-TYPOGRAPHY.md` | Facsimile ink semantics and ornate initials |
| `__tests__/pedroNunesTrsParity.test.ts` | Legacy HTML parity vs `PedroNunes-TRS` |
| `__tests__/spatialAst.test.ts` | Column blocks, two-column zip, drop-cap folio rows |
| `__tests__/hsmsPaleography.test.ts` | Drop-cap grapheme peel, bracket/`??` token types, lacuna spacing |
| `__tests__/rmkStrip.test.ts` | Ensures `{RMK:}` lines do not appear in folio body tokens |
| `__tests__/integration/osta/` | OSTA corpus integration (only via `npm run test:osta`) |
| `out/` | Batch conversion output (gitignored): `*.html`, `*.native.ts`, `*.issues.log`, summaries |
| `assets/images/` | Icons and splash assets |

### Sibling OSTA checkout (optional)

For integration tests or headless batch conversion, clone [OSTA](https://github.com/hispanicseminary/OSTA) next to this repository:

```
_gu/
├── OSTA/
│   └── transcriptions/    # TEXT.*.txt files (~650+ witnesses)
└── hsms-manuscript-viewer/
    └── out/               # batch:osta output (gitignored)
```

Override the input path with `OSTA_TRANSCRIPTIONS_PATH` (tests and CLI).

## Using the app

1. **Reader (default)** — tap **Upload & Convert**, choose a plain-text HSMS file, wait for the compilation overlay, then scroll the parchment. Author, title, and imprint from `{RMK:}` lines appear in the metadata card only.
2. **Advanced editor** — toggle **Advanced editor** for the transcription editor, validation, concordance, batch import, samples, and display switches. Use **Transcription code** vs **Parchment sheet** to edit source or preview layout.
3. **New blank scriptorium** (editor only) — starts from a template with `{RMK:}` placeholders and opens in code view.

## Transcription format

The parser expects **structural HSMS markup** with folio boundaries and environment tags. Lines beginning `{RMK:` are parsed into `metadata` and are **not** rendered as folio prose:

```
{RMK: Author Name.}
{RMK: Book Title.}
{RMK: Lisboa | Printer Name | 1537.}
[fol. 3r]
{HD. Running header}
{CB1.
1 {IN4.} AO First line — cap A, body starts O…
7 {RUB. % Chapter heading.}
13 {GL. Gloss text with s<cilicet> expansions.}}
{CW. catchword}
```

Supported inline tokens include `<expansion>`, `(^scribal deletion)`, `(editorial deletion)`, `[^insertion]`, `[editorial]`, calderones (`%`, `%2`, `%3`), and paleographic brackets per the HSMS manual:

| Markup | Meaning | Preview |
|--------|---------|---------|
| `[*text]` | Editorial reconstruction of damaged script | italic `[text]` |
| `[??]` / `[???]` | Illegible text still present on the leaf | □□ |
| loose `??` at line end | Margin lacuna (torn edge / binder trim) | … |
| `[ ]` / `[]` | Mechanical lacuna (blank space in parchment) | word boundary space |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Dev server (Rork + tunnel) |
| `bun run start:web` | Dev server for web |
| `bun run lint` | Run ESLint |
| `npm test` | Unit tests only — parser, spatial AST, concordance, normalization, RMK strip, Pedro Nunes parity, paleography, render leakage (**158 tests**; never touches OSTA files) |
| `npm run lint:hsms` | Paleographic lint of `.txt` / `.hsms` (folio leaks, headers, reconstructions, env stack) |
| `npm run lint:project` | Recursive OSTA-style batch lint (defaults to sibling `OSTA/transcriptions/` when present) |
| `npm run test:osta` | OSTA integration suite under `__tests__/integration/osta/` (~650+ files; requires sibling `OSTA/transcriptions/`) |
| `npm run batch:osta` | Batch-compile OSTA transcriptions → `out/` (HTML, native TS bundles, per-file `*.issues.log`; see [Batch issue logs](#batch-issue-logs); aggregates summary when done) |
| `npm run report:osta` | Re-aggregate existing `out/*.issues.log` → `issues-summary.txt` and `issues.json` (lint, parse, and render counts) |

`jest.config.js` excludes `__tests__/integration/` so default `npm test` is safe without a local OSTA clone. `npm run test:osta` uses `jest.osta.config.js` and sets `OSTA_INTEGRATION=1`. Optional: `OSTA_WRITE_REPORTS=1` with `npm run test:osta` writes validation logs under `reports/`.

Batch CLI examples (if `npm` swallows `--limit`, call the script directly):

```bash
npm run batch:osta -- --limit=10
npx tsx scripts/batch-convert-osta.ts --limit=10 --no-report
npm run batch:osta -- --in "C:\path\to\OSTA\transcriptions" --out ./out
npm run batch:osta -- --no-report   # skip issues-summary step
npm run report:osta -- --out ./out
```

### Batch issue logs

Each witness under `out/<baseName>.issues.log` has up to three tagged sections:

| Section | Tag | Source |
|---------|-----|--------|
| Pre-compile lint | `[LINT]` | `lintHsmsTranscription` — folio leaks, env stack, bracket conventions (including `[ ]` lacuna syntax) |
| Compile / parse | `[PARSE]` | `compileManuscriptTree` validation (deduped against lint) |
| Post-render leakage | `[RENDER]` | `scanRenderedMarkupLeakage` on exported HTML — stray `{CB.}`, `[*…]`, brace mnemonics, editorial brackets in visible text |

**OSTA batch** passes `{ skipLacunaChecks: true }` to the render scanner so mechanical lacuna `[ ]` HTML patterns and the expensive per-token tree walk are skipped (large lacuna-heavy witnesses were stalling full-corpus runs). Lacuna syntax is still reported under `[LINT]` when applicable. In-app preview and `npm test` use the full render scan including lacuna token checks.

Aggregate output: `out/issues-summary.txt` and `out/issues.json` (`npm run report:osta` to refresh without recompiling).

Pedro Nunes regression (sibling `PedroNunes-TRS/text-TRS.txt`):

```bash
npx jest __tests__/pedroNunesTrsParity.test.ts
```

## HSMS legacy assets (`assets/dic/`)

| File | Role |
|------|------|
| `assets/dic/hsms.src` | HSMS **DB_MAP** lemmatization dictionary (~280k entries) — not character mappings |
| `utils/generated/hsmsDiacriticMap.ts` | Generated from `HSMSTools/HSMSParser/settings.ini` `[RegexReplaces]` (legacy `CharRegexReplacements`) |
| `utils/generated/hsmsLemmaIndex.json` | Compact surface→lemma index built from `hsms.src` |

Regenerate after updating sources:

```bash
npm run generate:hsms-assets
```

- **Diacritics** (`@'`, `@~`, `c'`, etc.) mirror the C# parser’s `CharRegexReplacements` rules.
- **Concordance** uses the lemma index when a surface form is listed in `hsms.src`; indexing is O(N) via sticky `RegExp.exec` on each folio’s `reconstructedFlow`.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | App structure, three-pass compiler + spatial layout, UI performance notes, OSTA testing |
| [docs/HSMS-EDITOR.md](docs/HSMS-EDITOR.md) | HSMS editor/builder — reader vs scriptorium workflows, workspace, validation, export |
| [docs/HSMS-LAYOUT.md](docs/HSMS-LAYOUT.md) | Physical line model, fixed 800 px canvas, ForeignObject web path, legacy HTML parity checklist |
| [docs/HSMS-TYPOGRAPHY.md](docs/HSMS-TYPOGRAPHY.md) | Ornate initials, ink palette, facsimile fidelity checklist |
| [docs/HSMS-manual.md](docs/HSMS-manual.md) | Local Markdown copy of the HSMS manual (5th ed., 1997) |

**Canonical manual online:** [hispanicseminary.org/manual-en.htm](https://hispanicseminary.org/manual-en.htm)

To regenerate the local manual from the plain-text source:

```bash
node scripts/convert-hsms-manual.mjs
```

Source files: `../HSMS-manual.txt` and `../HSMS-manual.pdf` (plates and figures).

## License

Private project (`"private": true` in `package.json`). Transcription markup conventions and corpus data remain the property of their respective publishers; see [Hispanic Seminary](https://hispanicseminary.org/index.htm) and [OSTA](https://github.com/hispanicseminary/OSTA) for terms governing the reference materials.
