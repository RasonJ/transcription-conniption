/**
 * Concordance table ranking.
 *
 * Relative importance of a term in one manuscript is its share of that manuscript:
 * count / total words. The ranking score multiplies that share by the catalog's
 * precomputed IDF (`corpus-tfidf.json`). A term missing from the table uses
 * ln((N + 1) / (DF + 1)) + 1.
 *
 * The HSMS lemma index maps surface forms to headwords. It does not store a
 * modern-language gloss, so an unmapped lemma is shown as itself.
 */

import type { WordOccurrence } from "@/constants/manuscript";
import { normalizeWord } from "@/utils/copilot/stats";
import { documentTermTfidf, type CorpusIdfTable } from "@/utils/corpusTfidfScore";
import { cosineSim, hashEmbed } from "@/utils/embeddings/hashEmbed";
import * as hsmsDictionary from "@/utils/hsmsDictionary";
import { historicalVariantMatchKeys, variantMatchKey } from "@/utils/modernizedText";
import { foldForSearch } from "@/utils/witnessLanguage";

/** IDF used when a context word is missing from both the scoped and bare tables. */
const UNLISTED_CONTEXT_IDF = 1.5;
/** Context words at or above this IDF are drawn as salient in the KWIC line. */
export const HIGH_CONTEXT_IDF = 2;

/** Exact query token, or a listed context word whose IDF clears the salience floor. */
export function contextTokenSalient(
  token: string,
  query: string,
  idfTable: Record<string, number> | null,
  lang = "es",
): boolean {
  const foldedQuery = foldForSearch(query.trim());
  if (foldedQuery && foldForSearch(token) === foldedQuery) return true;
  const key = normalizeWord(token);
  if (!key || !idfTable) return false;
  const idf = idfTable[`${lang}:${key}`] ?? idfTable[key];
  return idf != null && idf >= HIGH_CONTEXT_IDF;
}

