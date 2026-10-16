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

export function segsLineWidth(segs: Seg[]): number {
  let w = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (let j = 0; j < s.text.length; j++) {
      w += gw(s.text[j], s.fs);
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
 * Extra pixels to add to each inter-word space so the line fills `targetWidth`.
 *
 * Uses **word spaces only** (never letter-spacing). Caps expansion so short
 * lines beside drop caps cannot blow out into character rivers.
 */
export function wordGapExtra(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
  maxPerGap: number = 6,
): number {
  if (skipJustify || isLastLine) return 0;

  const gaps = countWordGaps(segs);
  if (gaps <= 0) return 0;

  const remainder = targetWidth - segsLineWidth(segs);
  if (remainder <= 0) return 0;

  return Math.min(remainder / gaps, maxPerGap);
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
