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

/** Evenly distribute `remainder` px across inter-character gaps (n−1 gaps for n glyphs). */
export function microTrackingSpace(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
): number {
  if (skipJustify || isLastLine) return 0;

  let totalChars = 0;
  for (let i = 0; i < segs.length; i++) {
    totalChars += segs[i].text.length;
  }
  if (totalChars <= 1) return 0;

  const remainder = targetWidth - segsLineWidth(segs);
  return remainder > 0 ? remainder / (totalChars - 1) : 0;
}
