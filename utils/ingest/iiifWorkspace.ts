/**
 * IIIF import → workspace skeleton (SPEC-PDF-INGEST §4, client-side path without a backend).
 *
 * A manifest gives the folio sequence and the page images but no text. The skeleton is an
 * HSMS transcription with one `[fol. …]` heading per canvas (the researcher transcribes into
 * it) plus a `folioBackgrounds` map so the facsimile view shows each page image.
 */
import { iiifImageUrl, type IiifWitnessDraft } from "./iiifManifest";

const RE_FOLIO_LABEL = /^(?:f(?:ol)?\.?\s*)?(\d{1,4})\s*([rv])$/i;
const RE_RMK_UNSAFE = /[{}]/g;

/** Folio id from a canvas label ("fol. 12v", "f12r", "12 v"), or null. */
export function folioIdFromCanvasLabel(label: string): string | null {
  const m = label.trim().match(RE_FOLIO_LABEL);
  return m ? `${Number(m[1])}${m[2].toLowerCase()}` : null;
}

/** Sequential recto/verso ids: canvas 0 → 1r, 1 → 1v, 2 → 2r … */
export function sequentialFolioId(index: number): string {
  return `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "r" : "v"}`;
}

export interface IiifWorkspaceSkeleton {
  transcriptionText: string;
  manuscriptTitle: string;
  sourceFileName: string;
  folioBackgrounds: Record<string, string>;
  /** Canvas labels that did not look like folio numbers (ids were assigned in sequence). */
  sequentialIds: boolean;
}

export function skeletonFromIiifDraft(draft: IiifWitnessDraft, imageWidth = 2000): IiifWorkspaceSkeleton {
  const parsedIds = draft.canvases.map((c) => folioIdFromCanvasLabel(c.label));
  // Use the labels only when every canvas has one and they are unique.
  const usable = parsedIds.every((id) => id !== null) && new Set(parsedIds).size === parsedIds.length;
  const ids = draft.canvases.map((c, i) => (usable ? (parsedIds[i] as string) : sequentialFolioId(i)));

  const title = draft.label || "IIIF witness";
  const lines: string[] = [];
  lines.push(`{RMK: ${title.replace(RE_RMK_UNSAFE, "")}.}`);
  const source = draft.manifestUrl ?? draft.manifestId;
  if (source) lines.push(`{RMK: IIIF manifest ${source.replace(RE_RMK_UNSAFE, "")}.}`);
  if (draft.rights) lines.push(`{RMK: Rights ${draft.rights.replace(RE_RMK_UNSAFE, "")}.}`);

  const folioBackgrounds: Record<string, string> = {};
  draft.canvases.forEach((canvas, i) => {
    lines.push("", `[fol. ${ids[i]}]`);
    const url = iiifImageUrl(canvas, imageWidth);
    if (url) folioBackgrounds[ids[i]] = url;
  });

  const safeName = title.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "iiif_witness";
  return {
    transcriptionText: `${lines.join("\n")}\n`,
    manuscriptTitle: title,
    sourceFileName: `${safeName}.txt`,
    folioBackgrounds,
    sequentialIds: !usable,
  };
}
