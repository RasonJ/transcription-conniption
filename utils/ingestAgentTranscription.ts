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

/** Vision models are instructed to terminate with this sentinel. */
export const END_FOLIO_SENTINEL = "=== END FOLIO ===";

/**
 * Compare HSMS body lines by content, ignoring leading line numbers (`14 text` → `text`).
 */
function lineContentKey(line: string): string {
  return line
    .replace(/^\s*\d+\s+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Cut runaway vision completions: END FOLIO sentinel, fence strip, consecutive
 * duplicate-line prune (line-number–aware), and close a truncated `{CB1.` brace.
 */
export function sanitizeVisionOutput(rawOutput: string): string {
  if (!rawOutput) return "";

  // 1. Cut off output at the end sentinel if present
  let cleaned = rawOutput.split(/===\s*END FOLIO\s*===/i)[0].trim();

  // 2. Strip Markdown code fences if the model emitted them
  cleaned = cleaned
    .replace(/^```(?:hsms|text|txt)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // 3. Repetition trap: prune consecutive duplicate *content* lines
  //    (HSMS line numbers differ while the model loops on the same phrase).
  const lines = cleaned.split("\n");
  const sanitizedLines: string[] = [];
  let consecutiveDuplicates = 0;
  let lastKey = "";

  for (const line of lines) {
    const key = lineContentKey(line);
    if (key.length > 0 && key === lastKey) {
      consecutiveDuplicates++;
      // Keep at most two identical content lines; drop further repetitions.
      if (consecutiveDuplicates >= 2) {
        continue;
      }
    } else {
      consecutiveDuplicates = 0;
      lastKey = key;
    }
    sanitizedLines.push(line);
  }

  // 4. Ensure closing column brace `}` exists if it was cut off mid-loop
  let result = sanitizedLines.join("\n").trim();
  const openCb = (result.match(/\{CB[12]\./g) ?? []).length;
  const closeBraces = (result.match(/^\}/gm) ?? []).length;
  if (openCb > closeBraces) {
    result += "\n}";
  }

  return result;
}

/**
 * Strip agent chatter, lint, compile to AST, and attach validation diagnostics.
 * Does not mutate Scriptorium state — callers pass `hsmsAscii` to `applyTranscription`.
 */
export function ingestAgentTranscription(
  rawHsmsFromAgent: string,
  options?: LintHsmsOptions,
): IngestAgentTranscriptionResult {
  const sanitized = sanitizeVisionOutput(rawHsmsFromAgent);
  const hsmsAscii = extractHsmsAsciiPayload(sanitized);
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
