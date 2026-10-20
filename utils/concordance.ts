import type { ConcordanceIndex, ParsedManuscript, WordOccurrence } from "../constants/manuscript";
import { lemmaDictionaryGeneration } from "./hsmsDictionary";
import { manuscriptIdentityFromSource } from "./manuscriptIdentity";
import { lemmaSourceRegistry } from "./lemma/sources";
import {
  detectWitnessLanguage,
  foldForSearch,
  stopwordsFor,
  witnessCollator,
  type WitnessLanguage,
} from "./witnessLanguage";

const CONTEXT_RADIUS = 28;

const FLOW_WORD_MATCHER = /[A-Za-zÀ-ÿ0-9']+/g;

function normalizeLemma(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9']/g, "");
}

export { countWordsInFlow, extractWordsFromFlow } from "./flowWords";

export type ConcordanceGroupingMode = "lemma" | "form" | "mixed";

export type ConcordanceBuildMeta = {
  mode: ConcordanceGroupingMode;
  witnessLanguage: WitnessLanguage;
  sourceId?: string;
  sourceVersion?: string;
  entryCount: number;
  lemmaCount: number;
  formCount: number;
};

export type ConcordanceBuildResult = {
  index: ConcordanceIndex;
  meta: ConcordanceBuildMeta;
};

/**
 * Build a language-gated concordance (SPEC-CONCORDANCE-LANGUAGE LEX-1…3).
 * Lemmas apply only when a registered `LemmaSource` claims the witness language
 * (OSTA → SPN only). Portuguese/Galician/Catalan/Latin group by folded word form.
 */
export function buildConcordance(
  parsed: ParsedManuscript,
  options?: {
    minCount?: number;
    maxOccurrencesPerWord?: number;
    /** Stopword / lemma-source language; detected from the text when omitted. */
    language?: WitnessLanguage;
  },
): ConcordanceIndex {
  return buildLanguageAwareConcordance(parsed, options).index;
}

export function buildLanguageAwareConcordance(
  parsed: ParsedManuscript,
  options?: {
    minCount?: number;
    maxOccurrencesPerWord?: number;
    language?: WitnessLanguage;
  },
): ConcordanceBuildResult {
  const witnessLanguage = options?.language ?? detectWitnessLanguage(parsed).language;
  const stopwords = stopwordsFor(witnessLanguage);
  const minCount = options?.minCount ?? 1;
  const maxOcc = options?.maxOccurrencesPerWord ?? 200;
  const lemmaSource = lemmaSourceRegistry.getSourceForLanguage(witnessLanguage);

  const index: ConcordanceIndex = {};
  let lemmaCount = 0;
  let formCount = 0;

  for (const folio of parsed.folios) {
    const flow = folio.reconstructedFlow ?? "";
    if (!flow) continue;

    const matcher = FLOW_WORD_MATCHER;
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(flow)) !== null) {
      const word = match[0];
      const start = match.index;

      const lookup = lemmaSource?.lookup(word) ?? null;
      let key: string;
      let mode: "lemma" | "word_form";
      if (lookup) {
        key = normalizeLemma(lookup.lemma);
        mode = "lemma";
      } else {
        key = foldForSearch(word).replace(/[^a-z0-9']/gi, "") || normalizeLemma(word);
        mode = "word_form";
      }

      if (!key || key.length < 2 || stopwords.has(key) || stopwords.has(normalizeLemma(word))) {
        continue;
      }

      if (!index[key]) {
        index[key] = {
          count: 0,
          occurrences: [],
          mode,
          variants: {},
          sourceId: lookup?.sourceId,
          language: witnessLanguage,
        };
        if (mode === "lemma") lemmaCount++;
        else formCount++;
      }

      const entry = index[key];
      entry.count++;
      entry.variants = entry.variants ?? {};
      entry.variants[word] = (entry.variants[word] ?? 0) + 1;

      if (entry.occurrences.length < maxOcc) {
        const preContext = flow.slice(Math.max(0, start - CONTEXT_RADIUS), start).trim();
        const postContext = flow
          .slice(start + word.length, start + word.length + CONTEXT_RADIUS)
          .trim();

        const occurrence: WordOccurrence = {
          folioId: folio.id,
          lineNumber: "",
          blockIndex: 0,
          preContext,
          postContext,
          keyword: word,
        };
        entry.occurrences.push(occurrence);
      }
    }
  }

  if (minCount > 1) {
    for (const key of Object.keys(index)) {
      if (index[key].count < minCount) {
        const mode = index[key].mode;
        delete index[key];
        if (mode === "lemma") lemmaCount--;
        else formCount--;
      }
    }
  }

  const globalMode: ConcordanceGroupingMode =
    lemmaCount > 0 && formCount > 0 ? "mixed" : lemmaCount > 0 ? "lemma" : "form";

  return {
    index,
    meta: {
      mode: globalMode,
      witnessLanguage,
      sourceId: lemmaSource?.id,
      sourceVersion: lemmaSource?.version,
      entryCount: Object.keys(index).length,
      lemmaCount,
      formCount,
    },
  };
}

/** Human-readable method line for drawer headers / exports (LEX-10). */
export function formatConcordanceMethodLine(meta: ConcordanceBuildMeta): string {
  if (meta.sourceId && meta.mode === "lemma") {
    return `${meta.entryCount} lemmas · ${meta.sourceId} ${meta.sourceVersion ?? ""}`.trim();
  }
  if (meta.mode === "mixed" && meta.sourceId) {
    return `${meta.lemmaCount} lemmas (${meta.sourceId}) · ${meta.formCount} word forms`;
  }
  return `${meta.entryCount} word forms · no dictionary for ${meta.witnessLanguage}`;
}

/** Bump when parser or concordance output changes so memoized indexes are discarded. */
export const PARSER_VERSION = 2;

const CONCORDANCE_CACHE_LIMIT = 4;
const concordanceBySource = new Map<string, ConcordanceIndex>();
const concordanceByParsed = new WeakMap<
  ParsedManuscript,
  { generation: string; index: ConcordanceIndex; meta: ConcordanceBuildMeta }
>();

export function clearConcordanceCache(): void {
  concordanceBySource.clear();
}

/**
 * Concordance keyed by lemma (when a source applies) or folded surface form.
 * Immune to line/column hyphen splits (e.g. adela- + ntar → adelantar).
 */
export function generateConcordanceIndex(
  parsed: ParsedManuscript,
  language?: WitnessLanguage,
): ConcordanceIndex {
  return buildConcordance(parsed, { language });
}

export function computeManuscriptStats(parsed: ParsedManuscript, concordance?: ConcordanceIndex) {
  const index = concordance ?? getConcordanceForManuscript(parsed);
  return {
    totalWords: parsed.stats.totalWords,
    totalLines: parsed.stats.totalLines,
    uniqueWords: Object.keys(index).length,
    rubricCount: parsed.stats.rubricCount,
    glossCount: parsed.stats.glossCount,
  };
}

/**
 * Lazily build and memoize a concordance. Cache keys include the lemma dictionary
 * generation and lemma-source id, so indexes rebuild when lemmas load or language changes.
 */
export function getConcordanceForManuscript(
  parsed: ParsedManuscript,
  sourceText?: string,
  language?: WitnessLanguage,
): ConcordanceIndex {
  return getConcordanceBuildForManuscript(parsed, sourceText, language).index;
}

export function getConcordanceBuildForManuscript(
  parsed: ParsedManuscript,
  sourceText?: string,
  language?: WitnessLanguage,
): ConcordanceBuildResult {
  if (parsed.concordance) {
    const witnessLanguage = language ?? detectWitnessLanguage(parsed).language;
    const source = lemmaSourceRegistry.getSourceForLanguage(witnessLanguage);
    return {
      index: parsed.concordance,
      meta: {
        mode: source ? "lemma" : "form",
        witnessLanguage,
        sourceId: source?.id,
        sourceVersion: source?.version,
        entryCount: Object.keys(parsed.concordance).length,
        lemmaCount: source ? Object.keys(parsed.concordance).length : 0,
        formCount: source ? 0 : Object.keys(parsed.concordance).length,
      },
    };
  }

  const source = lemmaSourceRegistry.getSourceForLanguage(
    language ?? detectWitnessLanguage(parsed).language,
  );
  const generation = `${lemmaDictionaryGeneration()}:${language ?? "auto"}:${source?.id ?? "none"}:${source?.version ?? ""}`;
  const byRef = concordanceByParsed.get(parsed);
  if (byRef && byRef.generation === generation) {
    return { index: byRef.index, meta: byRef.meta };
  }

  const key =
    sourceText !== undefined
      ? `${PARSER_VERSION}:${generation}:${manuscriptIdentityFromSource(sourceText)}`
      : null;

  if (key) {
    const hit = concordanceBySource.get(key);
    if (hit) {
      concordanceBySource.delete(key);
      concordanceBySource.set(key, hit);
      const meta: ConcordanceBuildMeta = {
        mode: source ? "lemma" : "form",
        witnessLanguage: language ?? detectWitnessLanguage(parsed).language,
        sourceId: source?.id,
        sourceVersion: source?.version,
        entryCount: Object.keys(hit).length,
        lemmaCount: 0,
        formCount: 0,
      };
      for (const entry of Object.values(hit)) {
        if (entry.mode === "lemma") meta.lemmaCount++;
        else meta.formCount++;
      }
      if (meta.lemmaCount > 0 && meta.formCount > 0) meta.mode = "mixed";
      else if (meta.lemmaCount > 0) meta.mode = "lemma";
      else meta.mode = "form";
      concordanceByParsed.set(parsed, { generation, index: hit, meta });
      return { index: hit, meta };
    }
  }

  const built = buildLanguageAwareConcordance(parsed, { language });
  concordanceByParsed.set(parsed, { generation, index: built.index, meta: built.meta });

  if (key) {
    concordanceBySource.set(key, built.index);
    if (concordanceBySource.size > CONCORDANCE_CACHE_LIMIT) {
      const oldest = concordanceBySource.keys().next().value;
      if (oldest !== undefined) concordanceBySource.delete(oldest);
    }
  }

  return built;
}

export function getConcordanceEntriesSorted(
  index: ConcordanceIndex,
  language?: WitnessLanguage,
): Array<{
  lemma: string;
  count: number;
  occurrences: WordOccurrence[];
  mode?: "lemma" | "word_form";
  variants?: Record<string, number>;
}> {
  const compare = witnessCollator(language);
  return Object.entries(index)
    .map(([lemma, data]) => ({
      lemma,
      count: data.count,
      occurrences: data.occurrences,
      mode: data.mode,
      variants: data.variants,
    }))
    .sort((a, b) => b.count - a.count || compare(a.lemma, b.lemma));
}
