/** Analysis capabilities; ingest-related entries are backend-only. */
export type Capability =
  | "concordance"
  | "facets"
  | "ngrams"
  | "collocations"
  | "pos_tagging"
  | "clause_parsing"
  | "corpus_diachronic"
  | "aljamiado_mapping"
  | "dialect_features"
  | "pdf_ingest"
  | "htr"
  | "iiif_hosting";

export const INGEST_CAPABILITIES: readonly Capability[] = ["pdf_ingest", "htr", "iiif_hosting"];

export type FolioId = string;
export type FigureId = string;

/** `[x, y, w, h]`; normalized 0–1 for geometry, image px for sidecar word boxes. */
export type Box = [x: number, y: number, w: number, h: number];

export const FACS_SIDECAR_FORMAT = "hsms-facsimile-sidecar/1";

export type FolioReviewState = "machine" | "in_review" | "reviewed" | "needs_attention";

export interface FolioGeometry {
  /** Page height / width. */
  aspect: number;
  /** Ruled frame, normalized 0–1. */
  writingArea: Box;
  /** Per column, normalized 0–1. */
  columns: Box[];
  /** Normalized to page height. */
  meanLineSpacing: number;
  linesPerColumn: number[];
  /** Keyed by line index. */
  initials?: Record<string, Box>;
  marginZones?: Box[];
}

export interface SidecarMachineExpansion {
  at: number;
  proposal: string;
  conf: number;
  status: "proposed" | "accepted" | "rejected";
}

export interface SidecarLine {
  /** Line index in witness.txt. */
  sourceLine: number;
  /** Content hash + ordinal, for re-alignment after edits. */
  anchor: string;
  /** Image px. */
  polygon: [number, number][];
  baseline: [number, number][];
  /** SegmOnto zone type. */
  zone: string;
  /** Mean char confidence 0–1; absent when the recognizer does not report it. */
  confidence?: number;
  lowConfidenceSpans?: Array<[start: number, end: number, conf: number]>;
  words?: Array<{ text: string; box: [x: number, y: number, w: number, h: number] }>;
  machineExpansions?: SidecarMachineExpansion[];
}

export interface SidecarFolio {
  /** IIIF canvas id. */
  canvasId: string;
  /** IIIF Image API base URL. */
  imageService: string;
  pixelSize: [w: number, h: number];
  dpi?: number;
  geometry: FolioGeometry;
  review: FolioReviewState;
  lines: SidecarLine[];
  figures?: Record<FigureId, { polygon: [number, number][]; crop: string }>;
}

export interface HsmsFacsSidecar {
  format: typeof FACS_SIDECAR_FORMAT;
  /** Hash of the witness.txt this sidecar was built for. */
  witnessHash: string;
  source: {
    kind: "pdf" | "iiif" | "edition_pdf";
    sha256?: string;
    manifestUrl?: string;
    rights: string;
    institution?: string;
    shelfmark?: string;
  };
  pipeline: {
    jobId: string;
    stages: Record<string, { model?: string; version: string; at: string }>;
  };
  folios: Record<FolioId, SidecarFolio>;
}
