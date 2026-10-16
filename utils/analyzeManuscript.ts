import type { ParsedManuscript, ValidationError } from "../constants/manuscript";
import { countWordsInFlow } from "./flowWords";
import { filterMetadataBlocksFromFolios } from "./metadataBlocks";
import { mergeValidationErrors } from "./parseValidation";
import { validateTranscription } from "./validation";

/**
 * Attach validation diagnostics to a parsed manuscript (Tier 0, runs on every compile).
 * The concordance is Tier 1: build it on demand with `getConcordanceForManuscript`
 * from `utils/concordance.ts` (SPEC-LIGHTWEIGHT §4.1).
 */
export function enrichParsedManuscript(
  parsed: ParsedManuscript,
  rawText: string,
  parseValidationErrors: ValidationError[] = [],
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
