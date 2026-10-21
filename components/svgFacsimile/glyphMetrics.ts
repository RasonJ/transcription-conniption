import type { Seg } from "./tokenRendering";

/** Proportional serif glyph width estimator (metal-type tracking model). */
export function gw(ch: string, fs: number): number {
  if ("MW".includes(ch)) return fs * 0.78;
  if ("mw".includes(ch)) return fs * 0.72;
  if ("Il|!;:,'\"`.".includes(ch)) return fs * 0.3;
  if ("()".includes(ch)) return fs * 0.28;
  if ("<>".includes(ch)) return fs * 0.38;
  if ("°ºª".includes(ch)) return fs * 0.42;
  if ("frtij ".includes(ch)) return fs * 0.4;
  if ("0123456789".includes(ch)) return fs * 0.55;
  return fs * 0.53;
}

/** Superscript shorthands (q^ue, p^or) paint at 80% of the segment's font size. */
export const SUPER_WIDTH_SCALE = 0.8;

export function segsLineWidth(segs: Seg[]): number {
  let w = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const effectiveFs = s.super ? s.fs * SUPER_WIDTH_SCALE : s.fs;
    for (let j = 0; j < s.text.length; j++) {
      w += gw(s.text[j], effectiveFs);
    }
  }
  return w;
}

/** Count ASCII spaces used as word separators (justification gaps). */
export function countWordGaps(segs: Seg[]): number {
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    const text = segs[i].text;
    for (let j = 0; j < text.length; j++) {
      if (text[j] === " ") n++;
    }
  }
  return n;
}

/**
 * Widest extra advance per word space. Wide enough for a line of superscript
 * expansions (q[ue], p[or]) to reach the right ruling, without opening a river
 * on a sparse line.
 */
export const JUSTIFY_MAX_GAP = 32;

/**
 * Extra pixels to add to each inter-word space so the line fills `targetWidth`.
 *
 * Uses **word spaces only** (never letter-spacing). Final lines, headings, and
 * rubrics pass `isLastLine` or `skipJustify` and stay unstretched.
 */
export function wordGapExtra(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
  maxPerGap: number = JUSTIFY_MAX_GAP,
): number {
  if (skipJustify || isLastLine) return 0;

  const gaps = countWordGaps(segs);
  if (gaps <= 0) return 0;

  const remainder = targetWidth - segsLineWidth(segs);
  if (remainder <= 0) return 0;

  return Math.min(remainder / gaps, maxPerGap);
}

/**
 * True when CSS `text-align: justify` can fill the measure without opening a
 * gap wider than `maxPerGap`. Sparse lines return false so the pixel cap applies
 * instead of an unbounded river.
 */
export function lineFitsJustifyCap(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
  maxPerGap: number = JUSTIFY_MAX_GAP,
): boolean {
  if (skipJustify || isLastLine) return false;
  const gaps = countWordGaps(segs);
  if (gaps <= 0) return false;
  const remainder = targetWidth - segsLineWidth(segs);
  if (remainder <= 0) return false;
  return remainder / gaps <= maxPerGap;
}

/**
 * @deprecated Prefer {@link wordGapExtra}. Kept as a named alias so older call
 * sites keep compiling; behaviour is now word-gap based (not per-glyph).
 */
export function microTrackingSpace(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
): number {
  return wordGapExtra(segs, targetWidth, isLastLine, skipJustify);
}
