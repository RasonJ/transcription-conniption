# Architecture

Transcription Conniption is a cross-platform mobile and web app built with **Expo** and **React Native**. It ingests line-based diplomatic transcriptions ([HSMS](https://hispanicseminary.org/manual-en.htm) / [OSTA](https://github.com/hispanicseminary/OSTA) plain text), parses structural markers, and renders a parchment-style manuscript leaf for scholarly preview.

## Acknowledgments and reference materials

| Resource | URL |
|----------|-----|
| Hispanic Seminary of Medieval Studies | [hispanicseminary.org](https://hispanicseminary.org/index.htm) |
| HSMS *Manual of Manuscript Transcription* (English) | [hispanicseminary.org/manual-en.htm](https://hispanicseminary.org/manual-en.htm) |
| OSTA transcription guide | [hispanicseminary.org/osta-en.htm](https://hispanicseminary.org/osta-en.htm) |
| OSTA corpus (paleographic transcriptions) | [github.com/hispanicseminary/OSTA](https://github.com/hispanicseminary/OSTA) |

The in-repo [HSMS-manual.md](HSMS-manual.md) is a convenience Markdown copy of the 1997 manual; the [online manual](https://hispanicseminary.org/manual-en.htm) is authoritative for markup rules.

## High-level overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Root layout (app/_layout.tsx)            │
│  QueryClientProvider · GestureHandlerRootView · Stack nav   │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │      Tab navigator          │
              │   app/(tabs)/_layout.tsx    │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
┌────────▼────────┐                    ┌─────────▼─────────┐
│  Studio (index) │                    │  Sources (about)  │
│  Transcription  │                    │  Reference links  │
│  + rendered leaf│                    │  + roadmap notes  │
└─────────────────┘                    └───────────────────┘
```

The app follows a **file-based routing** model via [Expo Router](https://docs.expo.dev/router/introduction/). Parsing lives under `utils/`; persistent workspace state in `context/ScriptoriumContext.tsx`; parchment rendering in `app/(tabs)/index.tsx` (React Native `Text` layout) and, when **SVG canvas** is enabled, `components/SvgFacsimilePage.web.tsx` (web) or `components/SvgFacsimilePage.tsx` (native). See [HSMS-LAYOUT.md](HSMS-LAYOUT.md) for the spatial AST and coordinate layout model, and [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md) for parchment aesthetics and typographic fidelity.

## Technology stack

| Layer | Choice | Role |
|-------|--------|------|
| Runtime | Expo SDK 54 | Build, native APIs, dev tooling |
| UI | React Native 0.81 + React 19 | Components and rendering |
| Navigation | Expo Router 6 | File-based routes, tabs, modals |
| Data fetching (infra) | TanStack React Query 5 | Provider wired at root; ready for async sources |
| Global state | `ScriptoriumProvider` | Workspace, registry, debounced parse, import/compile overlay flags |
| Local state | React `useState` on `index.tsx` | Reader vs editor mode, preview toggles, concordance drawer |
| Icons | lucide-react-native | Tab and action icons |
| File import | expo-document-picker | Plain-text transcription upload |
| Package manager | Bun | Install and script execution |


## Application structure

```
app/
  _layout.tsx           # Root providers, splash, stack over tabs
  (tabs)/
    _layout.tsx         # Bottom tab bar (Studio, Sources)
    index.tsx           # Main screen: import, edit, render
    about.tsx           # HSMS references and future work
  modal.tsx             # Template modal (unused in main flow)
  +native-intent.tsx    # Deep-link redirect → home
  +not-found.tsx        # 404 route

constants/
  manuscript.ts         # Token, block, folio, and ParsedManuscript types
  colors.ts             # Template theme tokens (minimal use today)

utils/
  compiler.ts           # Public API: compileManuscriptTree, buildSpatialFolio, concordance helpers
  manuscriptParser.ts   # Pass 3 folio driver; module-level cached regexes; LINE_PREFIX guard
  spatialAst.ts         # Spatial folio tree: ColumnBlock → Line; {CB2.} zip; wrap-back
  metadataBlocks.ts     # Strip {RMK:} leaks from printable folio body
  hsmsLexer.ts          # Sticky lexical tokenizer (diacritics, expansions, figures)
  structuralAssembly.ts # Pass 1/2; deep-copied env stack frames on tokens
  folioMarkers.ts       # [fol. 42rA] suffix; COLUMN_LAYOUT_MAP for track suffixes
  lexicalPatterns.ts    # Shared regex patterns (lexer + validation)
  parseValidation.ts    # Parse-time lexical/structural error collection
  analyzeManuscript.ts  # enrichParsedManuscript (concordance + validation merge)
  concordance.ts        # O(N) KWIC index via RegExp.exec on reconstructedFlow
  validation.ts         # Multi-line environment stack (stray `}` guards)
  normalizedText.ts     # Diplomatic → student reading edition (buffer + cached regex)
  teiExport.ts          # ParsedManuscript → TEI P5 (escaped abbr/expan, rend attrs)
  regexUtils.ts         # escapeRegex, toStickyRegex (deduplicated flag sets)
  environmentBlocks.ts  # ENVELOPE_MAP block types; parseEnvironmentOpen
  batchProcessor.ts     # Multi-file compile with deep-cloned progress snapshots
  ostaBatchConverter.ts # Headless OSTA batch: HTML + native TS bundles + *.issues.log
  ostaIssueReport.ts    # Aggregate issue logs → issues-summary.txt / issues.json
  figureAnchors.ts      # Figure ID allocation and {ILL|MIN|DIAG|SYMB} patterns
  legacyDiacritics.ts   # Precompiled cluster regex; @-notation word units
  dropInitial.ts        # {INn.} → single-grapheme drop_initial + body remainder
  braceBlocks.ts        # Balanced-brace figure / multi-line open tags
  metadataText.ts       # Normalize RMK title strings for display
  expoFileSystem.ts     # Web shims; chunked base64; Blob URL revoke on web
  exportFile.ts         # Save/share export with flexible SVG dimension parsing
  platformShadow.ts     # Web boxShadow vs native shadow* for UI cards
  svgDocumentExport.ts  # Standalone SVG facsimile document export

scripts/
  batch-convert-osta.ts   # npm run batch:osta
  aggregate-osta-issues.ts # npm run report:osta

out/                    # Batch output (gitignored): *.html, *.native.ts, *.issues.log, summaries

context/
  ScriptoriumContext.tsx  # Workspace, ManuscriptRegistry, importTextFile, isCompiling

components/
  CompilationOverlay.tsx  # ActivityIndicator + status during file/bundle import
  BlockFigureLayout.tsx   # Figure tracks; merges consecutive text tokens into one <Text>
  svgFacsimile/
    pageLayout.ts         # CANVAS_W=800, MARGIN, gutter, column width helpers (shared web/native)
    folioGroups.ts        # buildSpatialFolio → column-block layout groups
    tokenRendering.ts     # LH, FS; token → styled segments (immutable; coalesceSegs)
    HtmlOrnateDropCap.tsx   # Web ornate drop cap (SVG inside HTML facsimile rows)
    renderOrnateInitial.tsx # Native ornate drop cap (four seeded style matrices)
    dropInitialLetterform.ts # Seeded RNG, illuminated themes, geometry helpers
  ConcordanceDrawer.tsx   # Virtualized KWIC drawer (memoized entry rows)
  ValidationPanel.tsx     # Editor-mode diagnostics
  SynopticPane.tsx        # Normalized column for synoptic layout
  SynopticFolioSplit.tsx  # Wide split; scroll-sync gate; maxWidth 1200
  FigurePlaceholder.tsx   # Tap-to-upload facsimile slots keyed by figureId
  FolioFacsimileCanvas.tsx # Leaf scan + tap-to-place; clamped coordinates
  SvgFacsimilePage.tsx    # Native SVG leaf renderer (baseline grid)
  SvgFacsimilePage.web.tsx # Web SVG shell + HTML ForeignObject (justify, float caps)
  BatchProcessingPanel.tsx
  ResponsiveBatchShell.tsx
  ManuscriptSelector.tsx  # Witness switcher; elevated z-index when open

constants/
  scriptoriumTheme.ts   # Sienna/gold palette for home screen
  stopwords.ts          # Spanish function words excluded from index

assets/images/          # App icon, splash, favicons

docs/
  HSMS-manual.md        # HSMS transcription manual (Markdown, from HSMS-manual.txt)
  HSMS-EDITOR.md        # Editor/builder workflows, workspace, export, batch compile
  HSMS-LAYOUT.md              # HSMS → physical page coordinates (parse + SVG/HTML layout)
  HSMS-TYPOGRAPHY.md          # Visual fidelity: ink, caps, paleography, material surface
  ARCHITECTURE.md       # This file
```

### Root layout

`app/_layout.tsx` wraps the tree in:

1. **QueryClientProvider** — global React Query client for future API or cache layers.
2. **GestureHandlerRootView** — required for gesture-handler–based interactions.
3. **Stack** — hides the header on the tab group; additional stack screens (e.g. `modal`) can be pushed here.

Splash screen is held until `hideAsync()` runs on mount.

### Tab navigation

`app/(tabs)/_layout.tsx` defines two tabs:

- **Studio** (`index`) — primary workflow.
- **Sources** (`about`) — documentation links and product notes.

Styling uses `constants/scriptoriumTheme.ts` on the Studio screen (deep browns, gold accents); the About tab uses inline palette tokens.

## User workflows (Studio screen)

The home screen separates **convert-and-read** from **scriptorium editing**. Full editor/builder workflows, workspace model, and export paths: [HSMS-EDITOR.md](HSMS-EDITOR.md).

```
┌─────────────────────────────────────────────────────────────┐
│  Default: Reader mode (isEditorMode = false)                 │
│  • Upload & Convert  →  CompilationOverlay  →  parchment   │
│  • Metadata card (RMK) above leaf — not inside transcription │
│  • No config strip, concordance, or code editor               │
└─────────────────────────────────────────────────────────────┘
                              │
                    Advanced editor toggle
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Editor mode (isEditorMode = true)                           │
│  • Code ↔ Parchment switcher, validation, samples, batch      │
│  • Scholar toolbar, display toggles, stats strip              │
│  • Optional SvgFacsimilePage per folio (svgModeEnabled)       │
└─────────────────────────────────────────────────────────────┘
```

| Flag | Meaning |
|------|---------|
| `isEditorMode` | When false, hides editor chrome; default for upload-only users |
| `isPreview` | In editor mode: false = HSMS `TextInput`; true = parchment |
| `showParchment` | `isPreview \|\| !isEditorMode` — reader always sees the leaf |
| `showReaderTools` | Same as `isEditorMode` — toggles, concordance, TEI, stats |

**Import feedback:** `ScriptoriumContext` sets `isCompiling` and `compilationStatus` during `importTextFile` and `importHsmsBundle`. `CompilationOverlay` (absolute fill over the shell) yields one frame (`setTimeout(32)`) before synchronous `compileManuscriptTree` so the spinner can paint.

## Core domain: transcription pipeline

The pipeline is a **three-pass compiler** plus an optional **spatial layout** phase for facsimile renderers:

```
Raw text
  → Pass 1: tokenizeLineStructural / tokenizeString (hsmsLexer + structuralAssembly)
  → Pass 2: assembleStructuralTokens (blockStack → envLayers on each token)
  → Pass 3: parseHsMsText / compileManuscriptTree (folio driver, block flush, enrich)
  → ParsedManuscript → UI / TEI / concordance
  → buildSpatialFolio(folio) → ColumnBlock[] → Line[] (SvgFacsimilePage only)
```

| Module | Role |
|--------|------|
| `utils/hsmsLexer.ts` | Sticky lexical rules; paleographic brackets (`[*]`, `[??]`, `??`, `[ ]`); `scribal_punctuation` (`$;`, `$.`) |
| `utils/structuralAssembly.ts` | Pass 1 line tokenizer + Pass 2 `BlockEnvironmentStack` |
| `utils/folioMarkers.ts` | `parseFolioMarker` / `parseComplexFolio` (42rA, cxxvib column tracks) |
| `utils/manuscriptParser.ts` | Folio state machine, block flush, reading-flow reconstruction; cached regexes |
| `utils/spatialAst.ts` | Folio → column blocks → physical lines; `{CB2.}` row zip; `%2` wrap-back |
| `utils/metadataBlocks.ts` | Remove `{RMK:}` metadata that leaked into printable blocks |
| `utils/compiler.ts` | Public compiler exports (`compileManuscriptTree`, `buildSpatialFolio`) |
| `utils/concordance.ts` | Single-pass `RegExp.exec` KWIC; cached lemma patterns; no split arrays for counts |
| `utils/lexicalPatterns.ts` | Single source for env-open and unclosed-tag patterns |
| `utils/parseValidation.ts` | Line-level errors emitted during parse (merged with `validation.ts`) |

Full coordinate layout, ForeignObject web path, and legacy HTML parity notes: [HSMS-LAYOUT.md](HSMS-LAYOUT.md).

Nested `{RUB. … {LAT. …} …}` tags push/pop a recursive **blockStack** during Pass 2; tokens carry `envLayers[]` for inline diplomatic styling without premature rubric flush.

The pipeline is **pure and synchronous** on each debounced edit; workspace persistence is asynchronous via `scriptoriumWorkspace.ts`.

```
Raw text → parseHsMsText() → ParsedManuscript (+ concordance, validationErrors)
                │
                ├── FolioPage / BlockRenderer / TokenStream  (diplomatic RN Text)
                ├── buildSpatialFolio → SvgFacsimilePage(.web)  (SVG facsimile toggle)
                ├── SynopticPane (normalizedText)
                ├── ConcordanceDrawer (KWIC)
                ├── ValidationPanel (editor)
                └── exportToTEIXML → Share sheet
```

### 1. Input

Transcription text arrives from:

- **Nunes demo** — full HSMS markup sample (`DEFAULT_DEMO`).
- **Simple sample** — lighter folio + rubric example.
- **Paste / edit** — multiline `TextInput` in Transcription mode.
- **File upload** — `importTextFile()` → `DocumentPicker` → `FileSystem.readAsStringAsync` → `applyTranscription` (with `CompilationOverlay`).
- **Batch** — `BatchProcessingPanel` / `ResponsiveBatchShell` (editor mode); per-file status in panel.

### 2. Domain model (`constants/manuscript.ts`)

| Type | Purpose |
|------|---------|
| `Token` / `TokenType` | Editorial atoms: expansions `<…>`, deletions `()` / `(^)`, insertions `[]` / `[^]`, paleographic `[*…]` / `[??]` / loose `??` / `[ ]`, calderones `%`, `drop_initial`, `figure_anchor` for `{ILL.}`, `{MIN.}`, `{DIAG.}`, `{SYMB.}` |
| `figureId` / `figureType` | Stable slot key (`fol_3r_fig_001`) and mnemonic; maps to user-uploaded image URIs |
| `ManuscriptBlock` | Prose, rubric, gloss, addendum, diagram, or initial container; carries `columns` and `tokens` |
| `FolioSide` | One leaf: `id`, headings, blocks, catchword, signature |
| `ParsedManuscript` | `metadata`, `folios[]`, `stats`, optional `concordance`, `validationErrors` |
| `WordOccurrence` / `ConcordanceIndex` | KWIC hits: folio, line, pre/post context |
| `ValidationError` | Severity, message, source line index, snippet |

### 3. Structural parser (`utils/manuscriptParser.ts`)

Line-oriented state machine plus `tokenizeString()` lexer:

| Marker | Effect |
|--------|--------|
| `{RMK: …}` | Author, title, imprint (`city \| printer \| date`), or witness shelfmark; line is **`continue`d** — never appended to folio blocks (see `__tests__/rmkStrip.test.ts`) |
| `[fol. 3r]` | Opens new `FolioSide` |
| `{HD. …}` | Running header on current folio |
| `{CB1.}` / `{CB2.}` | Sets active column count for following blocks |
| `{RUB.}`, `{GL.}`, `{AD.}` | Block type + strip tag; closes on trailing `}` |
| `{IN4.} AO` / `{IN4.} S` | One historiated grapheme → `drop_initial` (`A` or `S`); remainder (`O muyto…`, `Phera…`) stays in body tokens (`utils/dropInitial.ts`) |
| `{DIAG.}` (empty) | Diagram envelope block; `{DIAG. caption}` inline → `figure_anchor` token |
| `{ILL.}`, `{MIN.}`, `{SYMB.}` | Inline `figure_anchor` with per-folio sequential `figureId` |
| `{CW.}`, `{SG.}` | Catchword and signature |
| Line prefix `1 ` | Physical line number on block |

Prose lines flush one block per line. Environment blocks (`RUB`, `GL`, `AD`) continue across lines only when the line ends with `+`; otherwise a **soft-flush** resets to prose (recovering from a missing `}`). Explicit `}` still closes the environment.

Word counts and concordance lemmas are derived from **`reconstructedFlow`** (hyphen-stitched reading text per folio), not from per-line token splits. That keeps margin hyphenation (`adela-` + `ntar` → `adelantar`) aligned between stats and KWIC search.

**Legacy parity** (`utils/legacyDiacritics.ts`, `preprocessSentinels`):

- Double parentheses `((` / `))` → sentinels before lexer (legacy я / ь pass).
- `@`-notation diacritics (`a@'`, `o@~`, `c'`, etc.) → Unicode via `resolveLegacyDiacritic`.
- `reconstructPageFlow` / `reconstructedFlow` — hyphen-split words stitched across prose blocks (legacy `GetCountLocations`).
- `escapeRegex` / `buildLanguageTagPattern` — safe dynamic language mnemonic matching (`constants/languageTags.ts`).
- `LINE_PREFIX_RE` — Roman numerals and bracketed margin refs (`cxxxi`, `cxxx[ij].`); no trailing `\b` (preserves `1 {RUB.…}` / `1 {IN4.…}`); rejects bare 3–4 digit year-like prefixes unless `{` follows.
- `{BLNK.}` and `{BLNK: footprint comment}` — optional meta in `blank_space` tokens.
- Sticky lexer rules without `^` anchors; standalone `~` → `otiose_mark` (toggle **Hide otiose ~**).
- `language_span` blocks — dynamic `{LAT.}`, `{ENG.}`, etc. with `+` continuation and `}` closure (`utils/environmentBlocks.ts`).
- Diacritic clusters allow inline `<expansion>` before vowel marks (e.g. `c<r>on@~`).
- Trailing expansions after a diacritic cluster are one token (e.g. `te~<n>de` → normalized `tende`).
- `reconstructManuscriptFlow` carries hyphenated word fragments across folio boundaries.
- **Paleographic brackets** (`utils/hsmsLexer.ts`, rule order matters): `[*text]` → `reconstructed_text`; `[??]` → `illegible_text`; loose `??` → `missing_fragment`; `[ ]` / `[]` → `mechanical_lacuna`; other `[text]` → `editorial_insertion`.

### 4. Layout engines

Two render paths share the same `ParsedManuscript` but differ in typography mechanics:

#### 4a. React Native parchment (`app/(tabs)/index.tsx`)

- **`ReaderStateContext`** — toggles expansion, deletion, normalized diacritics, and otiose marks in preview.
- **Publication metadata** — `hasPublicationMeta` card above the parchment `ScrollView`; removed from inside the leaf so `{RMK:}` content is not duplicated in the transcription column.
- **`FolioPage`** — renders headings, blocks, catchword/signature per folio; optional `SvgFacsimilePage` when `svgModeEnabled` is on (Metro resolves `.web.tsx` on web).
- **`groupBlocksForLayout`** — sequential blocks with `columns === 2` are split into left/right vertical tracks (not horizontal flex-wrap).
- **`BlockRenderer`** — delegates prose to `BlockFigureLayout`; legacy `initial_container` blocks still supported.
- **`BlockFigureLayout`** — partitions `{ILL.}` / `{MIN.}` / `{DIAG.}`; **flushes adjacent text segments into a single `<Text>`** per block to avoid per-fragment justification glitches on web.
- **`TokenStream`** — maps token types to nested `Text`; `drop_initial` uses rubric-colored bold cap (`dropCapFontSize`).
- **Prose styles** — `blockText` uses left alignment (not `justify`) and no `flex: 1` on the text node, preventing first-word font stretching in nested `Text` trees.

#### 4b. SVG facsimile (`components/SvgFacsimilePage*.tsx`)

When **SVG canvas** is enabled in the advanced editor, each folio renders through the spatial pipeline:

1. `getPrintableBlocks()` strips any `{RMK:}` leaks (`utils/metadataBlocks.ts`).
2. `groupFolioLayout()` (`components/svgFacsimile/folioGroups.ts`) calls `buildSpatialFolio()` and emits `column-block` → `single` / `two-col` groups.
3. **Shared layout** (`components/svgFacsimile/pageLayout.ts`) — fixed `CANVAS_W = 800`, margins, gutter, and column width helpers; both renderers sit in a horizontal `ScrollView` on narrow viewports.
4. **Web** (`SvgFacsimilePage.web.tsx`): SVG parchment shell (ruling lines, margins) plus HTML rows inside `<ForeignObject>` — `HtmlOrnateDropCap` for `{INn.}` caps (ornate SVG or uploaded scan), micro-tracking justification, cap gutter via `HtmlCapState`, `%2` wrap-back overlay. After `blockToSegs`, `stripDropCapPrefixFromSegs()` removes any duplicated cap grapheme from the first body segment before justification. Line height `LH` comes from `tokenRendering.ts` (not `pageLayout.ts`). `useEffect` + `ResizeObserver` measure dynamic parchment height.
5. **Native** (`SvgFacsimilePage.tsx`): one ruled baseline row per `ManuscriptBlock`; auto-flowing `<TSpan>` siblings inside a single `<SvgText>` (no manual `dx`/`dy`); `%2` suffix painted at measured main-text width; same `stripDropCapPrefixFromSegs` guard as web. Drop caps use `renderOrnateInitialSvg` (four seeded style matrices — vines, criblé, ribbon, damask — or uploaded scan); see [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md).
6. Token styling is shared via `components/svgFacsimile/tokenRendering.ts` (`tokenToSegs`, `coalesceSegs`, `blockToSegs`, `stripDropCapPrefixFromSegs` — rubric segments cloned, not mutated in place).

Cap state (`{INn.}` depth) persists across consecutive single-column lines until the next initial or column change. Multi-letter cap boxes widen via `dropCapBoxWidth(capH, letterCount)` when needed. Two-column `{CB2.}` blocks zip left/right rows at equal index (not all-left-then-all-right). Full divergence notes (drop caps, `%2` wrap-back, `coalesceSegs`): [HSMS-LAYOUT.md §6.5](HSMS-LAYOUT.md).

### Scriptorium workspace (Phases 1–2)

| Module | Role |
|--------|------|
| `utils/scriptoriumWorkspace.ts` | AsyncStorage index (`hsms.scriptorium.workspaces.v1`); create/load active workspace; title inference from `{RMK:}` lines |
| `utils/figureAssetStorage.ts` | Copy picked images to `documentDirectory/scriptorium/<workspaceId>/figures/<figureId>.ext` |
| `FigurePlaceholder` | Tap to attach; **Replace** / **Remove** when a facsimile is present |

Figure slots stay keyed by stable `figureId` (per folio) inside `assetMap`, so editing the transcription does not orphan uploaded images. The home screen persists `transcriptionText` on debounce and exposes an editable workspace title plus **New workspace**.

### Facsimile layout & packaging (Phases 3–6)

| Phase | Module | Role |
|-------|--------|------|
| 3 | `utils/figureLayout.ts`, `components/BlockFigureLayout.tsx` | `{ILL.}` in a margin track; `{MIN.}` inline; `{DIAG.}` full-width |
| 4 | `utils/hsmsBundle.ts` | Export/import portable `.hsms` JSON bundles (transcription + base64 assets) |
| 5 | `utils/batchProcessor.ts`, `BatchProcessingPanel`, `ResponsiveBatchShell`, `ManuscriptSelector` | In-app multi-file batch compile + witness switcher |
| 5b | `utils/ostaBatchConverter.ts`, `utils/renderMarkupLeakage.ts`, `scripts/batch-convert-osta.ts` | Headless OSTA corpus batch (CLI); writes `out/` with lint, parse, and HTML render leakage logs |
| 6 | `components/FolioFacsimileCanvas.tsx` | Folio leaf scans, tap-to-place free fragments (`freePlacements`) |

### Scholarly outputs (post-parse)

`enrichParsedManuscript` runs at the end of `parseHsMsText`:

| Module | Role |
|--------|------|
| `buildConcordance` | Lemma index from each folio’s `reconstructedFlow` (single-pass `RegExp.exec`; hyphen joins preserved) |
| `validateTranscription` | Multi-line `{ENV.}` continuation, folio-before-`}`, dangling `+`, stray `}` |
| `scanLineLexicalIssues` / `scanStructuralTokenIssues` | Parse-time checks using shared `lexicalPatterns` (no regex drift) |
| `validateTranscription` / `lintHsmsTranscription` | Fast pre-render lint (folio leaks, env stack, lexical brackets); CLI: `npm run lint:hsms` |
| `renderNormalizedText` | Strip deletions/calderones; inline expansions; u/v orthography hints |
| `exportToTEIXML` | Map tokens/blocks to TEI P5 (`choice`, `del`, `add`, `head`, `pb`, `foreign`, `pc`); escaped `<abbr>` from `token.raw`; `rend="columns-N"` on blocks |
| `exportToLegacyHTML` | Self-contained HTML mirroring HSMSLib (`LightGoldenrodYellow`, table rows, `float:left` `{INn.}` caps, `<i>` expansions) |
| `shareTextFile` | Cache write + native share or web download (used for `.html` export) |

Preview UI adds **Concordance** drawer (virtualized `FlatList`, memoized entry rows; tap occurrence → folio/line highlight), **TEI export** (system share), **Synoptic pane** toggle (split diplomatic + normalized when viewport ≥ 640px; scroll-sync gate in `SynopticFolioSplit`), and **Validation** banner in transcription mode.

### UI components (performance and UX)

| Component | Notes |
|-----------|-------|
| `ConcordanceDrawer` | `React.memo` on entry rows; tuned `FlatList` windowing for large lemma lists |
| `SynopticFolioSplit` | `isScrolling` gate (~20 ms) prevents scroll feedback loops; `maxWidth: 1200`; fixed pane height |
| `FolioFacsimileCanvas` | Clamped tap/pin coordinates; `useMemo` / `useCallback` for placement handlers |
| `ManuscriptSelector` | Elevated `zIndex` when open; `overflow: hidden`; accessibility labels |
| `SvgFacsimilePage.web` | Explicit px typography; memoized display settings; `ResizeObserver` teardown in `useEffect` |
| `tokenRendering` | `blockToSegs` returns cloned rubric segments (no in-place mutation of shared token data) |

### State model

**ScriptoriumContext:**

```
workspace, registry, activeFileName
localEditorBuffer → editorBuffer → debouncedText (400ms)
parsedManuscript = compileManuscriptTree(debouncedText)
isParsing = localEditorBuffer !== debouncedText
isCompiling, compilationStatus  # file / .hsms import only
uploadedImages ← workspace.assetMap
```

**Studio screen (local UI):**

```
isEditorMode: boolean          # default false
isPreview: boolean
showExpanded / showDeletions / showNormalizedDiacritics / suppressOtioseMarks
showSynoptic / facsimileCanvasEnabled / placementMode / svgModeEnabled
concordanceOpen, batchShellVisible
```

**Cross-cutting context** (`app/_layout.tsx`):

| Provider | Role |
|----------|------|
| `ScriptoriumProvider` | Unified workspace: persisted `ScriptoriumWorkspace`, batch `ManuscriptRegistry`, editor buffers, `parsedManuscript`, `assetMap`, `isCompiling` / `compilationStatus` on import |
| `ScrollAnchorProvider` | Parchment `ScrollView` ref, folio/line layout offsets, `navigateToAnchor` / `navigateToLineIndex` |

`app/(tabs)/index.tsx` consumes `useScriptorium()` for data/actions and keeps only UI-local state (preview toggles, concordance drawer, synoptic options). `app/modal.tsx` reads validation errors via the same context.

Concordance and validation rows call scroll navigation via `ScrollAnchorProvider`.

### Parser and export performance

The compiler path is synchronous but tuned for large OSTA files:

| Area | Technique |
|------|-----------|
| `manuscriptParser.ts` | Module-level cached `RegExp` instances; chunk-based string assembly for reading flows |
| `concordance.ts` | O(N) indexing with sticky patterns; cached lemma regexes; word counts without intermediate split arrays |
| `legacyDiacritics.ts` | Static compiled cluster patterns |
| `normalizedText.ts` | Precompiled replace regex; string buffer array instead of repeated concatenation |
| `structuralAssembly.ts` | Deep-copy stack frames when attaching `envLayers` (safe across re-parses) |
| `batchProcessor.ts` | Deep-cloned status snapshots; ~16 ms UI yield between files |
| `teiExport.ts` | Chunked XML assembly; reverse-loop environment lookup |
| `expoFileSystem.ts` | Chunked base64 decode; Blob URL revoke on web reads |

## Cross-cutting concerns

### Platform

- **iOS / Android** — primary targets; safe areas via `react-native-safe-area-context`.
- **Web** — supported via `react-native-web` and `start:web` script; `utils/expoFileSystem.ts` shims directory creation and file reads where `expo-file-system` APIs are missing. UI shadows on web use `utils/platformShadow.ts` (`boxShadow`) instead of deprecated `shadow*` style props.
- **Haptics** — success/selection feedback on import and sample load (native only).

### Deep linking

`app/+native-intent.tsx` exports `redirectSystemPath` and always returns `/`, sending external intents to the home tab.

### Error handling

Import failures surface `Alert` dialogs; parse errors are not distinguished (malformed text still renders best-effort).

## HSMS legacy data assets

| Asset | Purpose |
|-------|---------|
| `assets/dic/hsms.src` | DB_MAP lemmatization dictionary (surface forms → lemmas) |
| `utils/generated/hsmsDiacriticMap.ts` | Character rules from legacy `settings.ini` `[RegexReplaces]` |
| `utils/generated/hsmsLemmaIndex.json` | Compact index built from `hsms.src` |

Regenerate: `npm run generate:hsms-assets`

Note: `hsms.src` does **not** use `code+unicode` lines; diacritic mappings come from the C# parser’s `CharRegexReplacements` / INI configuration, expanded into literal keys by `scripts/generate-diacritic-map.mjs`.

## Testing

| Suite | Command | Scope |
|-------|---------|--------|
| Unit | `npm test` | Parser, spatial AST, concordance, normalization, figure layout, RMK strip, brace blocks, paleography, render leakage, Pedro Nunes parity (**158 tests**). **Never reads OSTA files.** |
| OSTA integration | `npm run test:osta` | `__tests__/integration/osta/*.test.ts` — compiles/validates sibling `OSTA/transcriptions/` when present |

**Jest configuration:**

- `jest.config.js` — default unit suite; `testPathIgnorePatterns` excludes `__tests__/integration/`.
- `jest.osta.config.js` — integration-only match; loads `jest.osta.setup.js` (`OSTA_INTEGRATION=1`).
- `__tests__/integration/osta/ostaPaths.ts` — resolves `OSTA/transcriptions/`; `requireOstaIntegration()` guard.

**Pedro Nunes reference** (sibling `../PedroNunes-TRS/text-TRS.txt`): `__tests__/pedroNunesTrsParity.test.ts` checks drop caps, diacritics, and heading tokenization against legacy HTML output. `__tests__/spatialAst.test.ts` covers column blocks, `{CB2.}` zip, and folio 1v `{IN5.}`. `__tests__/hsmsPaleography.test.ts` covers single-grapheme `{IN4.} AO` peel, bracket/`??` lexer rules, and lacuna spacing in facsimile segments. Override corpus path with `PEDRO_NUNES_TRS_PATH`.

**Layout for OSTA regression:**

```
_gu/
├── OSTA/                          # clone from github.com/hispanicseminary/OSTA
│   └── transcriptions/
│       ├── TEXT.CDP.txt
│       └── …
└── hsms-manuscript-viewer/
    ├── __tests__/integration/osta/
    ├── out/                       # npm run batch:osta (gitignored)
    └── reports/                   # optional: OSTA_WRITE_REPORTS=1 with test:osta
```

Override corpus path with `OSTA_TRANSCRIPTIONS_PATH`.

## OSTA batch conversion (CLI)

Headless batch processing complements in-app **Batch folder** and Jest integration:

| Command | Output |
|---------|--------|
| `npm run batch:osta` | For each `*.txt` in OSTA transcriptions: legacy HTML, compact native TS bundle (`hsms-native-bundle/2`: transcription + `compileManuscriptTree` at import), and `<baseName>.issues.log` (`[LINT]`, `[PARSE]`, `[RENDER]`) under `out/`; then aggregates `issues-summary.txt` and `issues.json` |
| `npm run report:osta` | Re-run aggregation from existing `out/*.issues.log` only |

Per-file logs are built by `formatIssueLog` in `utils/ostaBatchConverter.ts`. **Render leakage** uses `utils/renderMarkupLeakage.ts` on exported HTML. OSTA batch passes `{ skipLacunaChecks: true }` so mechanical lacuna `[ ]` patterns and the per-token render walk are skipped (corpus performance); lacuna syntax remains in `[LINT]` when flagged.

Flags: `--limit=N`, `--in <dir>`, `--out <dir>`, `--no-report` (batch only). Prefer `npx tsx scripts/batch-convert-osta.ts` if npm swallows `--limit`. See `scripts/batch-convert-osta.ts` and `scripts/aggregate-osta-issues.ts`.

## Extension points

Planned or natural evolution paths (also noted on the About screen):

1. ~~**Parser tests**~~ — unit tests + optional [OSTA](https://github.com/hispanicseminary/OSTA) corpus integration (`test:osta`).
2. ~~**Persistence**~~ — `ScriptoriumWorkspace` index in AsyncStorage; transcription + `assetMap`; figure JPEG/PNG copied under `documentDirectory/scriptorium/<workspaceId>/figures/`.
3. **React Query** — load transcriptions or TEI from remote catalogs.
4. ~~**TEI export**~~ — `exportToTEIXML` + share sheet (basic header/body mapping).
5. ~~**Dual view**~~ — synoptic diplomatic + normalized panes (wide layout).
6. **Typography** — selectable script hands (fonts) per manuscript tradition.
7. **Concordance tuning** — configurable frequency thresholds, custom stopword lists, export appendix.
8. ~~**Inline figure upload**~~ — `figure_anchor` tokens + `FigurePlaceholder`; workspace-scoped assets via `figureAssetStorage` (replace/remove controls).
9. **Image pane** — third synoptic column for full-leaf facsimile URLs.
10. ~~**Reader-first UX**~~ — default upload-only surface; advanced editor toggle; compilation overlay; metadata card outside parchment.

## Build and quality

- **TypeScript** — strict typing for domain models; Expo Router typed routes experiment enabled in `app.json`.
- **Lint** — `expo lint` via ESLint 9 + `eslint-config-expo`.
- **New Architecture** — `newArchEnabled: true` in Expo config.

## Security and privacy

Transcription content stays on-device during import and editing. File picker copies uploads to a cache URI for reading; nothing is sent to a backend in the current implementation.
