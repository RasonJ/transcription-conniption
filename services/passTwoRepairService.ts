/**
 * Pass 2 — HSMS structural syntax repair (Agent 2 / gpt-5-mini Foundry agent).
 *
 * Called only when local ingest/lint finds critical errors after Pass 1 vision.
 * Does not modernize orthography.
 *
 * Multi-page PDFs use `runBatchPassTwoRepair` so all flagged folios share one
 * gpt-5.4-mini turn (large context) instead of N repair API calls.
 */
import {
  chatWithAzureAgent,
  isAzureAgentConfigured,
  SYNTAX_REPAIR_INTENT,
} from "@/services/azureAgentOrchestrator";
import { extractHsmsAsciiPayload } from "@/utils/hsmsAsciiPayload";
import type { ValidationError } from "@/constants/manuscript";

export function formatDiagnosticsForRepair(errors: ValidationError[]): string[] {
  return errors.map((e) => {
    const line = typeof e.lineIndex === "number" ? `L${e.lineIndex + 1}` : "L?";
    const code = e.code ? `[${e.code}] ` : "";
    return `${line}: ${code}${e.message}`;
  });
}

/**
 * Agent 2: Fix structural syntax errors flagged by local hsmsLinter / prooferIncidents.
 * Query shape matches the Studio pipeline sketch:
 *   Fix errors:\n{messages}\n\n{rawHsms}
 */
export async function runPassTwoRepair(
  rawHsmsText: string,
  errorMessages: string[],
): Promise<string> {
  if (!isAzureAgentConfigured()) {
    throw new Error(
      "Azure HSMS agent is not configured. Set EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT, deployments, and EXPO_PUBLIC_AZURE_AGENT_API_KEY.",
    );
  }

  const repairResult = await chatWithAzureAgent({
    query:
      `Fix errors:\n${errorMessages.join("\n")}\n\n${rawHsmsText}\n\n` +
      `Repair ONLY structural markup (braces {}, {CB.} envelopes, EMPTY_COLUMN_ENVELOPE, TEXT_OUTSIDE_COLUMN). ` +
      `Do NOT alter or modernize 16th-century spelling. Output ONLY repaired HSMS ASCII text.`,
    screen: "Studio",
    persona: "linter_corrector",
    intent_key: SYNTAX_REPAIR_INTENT,
    agent_role: "syntax",
  });

  return extractHsmsAsciiPayload(repairResult.answer);
}

export interface PageDiagnosticsPayload {
  pageIndex: number;
  folioId: string;
  rawHsmsAscii: string;
  errorMessages: string[];
}

export interface RepairedPageResult {
  pageIndex: number;
  folioId: string;
  repairedHsmsAscii: string;
}

/**
 * Executes a single Pass 2 repair request over all flagged pages in a batch.
 * Clean pages (0 critical errors) must never be included — skip them at the caller.
 */
export async function runBatchPassTwoRepair(
  flaggedPages: PageDiagnosticsPayload[],
): Promise<RepairedPageResult[]> {
  if (flaggedPages.length === 0) return [];

  if (!isAzureAgentConfigured()) {
    throw new Error(
      "Azure HSMS agent is not configured. Set EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT, deployments, and EXPO_PUBLIC_AZURE_AGENT_API_KEY.",
    );
  }

  // Single-page batches reuse the tighter per-page repair prompt.
  if (flaggedPages.length === 1) {
    const only = flaggedPages[0];
    const repaired = await runPassTwoRepair(only.rawHsmsAscii, only.errorMessages);
    return [
      {
        pageIndex: only.pageIndex,
        folioId: only.folioId,
        repairedHsmsAscii: repaired,
      },
    ];
  }

  const pageSections = flaggedPages.map((p) => {
    return `=== PAGE ${p.pageIndex + 1} [fol. ${p.folioId}] ===
### DIAGNOSTICS:
${p.errorMessages.map((e) => `- ${e}`).join("\n")}

### RAW HSMS TEXT:
${p.rawHsmsAscii}
=== END PAGE ${p.pageIndex + 1} ===`;
  });

  const batchPrompt = `You are a strict HSMS structural syntax repair tool (Agent 2).

The following manuscript pages contain structural syntax errors detected by the local linter.

${pageSections.join("\n\n")}

### REPAIR DIRECTIVES:
1. Fix ONLY structural syntax errors (unclosed braces {}, unbalanced brackets [], or broken {CB.} envelopes).
2. Maintain the === PAGE N [fol. X] === section wrappers around each page so outputs can be split cleanly.
3. DO NOT alter, modernize, or rephrase any transcribed 16th-century words or spelling.
4. Keep all text strictly inside column envelopes ({CB1. ...} or {CB2. ...}).
5. Output ONLY the repaired HSMS ASCII sections without Markdown code blocks or preambles.`;

  const repairResult = await chatWithAzureAgent({
    query: batchPrompt,
    screen: "Studio",
    persona: "linter_corrector",
    intent_key: SYNTAX_REPAIR_INTENT,
    agent_role: "syntax",
  });

  const rawAnswer = extractHsmsAsciiPayload(repairResult.answer);
  return alignBatchRepairResults(parseBatchRepairResponse(rawAnswer, flaggedPages), flaggedPages);
}

/**
 * Split a consolidated Pass 2 response into per-page payloads.
 * Exported for unit tests.
 */
export function parseBatchRepairResponse(
  response: string,
  originalPages: PageDiagnosticsPayload[],
): RepairedPageResult[] {
  const pageRegex =
    /===\s*PAGE\s*(\d+)\s*\[fol\.\s*([^\]]+)\]\s*===([\s\S]*?)(?====\s*PAGE|\s*$)/gi;
  const results: RepairedPageResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = pageRegex.exec(response)) !== null) {
    const pageNum = parseInt(match[1], 10);
    const folioId = match[2].trim();
    const content = match[3].replace(/===\s*END PAGE\s*\d+\s*===/gi, "").trim();
    // Drop diagnostic echo headers if the model mirrored them.
    const cleaned = content
      .replace(/^###\s*DIAGNOSTICS:[\s\S]*?(?=###\s*RAW HSMS TEXT:|$)/i, "")
      .replace(/^###\s*RAW HSMS TEXT:\s*/i, "")
      .trim();

    results.push({
      pageIndex: Number.isFinite(pageNum) ? pageNum - 1 : -1,
      folioId,
      repairedHsmsAscii: cleaned || content,
    });
  }

  if (results.length === 0 && originalPages.length === 1) {
    results.push({
      pageIndex: originalPages[0].pageIndex,
      folioId: originalPages[0].folioId,
      repairedHsmsAscii: response.trim(),
    });
  }

  return results;
}

/** Prefer parsed repairs; keep Pass 1 ASCII when a folio section is missing. */
export function alignBatchRepairResults(
  parsed: RepairedPageResult[],
  originalPages: PageDiagnosticsPayload[],
): RepairedPageResult[] {
  if (parsed.length === 0) {
    return originalPages.map((orig) => ({
      pageIndex: orig.pageIndex,
      folioId: orig.folioId,
      repairedHsmsAscii: orig.rawHsmsAscii,
    }));
  }

  return originalPages.map((orig) => {
    const hit =
      parsed.find((r) => r.pageIndex === orig.pageIndex) ??
      parsed.find((r) => r.folioId === orig.folioId);
    return (
      hit ?? {
        pageIndex: orig.pageIndex,
        folioId: orig.folioId,
        repairedHsmsAscii: orig.rawHsmsAscii,
      }
    );
  });
}
