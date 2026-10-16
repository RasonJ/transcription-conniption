import type { ConcordanceIndex, ParsedManuscript } from "../constants/manuscript";
import {
  buildConcordance,
  countWordsInFlow,
  getConcordanceForManuscript,
} from "./concordance";
import { filterMetadataBlocksFromFolios } from "./metadataBlocks";
import { mergeValidationErrors } from "./parseValidation";
import { validateTranscription } from "./validation";

/** Attach validation diagnostics to a parsed manuscript. Concordance is built lazily. */
export function enrichParsedManuscript(
  parsed: ParsedManuscript,
  rawText: string,
  parseValidationErrors: import("../constants/manuscript").ValidationError[] = [],
): ParsedManuscript {
  const stripped = filterMetadataBlocksFromFolios(parsed);
  const flow = stripped.reconstructedFlow ?? "";
  const flowWordCount = flow ? countWordsInFlow(flow) : stripped.stats.totalWords;

  return {
    ...stripped,
    stats: {
      ...parsed.stats,
      totalWords: flowWordCount > 0 ? flowWordCount : parsed.stats.totalWords,
    },
    validationErrors: mergeValidationErrors(
      validateTranscription(rawText),
      parseValidationErrors,
    ),
  };
}

/**
 * Concordance keyed by normalized lemma from hyphen-stitched folio flows.
 * Immune to line/column hyphen splits (e.g. adela- + ntar → adelantar).
 */
export function generateConcordanceIndex(parsed: ParsedManuscript): ConcordanceIndex {
  return buildConcordance(parsed);
}

export { getConcordanceForManuscript };

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
