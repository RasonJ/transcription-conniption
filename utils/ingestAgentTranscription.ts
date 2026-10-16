/**
 * Client gatekeeper for Azure vision → HSMS drafts.
 *
 * The agent returns probabilistic ASCII; this module runs the deterministic
 * pipeline (lint → compile → enrich) before Studio / parchment consume it.
 */
import type { ParsedManuscript, ValidationError } from "@/constants/manuscript";
import { enrichParsedManuscript } from "@/utils/analyzeManuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { extractHsmsAsciiPayload } from "@/utils/hsmsAsciiPayload";
import {
  lintHsmsTranscription,
  type LintHsmsOptions,
  type LintReport,
} from "@/utils/hsmsLinter";

export type IngestAgentTranscriptionResult = {
  /** Fence-/chatter-stripped HSMS ASCII. */
  hsmsAscii: string;
  /** Alias for callers that expect `cleanAscii`. */
  cleanAscii: string;
  parsedManuscript: ParsedManuscript;
  /** Alias for `parsedManuscript` (spatial tree for SvgFacsimilePage). */
  parsed: ParsedManuscript;
  lintReport: LintReport;
  isValid: boolean;
  criticalErrors: ValidationError[];
  warnings: ValidationError[];
  issues: ValidationError[];
};

/**
 * Strip agent chatter, lint, compile to AST, and attach validation diagnostics.
 * Does not mutate Scriptorium state — callers pass `hsmsAscii` to `applyTranscription`.
 */
export function ingestAgentTranscription(
  rawHsmsFromAgent: string,
  options?: LintHsmsOptions,
): IngestAgentTranscriptionResult {
  const hsmsAscii = extractHsmsAsciiPayload(rawHsmsFromAgent);
  const lintReport = lintHsmsTranscription(hsmsAscii, options);
  const parsedManuscript = compileManuscriptTree(hsmsAscii);
  const enriched = enrichParsedManuscript(parsedManuscript, hsmsAscii, lintReport.issues);

  return {
    hsmsAscii,
    cleanAscii: hsmsAscii,
    parsedManuscript: enriched,
    parsed: enriched,
    lintReport,
    isValid: lintReport.isValid,
    criticalErrors: lintReport.criticalErrors,
    warnings: lintReport.structuralWarnings,
    issues: lintReport.issues,
  };
}

/**
 * Vision-output guard: strip accidental preambles, lint, compile spatial AST.
 * Preferred entry for `transcribePageScan` / batch folio completion.
 */
export function handleAgentVisionOutput(
  rawAsciiFromAgent: string,
  options?: LintHsmsOptions,
): IngestAgentTranscriptionResult {
  return ingestAgentTranscription(rawAsciiFromAgent, options);
}
