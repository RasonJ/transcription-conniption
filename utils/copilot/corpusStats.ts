/**
 * Corpus statistics for Tier C recipes (SPEC-COPILOT §9.3). Pure functions, no I/O.
 */

/** Natural log that treats 0·log(0) as 0. */
function xlogx(x: number): number {
  return x > 0 ? x * Math.log(x) : 0;
}

/**
 * Log-likelihood ratio G² for a 2×2 contingency table [[a, b], [c, d]] (Dunning 1993).
 * Larger means stronger association; df = 1.
 */
export function logLikelihood2x2(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  if (n === 0) return 0;
  const g =
    xlogx(a) + xlogx(b) + xlogx(c) + xlogx(d) -
    xlogx(a + b) - xlogx(c + d) - xlogx(a + c) - xlogx(b + d) +
    xlogx(n);
  return Math.max(0, 2 * g);
}

/** Complementary error function (Abramowitz–Stegun 7.1.26, |ε| < 1.5e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
          t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** p-value of a χ²(1) statistic (G² and Pearson χ² share the distribution asymptotically). */
export function chiSquare1PValue(stat: number): number {
  if (!(stat > 0)) return 1;
  return erfc(Math.sqrt(stat / 2));
}

/** Smallest expected cell count of a 2×2 table (warn when < 5). */
export function minExpected2x2(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  if (n === 0) return 0;
  const rows = [a + b, c + d];
  const cols = [a + c, b + d];
  let min = Infinity;
  for (const r of rows) for (const k of cols) min = Math.min(min, (r * k) / n);
  return min;
}

export interface CollocateScore {
  word: string;
  /** Co-occurrences inside the window. */
  observed: number;
  /** Corpus frequency of the collocate. */
  frequency: number;
  expected: number;
  pmi: number;
  tScore: number;
  logLikelihood: number;
}

/**
 * Collocates of `node` within ±`window` tokens. PMI over-rates rare pairs, so pairs below
 * `minFrequency` co-occurrences are dropped (the answer card says so).
 */
export function collocates(
  tokens: readonly string[],
  isNode: (w: string) => boolean,
  options: { window: number; minFrequency: number; exclude?: ReadonlySet<string> },
): CollocateScore[] {
  const n = tokens.length;
  if (n === 0) return [];
  const freq = new Map<string, number>();
  for (const w of tokens) freq.set(w, (freq.get(w) ?? 0) + 1);

  const co = new Map<string, number>();
  let nodeCount = 0;
  for (let i = 0; i < n; i++) {
    if (!isNode(tokens[i])) continue;
    nodeCount++;
    const lo = Math.max(0, i - options.window);
    const hi = Math.min(n - 1, i + options.window);
    for (let j = lo; j <= hi; j++) {
      if (j === i || isNode(tokens[j])) continue;
      const w = tokens[j];
      if (options.exclude?.has(w)) continue;
      co.set(w, (co.get(w) ?? 0) + 1);
    }
  }
  if (nodeCount === 0) return [];

  const span = 2 * options.window;
  const out: CollocateScore[] = [];
  co.forEach((observed, word) => {
    if (observed < options.minFrequency) return;
    const frequency = freq.get(word) ?? 0;
    const expected = (nodeCount * frequency * span) / n;
    const pmi = expected > 0 ? Math.log2(observed / expected) : 0;
    const tScore = (observed - expected) / Math.sqrt(observed);
    // 2×2: (node-window & w), (node-window & ¬w), (elsewhere & w), (elsewhere & ¬w)
    const windowTokens = nodeCount * span;
    const a = observed;
    const b = Math.max(0, windowTokens - observed);
    const c = Math.max(0, frequency - observed);
    const d = Math.max(0, n - a - b - c);
    out.push({ word, observed, frequency, expected, pmi, tScore, logLikelihood: logLikelihood2x2(a, b, c, d) });
  });
  return out.sort((x, y) => y.logLikelihood - x.logLikelihood);
}

/** Top n-grams; `segments` are word lists that n-grams must not cross (e.g. folio sides). */
export function topNgrams(
  segments: readonly (readonly string[])[],
  n: number,
  top: number,
  skip?: (gram: readonly string[]) => boolean,
): Array<{ gram: string; count: number }> {
  const counts = new Map<string, number>();
  for (const words of segments) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (skip?.(gram)) continue;
      const key = gram.join(" ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([gram, count]) => ({ gram, count }))
    .sort((a, b) => b.count - a.count || a.gram.localeCompare(b.gram))
    .slice(0, top);
}

/** Least-squares slope of log(frequency) on log(rank) for the top `limit` ranks (Zipf ≈ −1). */
export function zipfSlope(frequencies: readonly number[], limit = 200): { slope: number; points: Array<[number, number]> } {
  const sorted = [...frequencies].sort((a, b) => b - a).slice(0, limit).filter((f) => f > 0);
  const points: Array<[number, number]> = sorted.map((f, i) => [Math.log10(i + 1), Math.log10(f)]);
  const m = points.length;
  if (m < 2) return { slope: 0, points };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
  return { slope, points };
}

/**
 * Orthographic skeleton for grouping Old Ibero-Romance spelling variants
 * (fazer / facer / façer; omne / ome; dixo / dijo are kept apart deliberately).
 */
export function spellingSkeleton(word: string): string {
  return word
    .toLowerCase()
    .replace(/c'|ç/g, "z")
    .replace(/n~|ñ|nn|nh|ny/g, "ñ")
    .normalize("NFD")
    .replace(/[̀-ͯ~@'^#`]/g, "")
    .replace(/c(?=[ei])/g, "z")
    .replace(/ss/g, "s")
    .replace(/ff/g, "f")
    .replace(/rr/g, "r")
    .replace(/^h/, "")
    .replace(/v/g, "u")
    .replace(/y/g, "i")
    .replace(/[^a-zñ]/g, "");
}
