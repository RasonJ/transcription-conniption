export type FigureMnemonic = "ILL" | "MIN" | "DIAG" | "SYMB";

export type TokenType =
  | "text"
  | "expansion"
  | "superscript"
  | "scribal_deletion"
  | "editorial_deletion"
  | "scribal_insertion"
  | "editorial_insertion"
  | "reconstructed_text"
  | "illegible_text"
  | "missing_fragment"
  | "mechanical_lacuna"
  | "calderon"
  | "calderon_two"
  | "calderon_three"
  | "blank_space"
  | "otiose_mark"
  | "hyphen"
  | "figure_anchor"
  | "env_open"
  | "env_close"
  | "scribal_punctuation"
  | "drop_initial"
  | "citation_wrap";

export type BlockType =
  | "prose"
  | "rubric"
  | "gloss"
  | "addendum"
  | "language_span"
  | "diagram"
  | "initial_container";

export type EnvLayer = {
  type: BlockType;
  code: string;
};

export interface Token {
  type: TokenType;
  value: string;
  raw: string;
  hand?: string;
  /** Resolved Unicode when diacritic normalization applies (raw keeps diplomatic form). */
  normalized?: string;
  /** Stable placement key for uploaded facsimile slots (e.g. fol_3r_fig_001). */
  figureId?: string;
  figureType?: FigureMnemonic;
  /** Nested inline environment stack (innermost last) at token position. */
  envLayers?: EnvLayer[];
  /** Line-depth for `{INn.}` illuminated initials (legacy HTML float parity). */
  initialDepth?: number;
}

export interface ManuscriptBlock {
  type: BlockType;
  columns: number;
  tokens: Token[];
  lineNumber?: string;
  hand?: string;
  /** HSMS language mnemonic when line opens with {LAT.} etc. */
  language?: string;
}

export interface FolioSide {
  id: string;
  headings: string[];
  blocks: ManuscriptBlock[];
  catchword?: string;
  signature?: string;
  /** Prose blocks stitched across line-ending hyphens (legacy GetCountLocations). */
  reconstructedFlow?: string;
}

export interface WordOccurrence {
  folioId: string;
  lineNumber: string;
  blockIndex: number;
  preContext: string;
  postContext: string;
  keyword: string;
}

export type ConcordanceIndex = Record<
  string,
  {
    count: number;
    occurrences: WordOccurrence[];
  }
>;

export interface ValidationError {
  severity: "error" | "warning";
  message: string;
  lineIndex: number;
  rawSnippet: string;
}

/** User-placed facsimile pin on a folio canvas (Phase 6). */
export interface FacsimilePlacement {
  placementId: string;
  folioId: string;
  figureType: FigureMnemonic;
  caption: string;
  /** 0–1 position within the folio facsimile canvas. */
  relX: number;
  relY: number;
}

/** Persistent facsimile workspace: transcription + figure assets keyed by stable figureId. */
export interface ScriptoriumWorkspace {
  id: string;
  manuscriptTitle: string;
  /** Original upload filename when imported from disk. */
  sourceFileName?: string;
  transcriptionText: string;
  /** figureId → absolute file URI under app documentDirectory/scriptorium/ */
  assetMap: Record<string, string>;
  /** folioId → full-leaf scan URI */
  folioBackgrounds?: Record<string, string>;
  /** Tap-to-place overlays not tied to HSMS figure_anchor tokens */
  freePlacements?: FacsimilePlacement[];
  createdAt: string;
  lastModified: string;
}

export interface BatchFileStatus {
  fileName: string;
  fileSize: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  stats?: {
    totalWords: number;
    totalLines: number;
    rubricCount: number;
    glossCount: number;
    anomalyCount: number;
  };
}

export interface BatchSummary {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalWordsProcessed: number;
  totalAnomaliesDetected: number;
  elapsedTimeMs: number;
}

export interface ManuscriptRegistryEntry {
  rawText: string;
  parsedTree: ParsedManuscript;
  uploadedImages: Record<string, string>;
}

export type ManuscriptRegistry = Record<string, ManuscriptRegistryEntry>;

export interface WorkspaceIndexEntry {
  id: string;
  manuscriptTitle: string;
  sourceFileName?: string;
  createdAt: string;
  lastModified: string;
}

export interface WorkspaceIndex {
  activeWorkspaceId: string;
  workspaces: Record<string, WorkspaceIndexEntry>;
}

export interface ParsedManuscript {
  metadata: {
    author: string;
    title: string;
    imprint: { city?: string; printer?: string; date?: string };
    witness: { city?: string; library?: string; shelfmark?: string };
  };
  folios: FolioSide[];
  stats: {
    totalWords: number;
    totalLines: number;
    rubricCount: number;
    glossCount: number;
  };
  /** Full manuscript reading flow with hyphen continuity resolved. */
  reconstructedFlow?: string;
  /** Lexicon keyed by normalized lemma (stopwords excluded). */
  concordance?: ConcordanceIndex;
  /** Structural syntax issues detected in the source transcription. */
  validationErrors?: ValidationError[];
}
