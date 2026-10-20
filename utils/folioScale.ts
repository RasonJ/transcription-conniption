/**
 * Fit, zoom, and scroll-offset math (SPEC-FOLIO-VIEWPORT FV-1, FV-3, FV-6).
 * Pure functions so the viewport component and tests share one definition.
 */

export const FIT_SCALE_MIN = 0.25;
export const FIT_SCALE_MAX = 1;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const LEGIBILITY_FLOOR_PX = 11;

/** Fit width: scale the page into the container, never enlarging past 1. */
export function computeFitScale(
  containerWidth: number,
  pageWidth: number,
  padding = 16,
): number {
  if (containerWidth <= 0 || pageWidth <= 0) return 1;
  const available = containerWidth - 2 * padding;
  const raw = available / pageWidth;
  return Math.min(FIT_SCALE_MAX, Math.max(FIT_SCALE_MIN, raw));
}

/** Free zoom, clamped to 0.5×–3×. */
export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function stepZoom(scale: number, direction: 1 | -1): number {
  const next = direction > 0 ? scale * 1.1 : scale / 1.1;
  return clampZoom(Math.round(next * 100) / 100);
}

/** Scroll offsets measured on the unscaled page, applied at the current scale. */
export function scaledAnchorOffset(y: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return y * s;
}

export function belowLegibilityFloor(baseFontPx: number, scale: number): boolean {
  return baseFontPx * scale < LEGIBILITY_FLOOR_PX;
}
