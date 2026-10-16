/**
 * Front-coded text format for the HSMS lemma dictionary (`hsmsLemmaIndex.v2.tsv`).
 *
 * Entries are sorted by surface form. Each line is:
 *
 *   <p><surfaceSuffix>\t<lemmaField>
 *
 * - `p` is one character, `String.fromCharCode(48 + n)`, where `n` (0–35) is the number of
 *   leading characters shared with the previous surface form.
 * - `lemmaField` is empty when the lemma equals the surface form. Otherwise its first
 *   character encodes how many leading characters the lemma shares with the surface
 *   form (same 48 + n scheme), followed by the rest of the lemma.
 *
 * About 2.7 MB raw / 0.87 MB gzip for the current dictionary, versus 6.1 MB / 1.07 MB JSON.
 * The generator (`scripts/generate-hsms-dictionary-index.mjs`) mirrors `encodeLemmaEntries`.
 */

export const LEMMA_DICTIONARY_FORMAT_HEADER = "#hsms-lemma-index/2";
const MAX_SHARED = 35;
const BASE = 48;

function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length, MAX_SHARED);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

export function encodeLemmaEntries(index: Record<string, string>): string {
  const surfaces = Object.keys(index).sort();
  const lines: string[] = [LEMMA_DICTIONARY_FORMAT_HEADER];
  let prev = "";
  for (const surface of surfaces) {
    const lemma = index[surface];
    const p = sharedPrefix(prev, surface);
    let lemmaField = "";
    if (lemma !== surface) {
      const q = sharedPrefix(surface, lemma);
      lemmaField = String.fromCharCode(BASE + q) + lemma.slice(q);
    }
    lines.push(`${String.fromCharCode(BASE + p)}${surface.slice(p)}\t${lemmaField}`);
    prev = surface;
  }
  return lines.join("\n");
}

/** Decode into a Map (faster lookups and lower overhead than a large object literal). */
export function decodeLemmaEntries(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let prev = "";
  let start = 0;
  const len = text.length;
  if (text.startsWith("#")) {
    const nl = text.indexOf("\n");
    start = nl < 0 ? len : nl + 1;
  }
  while (start < len) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = len;
    if (end > start) {
      const line = text.charCodeAt(end - 1) === 13 ? text.slice(start, end - 1) : text.slice(start, end);
      const tab = line.indexOf("\t");
      if (tab > 0) {
        const p = line.charCodeAt(0) - BASE;
        const surface = prev.slice(0, p) + line.slice(1, tab);
        const field = line.slice(tab + 1);
        const lemma = field
          ? surface.slice(0, field.charCodeAt(0) - BASE) + field.slice(1)
          : surface;
        out.set(surface, lemma);
        prev = surface;
      }
    }
    start = end + 1;
  }
  return out;
}
