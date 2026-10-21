import type { WitnessLanguage } from "@/utils/witnessLanguage";
import { stopwordsFor } from "@/utils/witnessLanguage";
import { normalizeWord } from "@/utils/copilot/stats";
import { tokenizeString } from "@/utils/hsmsLexer";
import { loadUploadCorpusStats, loadUploadCorpusTfidf } from "@/utils/librarySidecars";

/** How many top terms are stored on ParsedManuscript.stats after an upload or scan. */
export const UPLOAD_TFIDF_TOP = 200;

const COUNTED_TYPES = new Set(["text", "expansion", "superscript", "reconstructed_text"]);

const INDEX_LANG: Record<string, string> = {
  SPN: "es",
  PRT: "pt",
  GAL: "gl",
  CAT: "ca",
  LAT: "la",
  ENG: "en",
  es: "es",
  pt: "pt",
  gl: "gl",
  ca: "ca",
  la: "la",
  en: "en",
};

const WITNESS_FOR_INDEX: Record<string, WitnessLanguage> = {
  es: "SPN",
  pt: "PRT",
  gl: "GAL",
  ca: "CAT",
  la: "LAT",
};

export interface ScoredTerm {
  term: string;
  count: number;
  idf: number;
  tfidf: number;
}

export function indexLangForWitness(language: string): string {
  return INDEX_LANG[language] ?? INDEX_LANG[language.toUpperCase()] ?? "es";
}

/** IDF for a term never seen in the precomputed index: ln((N + 1) / 2) + 1. */
export function oovIdf(totalDocuments: number): number {
  const n = totalDocuments > 0 ? totalDocuments : 1;
  return Math.log((n + 1) / 2) + 1;
}

export function lookupScopedIdf(
  idfTable: Record<string, number>,
  lang: string,
  term: string,
  totalDocuments: number,
): number {
  const key = normalizeWord(term);
  if (!key) return oovIdf(totalDocuments);
  const scoped = `${lang}:${key}`;
  return idfTable[scoped] ?? idfTable[key] ?? oovIdf(totalDocuments);
}

/** Sublinear term frequency: 1 + ln(count). */
export function sublinearTf(count: number): number {
  if (count <= 0) return 0;
  return 1 + Math.log(count);
}

export function scoreTermCounts(
  termCounts: Map<string, number>,
  idfTable: Record<string, number>,
  lang: string,
  totalDocuments: number,
): ScoredTerm[] {
  const results: ScoredTerm[] = [];
  for (const [term, count] of termCounts) {
    const idf = lookupScopedIdf(idfTable, lang, term, totalDocuments);
    results.push({ term, count, idf, tfidf: sublinearTf(count) * idf });
  }
  results.sort((a, b) => b.tfidf - a.tfidf || a.term.localeCompare(b.term));
  return results;
}

/** Concordance row score: the row's count, the index IDF for the surface or the lemma. */
export function concordanceIndexTfidf(
  count: number,
  lemma: string,
  surface: string,
  idfTable: Record<string, number>,
  lang: string,
  totalDocuments: number,
): number {
  const surfaceKey = normalizeWord(surface);
  const lemmaKey = normalizeWord(lemma);
  const scopedSurface = surfaceKey ? idfTable[`${lang}:${surfaceKey}`] : undefined;
  const plainSurface = surfaceKey ? idfTable[surfaceKey] : undefined;
  const scopedLemma = lemmaKey ? idfTable[`${lang}:${lemmaKey}`] : undefined;
  const plainLemma = lemmaKey ? idfTable[lemmaKey] : undefined;
  const idf = scopedSurface ?? plainSurface ?? scopedLemma ?? plainLemma ?? oovIdf(totalDocuments);
  return sublinearTf(count) * idf;
}

export function countManuscriptTerms(rawText: string, witness: WitnessLanguage): Map<string, number> {
  const stops = stopwordsFor(witness);
  const counts = new Map<string, number>();
  for (const tok of tokenizeString(rawText)) {
    if (!COUNTED_TYPES.has(tok.type)) continue;
    const word = normalizeWord(tok.value ?? "");
    if (word.length < 3 || stops.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

/**
 * Score a freshly uploaded or scanned transcription against the precomputed index.
 * The IDF table is loaded once and cached. Missing terms use the OOV fallback.
 */
export async function scoreManuscriptUpload(rawText: string, lang: string = "es"): Promise<ScoredTerm[]> {
  const indexLang = indexLangForWitness(lang);
  const witness = WITNESS_FOR_INDEX[indexLang] ?? "SPN";
  const [idfTable, stats] = await Promise.all([loadUploadCorpusTfidf(), loadUploadCorpusStats()]);
  if (!idfTable) return [];
  const scored = scoreTermCounts(
    countManuscriptTerms(rawText, witness),
    idfTable,
    indexLang,
    stats?.totalDocuments ?? 1,
  );
  return scored.slice(0, UPLOAD_TFIDF_TOP);
}
