/**
 * HSMS Vision Transcription — two-pass Azure pipeline + local linter gate.
 *
 *   // Pass 1 — Agent 1 (gpt-4o vision)
 *   const visionResult = await chatWithAzureAgent({
 *     query: prompt,
 *     image_uri: pageDataUri,
 *     intent_key: "transcription.vision_ocr",
 *   });
 *
 *   // Local TypeScript linter gate
 *   const ingested = ingestAgentTranscription(visionResult.answer);
 *
 *   // Pass 2 — Agent 2 (gpt-5-mini repair) only if critical errors
 *   if (!ingested.isValid) {
 *     const repaired = await runPassTwoRepair(...);
 *   }
 *
 * Multi-page PDFs must be sliced client-side first via
 * `runHybridTranscriptionPipeline` (Pass 1 per page with skipSyntaxRepair,
 * then one `runBatchPassTwoRepair` for all flagged folios).
 */

import {
  chatWithAzureAgent,
  isAzureAgentConfigured,
  SYNTAX_REPAIR_INTENT,
  VISION_OCR_INTENT,
} from "@/services/azureAgentOrchestrator";
import {
  formatDiagnosticsForRepair,
  runPassTwoRepair,
} from "@/services/passTwoRepairService";
import { EncodingType, readAsStringAsync } from "@/utils/expoFileSystem";
import { extractHsmsAsciiPayload } from "@/utils/hsmsAsciiPayload";
import {
  handleAgentVisionOutput,
  ingestAgentTranscription,
} from "@/utils/ingestAgentTranscription";
import type { ValidationError } from "@/constants/manuscript";
import { isPdfSource } from "@/utils/pdfPageExtractorTypes";

export {
  handleAgentVisionOutput,
  ingestAgentTranscription,
  SYNTAX_REPAIR_INTENT,
  VISION_OCR_INTENT,
};
export {
  runPassTwoRepair,
  runBatchPassTwoRepair,
  formatDiagnosticsForRepair,
} from "@/services/passTwoRepairService";

export interface VisionTranscriptionResult {
  hsmsAscii: string;
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  tool_executed?: string;
  /** True when Pass 2 syntax repair ran after Pass 1 lint failures. */
  repaired?: boolean;
}

/** @deprecated Prefer `@/utils/hsmsAsciiPayload` — re-exported for existing imports. */
export { extractHsmsAsciiPayload };

/** @deprecated Prefer `formatDiagnosticsForRepair`. */
export function formatLintErrorsForRepair(errors: ValidationError[]): string[] {
  return formatDiagnosticsForRepair(errors);
}

/**
 * Pass 2 — strict structural syntax repair (no orthographic modernization).
 * @deprecated Prefer `runPassTwoRepair` from `@/services/passTwoRepairService`.
 */
export async function passTwoFixSyntax(
  rawAscii: string,
  lintErrors: string[],
): Promise<string> {
  return runPassTwoRepair(rawAscii, lintErrors);
}

async function toDataUri(imageUri: string, mimeHint?: string): Promise<string> {
  if (imageUri.startsWith("data:")) return imageUri;
  if (/^https?:\/\//i.test(imageUri)) {
    return imageUri;
  }

  const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
  const mime =
    mimeHint ??
    (/\.png$/i.test(imageUri)
      ? "image/png"
      : /\.webp$/i.test(imageUri)
        ? "image/webp"
        : /\.pdf$/i.test(imageUri)
          ? "application/pdf"
          : "image/jpeg");
  return `data:${mime};base64,${base64}`;
}

/**
 * Pass 1 (gpt-4o vision) → local ingest/lint → optional Pass 2 (gpt-5-mini repair).
 */
export async function transcribePageScan(params: {
  imageUri: string;
  folioId?: string;
  languageHint?: string;
  mimeType?: string;
  locale?: string;
  /** Skip Pass 2 even when lint reports critical errors (default false). */
  skipSyntaxRepair?: boolean;
}): Promise<VisionTranscriptionResult> {
  if (!isAzureAgentConfigured()) {
    throw new Error(
      "Azure HSMS agent is not configured. Set EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT (or PROJECT_ENDPOINT), deployments, and EXPO_PUBLIC_AZURE_AGENT_API_KEY.",
    );
  }

  if (
    isPdfSource(params.mimeType, params.imageUri) ||
    params.imageUri.startsWith("data:application/pdf")
  ) {
    throw new Error(
      "PDF bytes cannot be sent to the vision agent. Use runHybridTranscriptionPipeline so pages are sliced to PNG/JPEG on the client first.",
    );
  }

  const pageDataUri = await toDataUri(params.imageUri, params.mimeType);
  if (pageDataUri.startsWith("data:application/pdf")) {
    throw new Error(
      "Refusing to upload a PDF data URI. Slice the PDF to page images with convertPdfToPageImages first.",
    );
  }

  const folioLabel = params.folioId ?? "current leaf";
  const lang = params.languageHint ?? "POR/SPA";
  const locale = params.locale ?? "pt";
  const folioMarker = params.folioId ?? "1";

  const prompt =
    `TRANSCRIBE PAGE: ${folioLabel}\n` +
    `Hint language: ${lang}.\n` +
    `Emit [fol. ${folioMarker}] once, then ONE multiline column envelope:\n` +
    `[fol. ${folioMarker}]\n{CB1.\n1 {IN4.} …first line…\n2 …\n}\n` +
    `Never emit an empty {CB1.} tag. Keep {RUB.}/{INn.}/{ILL.} inside the envelope.\n` +
    `Return only raw HSMS markup.`;

  // ── Pass 1: Agent 1 (gpt-4o vision) ─────────────────────────────────────
  const visionResult = await chatWithAzureAgent({
    query: prompt,
    image_uri: pageDataUri,
    intent_key: VISION_OCR_INTENT,
    screen: "Studio",
    persona: "paleographer",
    locale,
    folio_id: params.folioId,
    language_hint: params.languageHint,
    vision: true,
    agent_role: "vision",
    session_entities: {
      demo_date: "1537-01-01",
      locale,
      witness: "nunes_rotunda",
    },
  });

  // ── Local TypeScript linter gate ────────────────────────────────────────
  let ingested = ingestAgentTranscription(visionResult.answer);
  let repaired = false;
  let toolExecuted = visionResult.tool_executed;

  // ── Pass 2: Agent 2 (gpt-5-mini repair) only if critical errors ─────────
  if (
    !params.skipSyntaxRepair &&
    !ingested.isValid &&
    ingested.criticalErrors.length > 0
  ) {
    try {
      const fixedAscii = await runPassTwoRepair(
        ingested.hsmsAscii,
        formatDiagnosticsForRepair(ingested.criticalErrors),
      );
      ingested = ingestAgentTranscription(fixedAscii);
      repaired = true;
      toolExecuted = toolExecuted
        ? `${toolExecuted}+syntax_repair`
        : "syntax_repair";
    } catch (err) {
      console.warn("Pass 2 syntax repair failed; keeping Pass 1 output", err);
    }
  }

  return {
    hsmsAscii: ingested.hsmsAscii,
    isValid: ingested.isValid,
    errorCount: ingested.lintReport.errorCount,
    warningCount: ingested.lintReport.warningCount,
    tool_executed: toolExecuted,
    repaired,
  };
}
