# Architecture

Transcription Conniption is a cross-platform mobile and web app built with **Expo** and **React Native**. It ingests line-based diplomatic transcriptions ([HSMS](https://hispanicseminary.org/manual-en.htm) / [OSTA](https://github.com/hispanicseminary/OSTA) plain text), parses structural markers, and renders a parchment-style manuscript leaf for scholarly preview.

## Acknowledgments and reference materials

| Resource | URL |
|----------|-----|
| Hispanic Seminary of Medieval Studies | [hispanicseminary.org](https://hispanicseminary.org/index.htm) |
| HSMS *Manual of Manuscript Transcription* (English) | [hispanicseminary.org/manual-en.htm](https://hispanicseminary.org/manual-en.htm) |
| OSTA transcription guide | [hispanicseminary.org/osta-en.htm](https://hispanicseminary.org/osta-en.htm) |
| OSTA corpus (paleographic transcriptions) | [github.com/hispanicseminary/OSTA](https://github.com/hispanicseminary/OSTA) |
| In-app OSTA citation / query cheat-sheet | [OSTA-guide.md](OSTA-guide.md) |
| Azure vision → HSMS (hybrid gpt-4o + gpt-5.4-mini Pass 2) | [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md) · [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md) |
| Porting notes from `gu/manuals` | [PORTING-FROM-HSMS-MANUALS.md](PORTING-FROM-HSMS-MANUALS.md) |

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
│  Transcription  │                    │  HSMS / OSTA refs │
│  + AI scan OCR  │                    │  funding + guides │
│  + rendered leaf│                    │  citation cards   │
└─────────────────┘                    └───────────────────┘
```

The app follows a **file-based routing** model via [Expo Router](https://docs.expo.dev/router/introduction/). Parsing lives under `utils/`; persistent workspace state in `context/ScriptoriumContext.tsx`; parchment rendering in `app/(tabs)/index.tsx` (React Native `Text` layout) and, when **SVG canvas** is enabled, `components/SvgFacsimilePage.web.tsx` (web) or `components/SvgFacsimilePage.tsx` (native). Optional **Azure** vision transcription (hybrid OpenAI Responses: gpt-4o vision + gpt-5.4-mini syntax repair) lives under `services/`. See [HSMS-LAYOUT.md](HSMS-LAYOUT.md) for the spatial AST and coordinate layout model, and [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md) for parchment aesthetics and typographic fidelity.

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
| File import | expo-document-picker | Plain-text / image / PDF upload |
| Azure backoff | Hybrid Responses (`azureOpenAI` + orchestrator) | Vision OCR → lint → optional / batched Pass 2 |
| Package manager | Bun | Install and script execution |


## Application structure

```
app/
  _layout.tsx           # Root providers, splash, stack over tabs
  (tabs)/
    _layout.tsx         # Bottom tab bar (Studio, Sources)
    index.tsx           # Main screen: import, edit, render
    about.tsx           # HSMS / OSTA refs, funding, OSTA guide cards
  modal.tsx             # Template modal (unused in main flow)
  +native-intent.tsx    # Deep-link redirect → home
  +not-found.tsx        # 404 route

services/
  azureOpenAI.ts              # Responses client (timeouts, 429 retry)
  azureA2A.ts                 # Optional Foundry A2A v0.3 wire
  azureAgentConfig.ts         # Hybrid env / role routing helpers
  azureAgentOrchestrator.ts   # Session context + chatWithAzureAgent
  azureHsmsTranscriber.ts     # Single-leaf Pass 1 → lint → optional Pass 2
  passTwoRepairService.ts     # Per-leaf + batched syntax repair
  batchTranscriptionService.ts # PDF Pass 1 stream + batched Pass 2
  hsmsOpenAIInstructions.ts   # Re-anchored Agent 1/2 system prompts

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
  analyzeManuscript.ts  # enrichParsedManuscript (validation merge; concordance is lazy)
  concordance.ts        # O(N) KWIC index via RegExp.exec on reconstructedFlow
  embeddings/           # hashEmbed + intentClassifier (local micro-vectors)
  manuscriptVectorIndex.ts # ParsedManuscript → contiguous Float32 embed matrix
  manuscriptSearch.ts   # Folio fast-path + cosine top-K + askManuscript router
  validation.ts         # Multi-line environment stack (stray `}` guards)
  normalizedText.ts     # Diplomatic → student reading edition (buffer + cached regex)
  teiExport.ts          # ParsedManuscript → TEI P5 (escaped abbr/expan, rend attrs)
  regexUtils.ts         # escapeRegex, toStickyRegex (deduplicated flag sets)
  environmentBlocks.ts  # ENVELOPE_MAP block types; parseEnvironmentOpen
  batchProcessor.ts     # Multi-file compile with rAF / setTimeout UI yields
  pdfPageExtractor*.ts  # Client PDF → upright PNG/JPEG frames (web pdf.js)
  ostaBatchConverter.ts # Headless OSTA batch: HTML + native TS bundles + *.issues.log
  ostaIssueReport.ts    # Aggregate issue logs → issues-summary.txt / issues.json
  figureAnchors.ts      # Figure ID allocation and {ILL|MIN|DIAG|SYMB} patterns
  legacyDiacritics.ts   # Precompiled cluster regex; @-notation word units
  dropInitial.ts        # {INn.} → single-grapheme drop_initial + body remainder
  mufiChars.ts          # MUFI catalog lookup; HSMS→HTML→Unicode triples; ornate inventory
  mufiCharacterMap.ts   # Tier-2 paleographic map; convertHsmsToMufiGlyphs (display-only)
  formatTokenDisplayGrapheme.ts # Per-token MUFI rewrite for parchment toggles
  mufiFonts.ts          # Andron Scriptor (font 53) → Junicode → Georgia stacks
  braceBlocks.ts        # Balanced-brace figure / multi-line open tags
  metadataText.ts       # Normalize RMK title strings for display
  expoFileSystem.ts     # Web shims; chunked base64; Blob URL revoke on web
  exportFile.ts         # Save/share export with flexible SVG dimension parsing
  platformShadow.ts     # Web boxShadow vs native shadow* for UI cards
  svgDocumentExport.ts  # Standalone SVG facsimile document export

scripts/
  batch-convert-osta.ts   # npm run batch:osta
  aggregate-osta-issues.ts # npm run report:osta
  fetch-mufi-catalog.mjs  # npm run fetch:mufi — PDF chart → mufi-chars.json
  generate-mufi-char-map.mjs # npm run generate:mufi — mufiCharMap + ornateInitialInventory

out/                    # Batch output (gitignored): *.html, *.native.ts, *.issues.log, summaries

context/
  ScriptoriumContext.tsx  # Workspace, ManuscriptRegistry, importTextFile, isCompiling

components/
  CompilationOverlay.tsx  # ActivityIndicator + status during file/bundle import
  BlockFigureLayout.tsx   # Figure tracks; merges consecutive text tokens into one <Text>
  svgFacsimile/
    pageLayout.ts         # CANVAS_W=800, MARGIN, gutter, column width helpers (shared web/native)
    folioGroups.ts        # buildSpatialFolio → column-block layout groups
    tokenRendering.ts     # LH, FS; token → styled segments; MUFI display hooks
    HtmlOrnateDropCap.tsx   # Web adapter over utils/initials/scene.ts
    renderOrnateInitial.tsx # Native adapter (renderOrnateInitialSvg) over the same scene
    dropInitialLetterform.ts # Retired matrix geometry; not on the render path
  ConcordanceDrawer.tsx   # Virtualized KWIC drawer (memoized entry rows)
  ManuscriptChatbotDrawer.tsx # Local Ask: folio jump + hash-embed passage search
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
  manuscriptIntents.ts  # Ask-assistant intent prototype phrases
  stopwords.ts          # Spanish function words excluded from index

assets/images/          # App icon, splash, favicons
assets/mufi/            # MUFI v4 catalog, hsms-overlays, fonts/, ornate-initials/ (see README)

docs/
  HSMS-manual.md        # HSMS transcription manual (Markdown, from HSMS-manual.txt)
  HSMS-EDITOR.md        # Editor/builder workflows, workspace, export, batch compile
  HSMS-LAYOUT.md              # HSMS → physical page coordinates (parse + SVG/HTML layout)
  HSMS-TYPOGRAPHY.md          # Visual fidelity: ink, caps, paleography, MUFI display tiers
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
- **Transcribe Scan (AI)** — image/PDF via DocumentPicker → client PDF slicer (`utils/pdfPageExtractor*`) → Pass 1 vision per leaf → local lint; clean folios stream via `onFolioComplete`; flagged leaves share one batched Pass 2 repair (`runBatchPassTwoRepair`) before merge (see [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md)).
- **Batch** — `BatchProcessingPanel` / `ResponsiveBatchShell` (editor mode); per-file status in panel.
- **Library** — catalog entry → `applyTranscription` with precomputed corpus sidecars for Copilot.

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

- **`ReaderStateContext`** — toggles expansion, deletion, normalized diacritics, MUFI graphemes / PUA font, and otiose marks in preview.
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
5. **Native** (`SvgFacsimilePage.tsx`): one ruled baseline row per `ManuscriptBlock`; auto-flowing `<TSpan>` siblings inside a single `<SvgText>` (no manual `dx`/`dy`); `%2` suffix painted at measured main-text width; same `stripDropCapPrefixFromSegs` guard as web. Drop caps use `renderOrnateInitialSvg`, which draws the same `buildInitialScene` as web (witness tradition, or an uploaded scan); see [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md).
6. Token styling is shared via `components/svgFacsimile/tokenRendering.ts` (`tokenToSegs`, `coalesceSegs`, `blockToSegs`, `stripDropCapPrefixFromSegs` — rubric segments cloned, not mutated in place). Optional `useMufiGraphemes` / `usePuaFont` rewrite segment text through `formatTokenDisplayGrapheme` / `convertHsmsToMufiGlyphs` without changing the parsed AST.

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
| `buildConcordance` / `getConcordanceForManuscript` | Lemma index from each folio’s `reconstructedFlow` (single-pass `RegExp.exec`; hyphen joins preserved). Not built during compile; memoized lazily by source identity + `PARSER_VERSION` when the concordance drawer or stats need it |
| `validateTranscription` | Multi-line `{ENV.}` continuation, folio-before-`}`, dangling `+`, stray `}` |
| `scanLineLexicalIssues` / `scanStructuralTokenIssues` | Parse-time checks using shared `lexicalPatterns` (no regex drift) |
| `validateTranscription` / `lintHsmsTranscription` | Fast pre-render lint (folio leaks, env stack, lexical brackets); includes Proofer-style incidents by default (`utils/prooferIncidents.ts`); CLI: `npm run lint:hsms` |
| `auditHsmsProoferIncidents` / MCP `audit_hsms_syntax` | Technical / editorial / structural flags + optional TSV (“Proofer señala; el editor decide”) |
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

**Research copilot** (Studio **Ask** → `ManuscriptChatbotDrawer`; see [SPEC-COPILOT.md](SPEC-COPILOT.md)):

| Layer | Role |
|-------|------|
| `utils/copilot/facetIndex.ts` | Lazy per-witness facets (token types, hands, languages, initials) |
| `utils/copilot/catalog/index.ts` + `utils/copilot/executors/tierA.ts` | Deterministic Tier A recipes (deletions, glosses, damage, …) |
| `utils/copilot/executors/voyant.ts` | Distant-reading recipes: `corpus.term_frequency`, `corpus.ngrams`, `corpus.vocab_density` |
| `utils/copilot/router.ts` / `ask.ts` | Folio + DSL fast paths → **precompiled intent chains** (Tier‑1) → recipe cosine routing → answer cards |
| `utils/copilot/precompiledChains.ts` | Offline graph subgraphs → flat recipes; deterministic match in `askCopilot` |
| `utils/copilot/lifecycle.ts` | Intent taxonomy stages + doActions |
| `utils/copilot/sidecarRecipes.ts` / `mcpSidecarRuntime.ts` | Library sidecars + MCP tools (TF-IDF rank, graph, facets, Proofer audit, vision transcribe) |
| `utils/embeddings/*` | Shared FNV-1a hash-embed + prototype classifier |
| `utils/manuscriptVectorIndex.ts` | Passage-search fallback (`search.passages`) |
| `utils/reasoningGraph/*` | Manuscript scholarly graph (LOD tiers, Claim/Evidence, Pearlian causal, spatial MICRO layer) |
| `schemas/manuscript-reasoning-graph-v1.json` | Sole JSON Schema (`schema_version` 1.0) — see [REASONING-GRAPH.md](REASONING-GRAPH.md) |
| `scripts/compile-copilot.ts` | Regenerates `utils/generated/copilotCatalog.ts` + `mcpManuscriptTools.ts` (`npm run compile:copilot`) |
| `scripts/precompile-graph-intents.ts` | Graph → `assets/precompiled-intent-chains.json` + taxonomy merge (`npm run precompile:graph-intents`) |

**Azure paleography backoff** (hybrid OpenAI Responses; optional A2A):

| Layer | Role |
|-------|------|
| `services/azureOpenAI.ts` | Responses client (timeouts, 429 retry, vision input) |
| `services/azureAgentOrchestrator.ts` | Session context + `chatWithAzureAgent` (vision/syntax roles; A2A→Responses fallback) |
| `services/azureHsmsTranscriber.ts` | Single leaf: Pass 1 → ingest → optional `runPassTwoRepair` (**rejects PDF bytes**) |
| `services/passTwoRepairService.ts` | Per-leaf + **batched** Pass 2 (`runBatchPassTwoRepair`) |
| `services/batchTranscriptionService.ts` | PDF → frames → Pass 1 stream (skip per-page Pass 2) → one batch repair → merge |
| `hooks/useBatchTranscription.ts` | Incremental folio state + progress for Studio |
| `components/TranscriptionProgressBar.tsx` | Live phases: slicing / transcribing / repairing / merging |
| `utils/pdfPageExtractor.web.ts` | pdfjs-dist client slicer + canvas teardown (Expo Web) |
| `utils/pdfPageExtractor.ts` | Native stub / optional `react-native-pdf-to-image` |
| Foundry prompt | [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md) |
| Agent memory rules | `assets/agent-memory/` (`npm run export:agent-memory`) |
| Client ingest gate | `utils/ingestAgentTranscription.ts` |
| HTR → HSMS cleanup | `utils/htrConverter.ts` · MCP `convert_htr_to_hsms` · `npm run convert:htr` |
| Env | `EXPO_PUBLIC_AZURE_TRANSPORT=hybrid` (vision `gpt-4o` + syntax agent / model `gpt-5.4-mini`); see `.env.example` |

Local Tier‑A recipes stay on-device. Azure is only used for vision OCR → HSMS (and conditional syntax repair) when configured. Multi-page PDFs are **never** uploaded as PDF — only per-page PNG/JPEG vision frames. Pass 2 is skipped when the client linter reports zero critical errors.

**Reasoning graph & precompiled intents** ([REASONING-GRAPH.md](REASONING-GRAPH.md)):

```
seedFromWitness / facets / FAQ
        │
        ▼
ReasoningGraphDoc (LOD: MACRO / MESO / MICRO)
        │  npm run precompile:graph-intents
        ▼
intent-taxonomy.json + precompiled-intent-chains.json
        │  Tier-1 match in askCopilot (<1ms)
        ▼
doActions / JUMP_FOLIO / MCP tool hints (no runtime multi-hop GDB)
```

**Library / corpus sidecars** (`npm run build:library` + `sync:library`): `corpus-tfidf.json`, `corpus-stats.json`, `corpus-term-postings.json`, `library-graph.json`, per-witness `*.facets.json` under `assets/library/` / `public/`.

**Lightweight boundary** ([SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md)): concordance is built on demand (`getConcordanceForManuscript`); scholarly modules load via `utils/lazy/loadScholar.ts`; `AnalysisProvider` defaults to local; Tier 2 ingest UI appears only when `EXPO_PUBLIC_ANALYSIS_BACKEND=1`.

**i18n** ([SPEC-I18N.md](SPEC-I18N.md)): `I18nProvider` + Tier 1 catalogs (`en`, `es*`, `pt*`, `ca`, `gl`, `eu`); locale picker on Sources. Witness text and HSMS mnemonics are never translated.

**PDF / IIIF ingest I0** ([SPEC-PDF-INGEST.md](SPEC-PDF-INGEST.md)): sidecar types, `layoutForFolio(geometry?)`, line-diff realignment, bundle v2, IIIF Presentation 3 import (`utils/ingest/*`, `IngestPanel`). No on-device PDF parsing. Vision OCR for HSMS draft text is the separate Azure path above (not IIIF geometry alignment).

### Parser and export performance

The compiler path is synchronous but tuned for large OSTA files:

| Area | Technique |
|------|-----------|
| `manuscriptParser.ts` | Module-level cached `RegExp` instances; chunk-based string assembly for reading flows |
| `concordance.ts` | O(N) indexing with sticky patterns; cached lemma regexes; word counts without intermediate split arrays |
| `legacyDiacritics.ts` | Static compiled cluster patterns |
| `normalizedText.ts` | Precompiled replace regex; string buffer array instead of repeated concatenation |
| `structuralAssembly.ts` | Deep-copy stack frames when attaching `envLayers` (safe across re-parses) |
| `batchProcessor.ts` | Shallow status copies; `requestAnimationFrame` / `setTimeout` yield between files |
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
| `assets/dic/hsms.src` | DB_MAP lemmatization dictionary (surface forms → lemmas + EAGLES-style POS) |
| `utils/generated/hsmsDiacriticMap.ts` | Character rules from legacy `settings.ini` `[RegexReplaces]` |
| `assets/mufi/mufi-chars.json` | Full [MUFI](https://mufi.info/q.php?p=mufi/chars) v4.0 catalog (CC BY-SA 4.0) |
| `utils/generated/mufiCharMap.ts` | MUFI entries with HSMS→HTML→Unicode filled where conventions exist |
| `utils/generated/ornateInitialInventory.ts` | Ornate `{INn.}` inventory (4 procedural styles + optional static SVG paths) |
| `utils/generated/hsmsLemmaIndex.json` | Compact surface→lemma index built from `hsms.src` |
| `utils/generated/hsmsPosIndex.json` | Surface→POS tag index (analizador / EAGLES-style; `lookupHsmsPos`) |
| `public/dic/hsmsLemmaIndex.v2.tsv` | Front-coded web lemma asset (lazy fetch) |
| `public/dic/hsmsPosIndex.json` | Web POS asset (lazy fetch) |

Regenerate: `npm run generate:hsms-assets` (or `npm run generate:dictionary` for lemma/POS only; `npm run fetch:mufi` then `generate:mufi` for the MUFI map).

Runtime: `utils/hsmsDictionary.ts` (`lookupHsmsLemma`, `lookupHsmsPos`, `ensureLemmaDictionary`); `utils/mufiChars.ts` (`lookupMufiByHsms`, `hsmsHtmlUnicodeTriple`, `getOrnateInitialInventory`); **Tier-2 display** via `utils/mufiCharacterMap.ts` (`convertHsmsToMufiGlyphs`) + parchment toggles `useMufiGraphemes` / `usePuaFont` in `tokenRendering.ts`. HSMS ASCII remains the interchange format for storage, lint, and Azure agents; MUFI PUA/decomposed glyphs are canvas-only. Fonts: Junicode OFL under `assets/mufi/fonts/` (loaded in `app/_layout.tsx`); Andron Scriptor ([font 53](https://mufi.info/q.php?p=mufi/fonts/fonts/53)) optional.

Note: `hsms.src` does **not** use `code+unicode` lines; diacritic mappings come from the C# parser’s `CharRegexReplacements` / INI configuration, expanded into literal keys by `scripts/generate-diacritic-map.mjs`. MUFI HTML entities are joined from the same INI plus `assets/mufi/hsms-overlays.json`.

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
6. **Typography** — ~~MUFI Andron/Junicode stacks + display grapheme toggles~~ (see [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md)); remaining: selectable script hands per manuscript tradition.
7. **Concordance tuning** — configurable frequency thresholds, custom stopword lists, export appendix.
8. ~~**Inline figure upload**~~ — `figure_anchor` tokens + `FigurePlaceholder`; workspace-scoped assets via `figureAssetStorage` (replace/remove controls).
9. **Image pane** — third synoptic column for full-leaf facsimile URLs.
10. ~~**Reader-first UX**~~ — default upload-only surface; advanced editor toggle; compilation overlay; metadata card outside parchment.
11. ~~**Azure vision transcription**~~ — hybrid gpt-4o vision + conditional / batched gpt-5.4-mini Pass 2 → linted HSMS ASCII ([AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md)).
12. ~~**Proofer / Voyant / OSTA docs port**~~ — see [PORTING-FROM-HSMS-MANUALS.md](PORTING-FROM-HSMS-MANUALS.md).
13. **Full CQP-style OSTA search UI** — stretch after lemma/POS indexes (documented in OSTA-guide).

## Engineering specs and operator docs

| Spec / doc | Scope |
|------|-------|
| [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) | Load tiers, bundle/startup budgets, lazy lemma dictionary, `AnalysisProvider` backend boundary |
| [SPEC-I18N.md](SPEC-I18N.md) | Instant UI i18n for Iberian and Latin American locales; witness-language stopwords and collation |
| [SPEC-COPILOT.md](SPEC-COPILOT.md) | Multilingual research copilot with precompiled, evidence-tiered recipes |
| [REASONING-GRAPH.md](REASONING-GRAPH.md) | Manuscript reasoning graph schema v1 + offline intent-chain precompile |
| [SPEC-PDF-INGEST.md](SPEC-PDF-INGEST.md) | PDF/IIIF ingest → HSMS draft → image-aligned, geometry-calibrated digital witness |
| [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md) | Hybrid vision → lint → batched Pass 2; env vars; MCP `transcribe_manuscript_image` |
| [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md) | Paste-ready Foundry agent instructions |
| [azure_hsms_transcriber_prompt.md](azure_hsms_transcriber_prompt.md) | Stub → canonical prompt (compat link) |
| [OSTA-guide.md](OSTA-guide.md) | Citation, wildcards, tag crosswalk (About tab cards) |
| [PORTING-FROM-HSMS-MANUALS.md](PORTING-FROM-HSMS-MANUALS.md) | Proofer / analizador / OSTA / Voyant port matrix |
| [HSMS-TYPOGRAPHY.md](HSMS-TYPOGRAPHY.md) | Facsimile ink, ornate initials, MUFI tier-2 display |
| [../assets/mufi/README.md](../assets/mufi/README.md) | MUFI catalog assets, fonts, regenerate (`fetch:mufi` / `generate:mufi`) |

## Build and quality

- **TypeScript** — strict typing for domain models; Expo Router typed routes experiment enabled in `app.json`.
- **Lint** — `expo lint` via ESLint 9 + `eslint-config-expo`.
- **New Architecture** — `newArchEnabled: true` in Expo config.
- **Full preflight** — `npm run preflight` regenerates HSMS dictionary/diacritic indexes, i18n types, Copilot catalog, agent-memory rules, library/corpus sidecars (when `out/` exists), then runs tier + size gates, ESLint, and unit tests. `npm run build:all` runs that pipeline and then `build:web`. See `scripts/preflight.ts`.

## Security and privacy

Transcription content stays on-device during ordinary import, edit, and local Copilot recipes. File picker copies uploads to a cache URI for reading.

**Azure exception:** when Azure OpenAI / Foundry env is configured and the user taps **Transcribe Scan (AI)** (or MCP `transcribe_manuscript_image`), **page image** data URIs (never raw PDF bytes) and session context are sent to Azure Responses / the syntax agent. Multi-page PDFs are sliced client-side first. Do not commit api-keys (`.env` is gitignored; use `.env.example` as the template).