export const TRANSLATION_LANGS = ["en", "es", "pt", "ca", "gl", "eu"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

export type ConcordanceSortColumn = "default" | "lemma" | "mostCommon" | "translation" | "tfidf" | "count";
export type ConcordanceSortDirection = "asc" | "desc";

export type RankableConcordanceEntry = {
  lemma: string;
  count: number;
  tfidf: number;
  mostCommonForm: string;
  translation: string;
  /** Pre-folded search keys. The default sort uses these when the list already computed them. */
  foldedLemma?: string;
  foldedForm?: string;
};

/** Most frequent diplomatic surface form stored on the entry, else the keyword sample. */
export function getMostCommonForm(entry: {
  variants?: Record<string, number>;
  occurrences: ReadonlyArray<{ keyword: string }>;
}): string {
  const variants = entry.variants;
  if (variants) {
    let top = "";
    let max = 0;
    for (const form of Object.keys(variants)) {
      const count = variants[form] ?? 0;
      if (count > max || (count === max && (top === "" || form.localeCompare(top) < 0))) {
        max = count;
        top = form;
      }
    }
    if (top) return top;
  }
  return entry.occurrences[0]?.keyword ?? "";
}

const TFIDF_EPSILON = 0.000001;

export function relativeImportance(
  count: number,
  totalWords: number,
  corpus: CorpusIdfTable | null = null,
  lemma = "",
  surface = "",
  language?: string,
): number {
  return documentTermTfidf(count, totalWords, lemma, corpus, surface, language);
}

export function formatRelativeImportance(value: number): string {
  return value.toFixed(4);
}

export function translationLangForLocale(locale: string): TranslationLang {
  const base = locale.split("-")[0] ?? "en";
  return (TRANSLATION_LANGS as readonly string[]).includes(base) ? (base as TranslationLang) : "en";
}

export function nextTranslationLang(current: TranslationLang): TranslationLang {
  const idx = TRANSLATION_LANGS.indexOf(current);
  return TRANSLATION_LANGS[(idx + 1) % TRANSLATION_LANGS.length] ?? "en";
}

/** Target-language gloss for a lemma. Falls back to the lemma when no gloss is indexed. */
export function resolveLemmaTranslation(lemma: string, _targetLang: TranslationLang): string {
  return lemma;
}

function byLemma(a: RankableConcordanceEntry, b: RankableConcordanceEntry, locale: string): number {
  return a.lemma.localeCompare(b.lemma, locale);
}

export function compareConcordanceEntries(
  a: RankableConcordanceEntry,
  b: RankableConcordanceEntry,
  sortColumn: ConcordanceSortColumn,
  sortDirection: ConcordanceSortDirection,
  locale: string,
  query?: string | null,
): number {
  const mult = sortDirection === "asc" ? 1 : -1;

  if (sortColumn === "default" && query?.trim()) {
    const byExact = listExactTier(b, query) - listExactTier(a, query);
    if (byExact !== 0) return byExact;
  }

  if (sortColumn === "default") {
    const aMajor = a.count >= 3;
    const bMajor = b.count >= 3;
    if (aMajor && !bMajor) return -1;
    if (!aMajor && bMajor) return 1;
    if (aMajor && bMajor) {
      const tfidfDiff = b.tfidf - a.tfidf;
      if (Math.abs(tfidfDiff) > TFIDF_EPSILON) return tfidfDiff;
      return byLemma(a, b, locale);
    }
    const countDiff = b.count - a.count;
    if (countDiff !== 0) return countDiff;
    return byLemma(a, b, locale);
  }

  if (sortColumn === "translation") {
    const byTrans = a.translation.localeCompare(b.translation, locale) * mult;
    if (byTrans !== 0) return byTrans;
    return byLemma(a, b, locale);
  }
  if (sortColumn === "tfidf") {
    const byTfidf = (a.tfidf - b.tfidf) * mult;
    if (Math.abs(byTfidf) > TFIDF_EPSILON) return byTfidf;
    return byLemma(a, b, locale);
  }
  if (sortColumn === "count") {
    const byCount = (a.count - b.count) * mult;
    if (byCount !== 0) return byCount;
    return byLemma(a, b, locale);
  }
  if (sortColumn === "mostCommon") {
    const byForm = a.mostCommonForm.localeCompare(b.mostCommonForm, locale) * mult;
    if (byForm !== 0) return byForm;
    return byLemma(a, b, locale);
  }
  return byLemma(a, b, locale) * mult;
}

export function initialSortDirection(column: ConcordanceSortColumn): ConcordanceSortDirection {
  return column === "lemma" || column === "mostCommon" || column === "translation" ? "asc" : "desc";
}

/** Position decay: full weight at 1–2 tokens, half at 3, distal after that. */
export function contextDistanceWeight(tokenDistance: number): number {
  if (tokenDistance <= 2) return 1;
  if (tokenDistance === 3) return 0.5;
  return 0.25;
}

function contextTokens(text: string, nearestFirst: boolean): string[] {
  const tokens = text
    .trim()
    .split(/\s+/)
    .map((tok) => normalizeWord(tok))
    .filter(Boolean);
  return nearestFirst ? tokens.reverse() : tokens;
}

function contextWordIdf(word: string, idfTable: Record<string, number> | null, lang: string): number {
  if (!idfTable) return UNLISTED_CONTEXT_IDF;
  return idfTable[`${lang}:${word}`] ?? idfTable[word] ?? UNLISTED_CONTEXT_IDF;
}

/** Proximity-weighted IDF of the words around one KWIC hit. The hit itself is not scored. */
export function scoreOccurrenceContext(
  occurrence: WordOccurrence,
  idfTable: Record<string, number> | null,
  lang = "es",
): number {
  let score = 0;
  const sides = [
    contextTokens(occurrence.preContext, true),
    contextTokens(occurrence.postContext, false),
  ];
  for (const tokens of sides) {
    for (let i = 0; i < tokens.length; i++) {
      const dist = i + 1;
      score += contextWordIdf(tokens[i], idfTable, lang) * contextDistanceWeight(dist);
    }
  }
  return score;
}

/** Folded lemma or most-common form equals the query. Used by the default lemma-list sort. */
function listExactTier(entry: RankableConcordanceEntry, query: string): number {
  const q = foldForSearch(query.trim());
  if (!q) return 0;
  const lemma = entry.foldedLemma ?? foldForSearch(entry.lemma);
  const form = entry.foldedForm ?? foldForSearch(entry.mostCommonForm);
  if (lemma === q || form === q) return 2;
  return 0;
}

/**
 * 2 when the keyword is the query (case- and accent-folded),
 * 1 when it shares the query lemma or a scribal variant,
 * 0 for any other neighbor.
 */
export function exactMatchTier(keyword: string, query: string, queryLemma: string | null = null): number {
  const kwFolded = foldForSearch(keyword.trim());
  const qFolded = foldForSearch(query.trim());
  if (kwFolded && qFolded && kwFolded === qFolded) return 2;

  const word = keyword.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!word || !q) return 0;
  const matchedLemma = hsmsDictionary.lookupHsmsLemma(word);
  const lemma = queryLemma ?? hsmsDictionary.lookupHsmsLemma(q);
  if (matchedLemma && lemma && matchedLemma === lemma) return 1;

  const keys = historicalVariantMatchKeys(word);
  const self = variantMatchKey(word);
  for (const tok of q.split(/\s+/)) {
    const key = variantMatchKey(tok);
    if (key && key !== self && keys.has(key)) return 1;
  }
  return 0;
}

