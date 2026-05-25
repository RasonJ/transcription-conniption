import type { ConcordanceIndex, ParsedManuscript, WordOccurrence } from "../constants/manuscript";
import { STOPWORDS } from "../constants/stopwords";
import { lookupHsmsLemma } from "./hsmsDictionary";

const CONTEXT_RADIUS = 28;

const FLOW_CLEAN_RE = /\$[.;]/g;
const WORD_VALID_RE = /[A-Za-zÀ-ÿ0-9]/;
const FLOW_TOKEN_PATTERN = /[^\s]+/g;
const FLOW_WORD_MATCHER = /[A-Za-zÀ-ÿ0-9']+/g;

function normalizeLemma(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9']/g, "");
}

/**
 * Words from a hyphen-stitched flow string. Splits on whitespace only so
 * margin hyphens joined in reconstructedFlow stay inside lemmas (e.g. adelantar).
 */
export function extractWordsFromFlow(flow: string): string[] {
  return flow
    .split(/\s+/)
    .map((w) => w.replace(FLOW_CLEAN_RE, "").trim())
    .filter((w) => w.length > 1 && WORD_VALID_RE.test(w));
}

/** Count indexable words in a stitched reading flow (stats alignment). */
export function countWordsInFlow(flow: string): number {
  if (!flow) return 0;
  let count = 0;
  while (FLOW_TOKEN_PATTERN.exec(flow) !== null) {
    count++;
  }
  FLOW_TOKEN_PATTERN.lastIndex = 0;
  return count;
}

export function buildConcordance(
  parsed: ParsedManuscript,
  options?: { minCount?: number; maxOccurrencesPerWord?: number },
): ConcordanceIndex {
  const index: ConcordanceIndex = {};
  const minCount = options?.minCount ?? 1;
  const maxOcc = options?.maxOccurrencesPerWord ?? 200;

  for (const folio of parsed.folios) {
    const flow = folio.reconstructedFlow ?? "";
    if (!flow) continue;

    const matcher = FLOW_WORD_MATCHER;
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(flow)) !== null) {
      const word = match[0];
      const start = match.index;

      const lemma = lookupHsmsLemma(word) || normalizeLemma(word);
      if (!lemma || lemma.length < 2 || STOPWORDS.has(lemma)) {
        continue;
      }

      if (!index[lemma]) {
        index[lemma] = { count: 0, occurrences: [] };
      }

      const entry = index[lemma];
      entry.count++;

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
        delete index[key];
      }
    }
  }

  return index;
}

export function getConcordanceEntriesSorted(index: ConcordanceIndex): Array<{
  lemma: string;
  count: number;
  occurrences: WordOccurrence[];
}> {
  return Object.entries(index)
    .map(([lemma, data]) => ({ lemma, count: data.count, occurrences: data.occurrences }))
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma));
}
