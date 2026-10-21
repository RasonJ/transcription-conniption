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

import { documentTermTfidf, type CorpusIdfTable } from "@/utils/corpusTfidfScore";

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
};

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
): number {
  const mult = sortDirection === "asc" ? 1 : -1;

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
