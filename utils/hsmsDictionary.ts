/**
 * HSMS dictionary (assets/dic/hsms.src — DB_MAP lemmatization index).
 * Regenerate with: node scripts/generate-hsms-dictionary-index.mjs
 */
import lemmaIndexData from "./generated/hsmsLemmaIndex.json";

const LEMMA_INDEX: Record<string, string> = lemmaIndexData as Record<string, string>;

/** Returns a dictionary lemma for a surface form, or undefined if not indexed. */
export function lookupHsmsLemma(surface: string): string | undefined {
  const key = surface.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  if (!key) return undefined;
  return LEMMA_INDEX[key];
}

/** Prefer dictionary lemma; fall back to normalized surface form. */
export function resolveLemma(surface: string, fallbackLemma: string): string {
  return lookupHsmsLemma(surface) ?? fallbackLemma;
}
