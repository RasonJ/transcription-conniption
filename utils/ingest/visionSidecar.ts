/**
 * Sidecar for machine-transcribed witnesses (SPEC-PDF-INGEST §5, §7).
 *
 * The Azure vision path returns HSMS per page but no line geometry or confidence, so the
 * sidecar records what is known: which source lines belong to which folio side, the review
 * state of each side (machine draft, or needs_attention when the linter still reports
 * errors), and provenance. That is enough for the review workflow and the copilot's
 * `ingest.unreviewed` recipe; line polygons and confidence stay empty until a pipeline that
 * produces them (IIIF linking, server HTR) fills them in.
 */
import { hashWitnessText, lineAnchors, splitWitnessLines } from "./sidecarAlign";
import { FACS_SIDECAR_FORMAT, type FolioReviewState, type HsmsFacsSidecar, type SidecarFolio, type SidecarLine } from "./types";

export interface MachinePage {
  folioId: string;
  pageNumber: number;
  errorCount: number;
  warningCount?: number;
}

export interface MachineTranscriptionMeta {
  pages: MachinePage[];
  sourceKind: "pdf" | "image" | "iiif";
  sourceName?: string;
  /** Model / agent identifier for provenance. */
  model?: string;
}

const RE_FOLIO = /^\s*\[fol\.\s*([^\]\s]+)\s*\]/i;

const EMPTY_GEOMETRY: SidecarFolio["geometry"] = {
  aspect: 0,
  writingArea: [0, 0, 1, 1],
  columns: [],
  meanLineSpacing: 0,
  linesPerColumn: [],
};

/** Source line ranges per `[fol. …]` heading: folioId → line indices (non-empty lines). */
export function folioLineRanges(text: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let current: string | null = null;
  splitWitnessLines(text).forEach((line, i) => {
    const m = line.match(RE_FOLIO);
    if (m) {
      current = m[1].toLowerCase();
      if (!out.has(current)) out.set(current, []);
    }
    if (current && line.trim()) out.get(current)!.push(i);
  });
  return out;
}

export function sidecarFromMachineTranscription(
  text: string,
  meta: MachineTranscriptionMeta,
  now: Date = new Date(),
): HsmsFacsSidecar {
  const ranges = folioLineRanges(text);
  const anchors = lineAnchors(splitWitnessLines(text));
  const byFolio = new Map(meta.pages.map((p) => [p.folioId.toLowerCase(), p]));
  const folios: HsmsFacsSidecar["folios"] = {};
  const textFolios = [...ranges.keys()];
  textFolios.forEach((folioId, i) => {
    // A single image ("leaf") maps onto the first folio heading the agent wrote.
    const page = byFolio.get(folioId) ?? (meta.pages.length === 1 && i === 0 ? meta.pages[0] : undefined);
    const review: FolioReviewState = page && page.errorCount > 0 ? "needs_attention" : "machine";
    const lines: SidecarLine[] = (ranges.get(folioId) ?? []).map((sourceLine) => ({
      sourceLine,
      anchor: anchors[sourceLine],
      polygon: [],
      baseline: [],
      zone: "MainZone",
    }));
    folios[folioId] = {
      canvasId: page ? `page:${page.pageNumber}` : `folio:${folioId}`,
      imageService: "",
      pixelSize: [0, 0],
      geometry: EMPTY_GEOMETRY,
      review,
      lines,
    };
  });
  return {
    format: FACS_SIDECAR_FORMAT,
    witnessHash: hashWitnessText(text),
    source: { kind: meta.sourceKind === "iiif" ? "iiif" : "pdf", rights: "", manifestUrl: undefined },
    pipeline: {
      jobId: `local-${now.getTime().toString(36)}`,
      stages: { transcription: { model: meta.model ?? "azure-vision-agent", version: "1", at: now.toISOString() } },
    },
    folios,
  };
}

/** Set one folio's review state (returns a new sidecar). */
export function withFolioReview(sidecar: HsmsFacsSidecar, folioId: string, review: FolioReviewState): HsmsFacsSidecar {
  const folio = sidecar.folios[folioId];
  if (!folio || folio.review === review) return sidecar;
  return { ...sidecar, folios: { ...sidecar.folios, [folioId]: { ...folio, review } } };
}
