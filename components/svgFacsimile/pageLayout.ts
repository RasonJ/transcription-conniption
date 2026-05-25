/** Fixed facsimile canvas — preserves manuscript grid across web and native. */
export const CANVAS_W = 800;

export const MARGIN = 48;
export const GUTTER_WIDTH = 36;
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