/** Highest context salience first. With a query, exact spellings lead, then the multi-signal score. */
export function getSortedOccurrences(
  occurrences: WordOccurrence[],
  idfTable: Record<string, number> | null,
  lang = "es",
  query?: string | null,
): WordOccurrence[] {
  const q = query?.trim();
  if (!q) {
    return rankOccurrences(occurrences, (occurrence) => scoreOccurrenceContext(occurrence, idfTable, lang));
  }
  const queryVec = hashEmbed(q);
  const queryLemma = hsmsDictionary.lookupHsmsLemma(q) ?? null;
  return occurrences
    .map((occurrence, index) => ({
      occurrence,
      index,
      tier: exactMatchTier(occurrence.keyword, q, queryLemma),
      score: scoreMultiSignalOccurrence(occurrence, q, queryLemma, queryVec, idfTable, lang),
    }))
    .sort((a, b) => b.tier - a.tier || b.score - a.score || a.index - b.index)
    .map((row) => row.occurrence);
}

function rankOccurrences(
  occurrences: WordOccurrence[],
  scoreOf: (occurrence: WordOccurrence) => number,
): WordOccurrence[] {
  return occurrences
    .map((occurrence, index) => ({ occurrence, index, score: scoreOf(occurrence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.occurrence);
}

function snippetText(occurrence: WordOccurrence): string {
  return `${occurrence.preContext} ${occurrence.keyword} ${occurrence.postContext}`;
}

/**
 * Positional TF-IDF scaled by semantic alignment.
 * A missing query vector keeps the pure context score.
 * The 0.5 floor stops a weak cosine from erasing a lexically rich snippet.
 */
export function scoreHybridOccurrence(
  occurrence: WordOccurrence,
  queryEmbedding: Float32Array | null,
  idfTable: Record<string, number> | null,
  lang = "es",
): number {
  const tfidfScore = scoreOccurrenceContext(occurrence, idfTable, lang);
  if (!queryEmbedding) return tfidfScore;
  const similarity = Math.max(0, cosineSim(queryEmbedding, hashEmbed(snippetText(occurrence))));
  return tfidfScore * (0.5 + 0.5 * similarity);
}

/** Lexical context score times embedding alignment, with no dictionary boost. */
export function getSortedOccurrencesHybrid(
  occurrences: WordOccurrence[],
  query: string | null,
  idfTable: Record<string, number> | null,
  lang = "es",
): WordOccurrence[] {
  const queryVec = query?.trim() ? hashEmbed(query) : null;
  return rankOccurrences(occurrences, (occurrence) =>
    scoreHybridOccurrence(occurrence, queryVec, idfTable, lang),
  );
}

const EXACT_MATCH_DELTA = 0.5;
const LEMMA_DELTA = 0.35;
const POS_DELTA = 0.25;
const VARIANT_DELTA = 0.2;

function eaglesCategory(tag: string | undefined): string | null {
  const head = tag?.trim()[0]?.toUpperCase();
  return head && head >= "A" && head <= "Z" ? head : null;
}

function posCategoryFor(text: string): string | null {
  const direct = eaglesCategory(hsmsDictionary.lookupHsmsPos(text));
  if (direct) return direct;
  for (const tok of text.split(/\s+/)) {
    const cat = eaglesCategory(hsmsDictionary.lookupHsmsPos(tok));
    if (cat) return cat;
  }
  return null;
}

/** 1, plus lemma, POS-category, and scribal-variant bonuses when the sidecars recognize them. */
export function morphologyMultiplier(keyword: string, query: string, queryLemma: string | null): number {
  const word = keyword.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!word || !q) return 1;
  let boost = 1;
  if (foldForSearch(word) === foldForSearch(q)) boost += EXACT_MATCH_DELTA;
  const matchedLemma = hsmsDictionary.lookupHsmsLemma(word);
  const lemma = queryLemma ?? hsmsDictionary.lookupHsmsLemma(q);
  if (matchedLemma && lemma && matchedLemma === lemma) boost += LEMMA_DELTA;

  const wordPos = posCategoryFor(word);
  const queryPos = posCategoryFor(q);
  if (wordPos && queryPos && wordPos === queryPos) boost += POS_DELTA;

  const keys = historicalVariantMatchKeys(word);
  const self = variantMatchKey(word);
  for (const tok of q.split(/\s+/)) {
    const key = variantMatchKey(tok);
    if (key && key !== self && keys.has(key)) {
      boost += VARIANT_DELTA;
      break;
    }
  }
  return boost;
}

/**
 * Context TF-IDF × embedding alignment × morphological multiplier.
 * Identical keywords share the dictionary boost; context and cosine still order them.
 */
export function scoreMultiSignalOccurrence(
  occurrence: WordOccurrence,
  query: string,
  queryLemma: string | null,
  queryVec: Float32Array | null,
  idfTable: Record<string, number> | null,
  lang = "es",
): number {
  const hybrid = scoreHybridOccurrence(occurrence, queryVec, idfTable, lang);
  return hybrid * morphologyMultiplier(occurrence.keyword, query, queryLemma);
}
