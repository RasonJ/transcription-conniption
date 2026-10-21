import type { FolioGeometry } from "../../utils/ingest/types";
import { LH } from "./tokenRendering";

/** Fixed facsimile canvas — preserves manuscript grid across web and native. */
export const CANVAS_W = 800;

export const MARGIN = 48;
export const GUTTER_WIDTH = 36;
/** Scholarly line numbers sit in this left gutter and are not part of the prose. */
export const LINE_NUM_W = 40;
export const PAGE_PAD_TOP = 28;
export const PAGE_PAD_BOT = 36;
export const CAP_GUTTER = 4;
/** Drop-cap box width as a fraction of box height (letter glyph, not full line gutter). */
export const DROP_CAP_WIDTH_RATIO = 0.52;

export function dropCapBoxWidth(capHeight: number, letterCount = 1): number {
  const base = Math.round(capHeight * DROP_CAP_WIDTH_RATIO);
  if (letterCount <= 1) return base;
  return Math.round(base * (0.72 + 0.22 * Math.min(letterCount, 3)));
}
export const BLOCK_GAP = 4;
export const BLOCK_GAP_AFTER_INITIAL = 10;
export const HEADING_GAP = 10;

export const PARCHMENT_BG = "#f4ebd0";
export const RULE_STROKE = "#dfd3b6";

export function innerCanvasWidth(): number {
  return CANVAS_W - 2 * MARGIN;
}

export function columnWidth(): number {
  return (innerCanvasWidth() - GUTTER_WIDTH) / 2;
}

export interface FolioLayout {
  canvasW: number;
  /** Null when no measured geometry is available (height follows content). */
  canvasH: number | null;
  margin: number;
  gutter: number;
  columnWidths: number[];
  lineAdvance: number;
  writingArea: { x: number; y: number; w: number; h: number | null };
}

const MIN_LINE_ADVANCE = 8;

/**
 * Facsimile layout for one folio. Measured geometry (normalized 0–1) is scaled to the
 * fixed 800 px logical width; without it, the typed-in constants apply unchanged.
 */
export function layoutForFolio(geometry?: FolioGeometry): FolioLayout {
  if (!geometry) {
    const colW = columnWidth();
    return {
      canvasW: CANVAS_W,
      canvasH: null,
      margin: MARGIN,
      gutter: GUTTER_WIDTH,
      columnWidths: [colW, colW],
      lineAdvance: LH,
      writingArea: { x: MARGIN, y: PAGE_PAD_TOP, w: innerCanvasWidth(), h: null },
    };
  }

  const canvasH = CANVAS_W * geometry.aspect;
  const [ax, ay, aw, ah] = geometry.writingArea;
  const writingArea = { x: ax * CANVAS_W, y: ay * canvasH, w: aw * CANVAS_W, h: ah * canvasH };

  const columns = geometry.columns.length > 0 ? geometry.columns : [geometry.writingArea];
  const columnWidths = columns.map((c) => c[2] * CANVAS_W);

  let gutter = GUTTER_WIDTH;
  if (columns.length >= 2) {
    const gap = (columns[1][0] - (columns[0][0] + columns[0][2])) * CANVAS_W;
    gutter = Math.max(0, gap);
  }

  const measured = geometry.meanLineSpacing * canvasH;
  const lineAdvance = measured > 0 ? Math.max(MIN_LINE_ADVANCE, measured) : LH;

  return { canvasW: CANVAS_W, canvasH, margin: writingArea.x, gutter, columnWidths, lineAdvance, writingArea };
}
