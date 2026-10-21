/**
 * Fit, zoom, and scroll-offset math (SPEC-FOLIO-VIEWPORT FV-1, FV-3, FV-6).
 * Pure functions so the viewport component and tests share one definition.
 */

export const FIT_SCALE_MIN = 0.25;
export const FIT_SCALE_MAX = 1;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const LEGIBILITY_FLOOR_PX = 12;
/** Desktop web panes at least this wide keep a fit scale of 0.85, or 100% if that still would not fit. */
export const DESKTOP_VIEWPORT_MIN_PX = 600;
export const DESKTOP_MIN_FIT_SCALE = 0.85;

/**
 * Fit width used for display. On the web, a fit that would draw body text below
 * the legibility floor (or below 0.85 on a desktop pane) is replaced by 100%
 * so the page scrolls instead of shrinking.
 */
export function resolveDisplayFitScale(
  rawFit: number,
  baseFontPx: number,
  options: { web: boolean; containerWidth: number },
): number {
  if (!options.web || !Number.isFinite(rawFit) || rawFit <= 0) return rawFit;
  const tooSmall = baseFontPx * rawFit < LEGIBILITY_FLOOR_PX;
  const desktopCramped =
    options.containerWidth >= DESKTOP_VIEWPORT_MIN_PX && rawFit < DESKTOP_MIN_FIT_SCALE;
  if (tooSmall || desktopCramped) return 1;
  return rawFit;
}

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

export type ZoomMode = "fit" | "actual" | "custom";

/** Double-tap and the toolbar cycle: fit width, then 100%, then back to fit. */
export function cycleZoomMode(mode: ZoomMode): ZoomMode {
  return mode === "fit" ? "actual" : "fit";
}

/** Pinch scale is relative to the scale when the fingers landed. */
export function scaleFromPinch(startScale: number, gestureScale: number): number {
  if (!Number.isFinite(startScale) || startScale <= 0) return 1;
  if (!Number.isFinite(gestureScale) || gestureScale <= 0) return clampZoom(startScale);
  return clampZoom(startScale * gestureScale);
}

/** Scroll offsets measured on the unscaled page, applied at the current scale. */
export function scaledAnchorOffset(y: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return y * s;
}

export function belowLegibilityFloor(baseFontPx: number, scale: number): boolean {
  return baseFontPx * scale < LEGIBILITY_FLOOR_PX;
}
