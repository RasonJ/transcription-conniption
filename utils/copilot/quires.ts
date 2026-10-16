/**
 * Quire (gathering) assignment for folio sides (SPEC-COPILOT §6.3).
 *
 * HSMS has no quire mnemonic, so:
 *  1. A user collation formula wins (e.g. "1-8^8 9^10", "1–8⁸ 9¹⁰", "8,8,10").
 *  2. Otherwise a catchword {CW.} on a folio side marks the end of a quire.
 *  3. Otherwise signatures {SG.} ending in 1 / i / j mark the first leaf of a quire.
 *  4. Otherwise the whole witness is one quire.
 * Recipes report which source they used.
 */
import type { ParsedManuscript } from "../../constants/manuscript";

export type QuireSource = "collation" | "catchwords" | "signatures" | "none";

export interface QuireMap {
  /** Quire number (1-based) for each folio index. */
  quireOfFolio: number[];
  count: number;
  source: QuireSource;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

/** Leaves per quire from a collation formula, or null when it cannot be parsed. */
export function parseCollation(formula: string): number[] | null {
  const src = formula
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPT_DIGITS[c]).join("")}`)
    .replace(/[–—]/g, "-")
    .trim();
  if (!src) return null;
  // "8,8,10" — plain list of quire sizes.
  if (/^\d+(\s*,\s*\d+)*$/.test(src)) return src.split(/\s*,\s*/).map(Number);
  const sizes: number[] = [];
  for (const part of src.split(/\s+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?\^(\d+)$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from || to - from > 500) return null;
    for (let q = from; q <= to; q++) sizes.push(Number(m[3]));
  }
  return sizes.length ? sizes : null;
}

function leafNumber(folioId: string, fallbackIndex: number): number {
  const m = folioId.match(/^(\d+)/);
  return m ? Number(m[1]) : Math.floor(fallbackIndex / 2) + 1;
}

const SIGNATURE_FIRST_LEAF = /(^|[^a-z0-9])(1|i|j)\.?\s*$/i;

export function inferQuires(parsed: ParsedManuscript, collation?: string): QuireMap {
  const n = parsed.folios.length;
  const quireOfFolio = new Array<number>(n).fill(1);

  const sizes = collation ? parseCollation(collation) : null;
  if (sizes) {
    // Sizes are leaves per quire; map each folio's leaf number onto cumulative counts.
    const cumulative: number[] = [];
    let sum = 0;
    for (const s of sizes) cumulative.push((sum += s));
    for (let fi = 0; fi < n; fi++) {
      const leaf = leafNumber(parsed.folios[fi].id, fi);
      let q = cumulative.findIndex((c) => leaf <= c);
      if (q < 0) q = cumulative.length - 1;
      quireOfFolio[fi] = q + 1;
    }
    return { quireOfFolio, count: sizes.length, source: "collation" };
  }

  const hasCatchwords = parsed.folios.some((f) => Boolean(f.catchword));
  if (hasCatchwords) {
    let q = 1;
    for (let fi = 0; fi < n; fi++) {
      quireOfFolio[fi] = q;
      if (parsed.folios[fi].catchword) q++;
    }
    const count = quireOfFolio[n - 1] ?? 1;
    return { quireOfFolio, count, source: "catchwords" };
  }

  const hasSignatures = parsed.folios.some((f) => f.signature && SIGNATURE_FIRST_LEAF.test(f.signature));
  if (hasSignatures) {
    let q = 0;
    for (let fi = 0; fi < n; fi++) {
      const sig = parsed.folios[fi].signature;
      if (fi === 0 || (sig && SIGNATURE_FIRST_LEAF.test(sig))) q++;
      quireOfFolio[fi] = Math.max(1, q);
    }
    return { quireOfFolio, count: Math.max(1, q), source: "signatures" };
  }

  return { quireOfFolio, count: n ? 1 : 0, source: "none" };
}
