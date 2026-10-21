import { normalizeWord } from "@/utils/copilot/stats";

/**
 * Scoring against a precomputed corpus IDF table (`hsms-corpus-tfidf/1`).
 *
 * Listed terms use the stored IDF. A term missing from that table uses
 * IDF(t) = ln((N + 1) / (DF(t) + 1)) + 1, where N is the table's document count
 * and DF is the stored document frequency, or 0 when the term was never seen.
 *
 * Relative importance inside one manuscript is the term's share of that
 * manuscript: count / wordCount. TF-IDF multiplies that share by corpus IDF.
 */

export type CorpusLanguageIdf = {
  totalDocuments: number;
  idf: Record<string, number>;
  df?: Record<string, number>;
};

export type CorpusIdfTable = {
  totalDocuments: number;
  idf: Record<string, number>;
  df?: Record<string, number>;
  /** IDF grouped by witness language code (LAT, PRT, …) when the catalog build emitted it. */
  byLanguage?: Record<string, CorpusLanguageIdf>;
};

export function documentTermShare(count: number, docWords: number): number {
  const total = docWords > 0 ? docWords : 1;
  return count / total;
}

/** Smooth IDF for a term that is not in the precomputed table. */
export function smoothUnlistedIdf(totalDocuments: number, documentFrequency: number): number {
  if (totalDocuments <= 0) return 0;
  const df = documentFrequency > 0 ? documentFrequency : 0;
  return Math.log((totalDocuments + 1) / (df + 1)) + 1;
}

function listedIdf(key: string, table: { idf: Record<string, number> } | undefined): number | undefined {
  if (!key || !table || !(key in table.idf)) return undefined;
  return table.idf[key];
}

/**
 * Precomputed IDF for `term`, optionally from the slice for `language`.
 * A language slice is preferred when it lists the term; otherwise the global table is used.
 */
export function lookupCorpusIdf(term: string, corpus: CorpusIdfTable, language?: string): number {
  const key = normalizeWord(term);
  const slice = language ? corpus.byLanguage?.[language] : undefined;
  const listed = listedIdf(key, slice) ?? listedIdf(key, corpus);
  if (listed != null) return listed;
  const total = slice?.totalDocuments || corpus.totalDocuments;
  const df = (key && slice?.df?.[key]) ?? (key && corpus.df?.[key]) ?? 0;
  return smoothUnlistedIdf(total, df);
}

/** Prefer a listed surface form, then the lemma, then the smooth fallback for the lemma. */
export function resolveTermIdf(
  lemma: string,
  surface: string,
  corpus: CorpusIdfTable,
  language?: string,
): number {
  const surfaceKey = normalizeWord(surface);
  const lemmaKey = normalizeWord(lemma);
  const slice = language ? corpus.byLanguage?.[language] : undefined;
  const listed =
    listedIdf(surfaceKey, slice) ??
    listedIdf(surfaceKey, corpus) ??
    listedIdf(lemmaKey, slice) ??
    listedIdf(lemmaKey, corpus);
  if (listed != null) return listed;
  const key = surfaceKey || lemmaKey;
  const total = slice?.totalDocuments || corpus.totalDocuments;
  const df = (key && slice?.df?.[key]) ?? (key && corpus.df?.[key]) ?? 0;
  return smoothUnlistedIdf(total, df);
}

/** TF-IDF(t, d) = (count / docWords) × corpus IDF(t). Without a corpus table, the share alone. */
export function documentTermTfidf(
  count: number,
  docWords: number,
  lemma: string,
  corpus: CorpusIdfTable | null,
  surface = "",
  language?: string,
): number {
  const share = documentTermShare(count, docWords);
  if (!corpus) return share;
  return share * resolveTermIdf(lemma, surface, corpus, language);
}
