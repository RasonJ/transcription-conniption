/**
 * Client-side PDF batch transcription pipeline (async, folio-streaming).
 *
 * Architecture:
 *
 *   [ Multi-Page PDF Queue ]
 *            │
 *            ▼
 *   [ Pass 1: Vision Agent ] ──► Page 1, Page 2, … (stream)
 *            │
 *            ▼
 *   [ Local Linter & Proofer ]  (~2ms / page, inside ingest)
 *            │
 *       ┌────┴────────────────────────────┐
 *       ▼                                 ▼
 *   (Clean pages)                  (Pages with errors)
 *       │                                 │
 *       │ stream immediately      [ Consolidate Diagnostics ]
 *       │                                 │
 *       │                         [ Pass 2: Single Batch Repair ]
 *       │                                 │
 *       └────────────────┬────────────────┘
 *                        ▼
 *              [ Stream Finalized Folios ]
 *
 * 1. Slice PDF → PNG/JPEG frames (never upload PDF to Azure)
 * 2. Pass 1 per page with `skipSyntaxRepair` — no per-page Pass 2 API calls
 * 3. Stream clean pages to parchment immediately
 * 4. One gpt-5.4-mini batch repair for all flagged pages
 * 5. Merge + return the final HSMS document
 */
import {
  lintHsmsTranscription,
  type LintReport,
} from "@/utils/hsmsLinter";
import {
  convertPdfToPageImages,
  isPdfSource,
  type ConvertPdfOptions,
  type ExtractedPageImage,
  type PdfExtractSource,
} from "@/utils/pdfPageExtractor";
import {
  transcribePageScan,
  type VisionTranscriptionResult,
} from "@/services/azureHsmsTranscriber";
import {
  formatDiagnosticsForRepair,
  runBatchPassTwoRepair,
  type PageDiagnosticsPayload,
} from "@/services/passTwoRepairService";
import { extractHsmsAsciiPayload } from "@/utils/hsmsAsciiPayload";
import { ingestAgentTranscription } from "@/utils/ingestAgentTranscription";

export interface BatchProgress {
  phase: "slicing" | "transcribing" | "repairing" | "merging";
  currentPage: number;
  totalPages: number;
  currentFolio: string;
  message?: string;
}

export interface TranscribedFolio {
  folioId: string;
  pageNumber: number;
  hsmsAscii: string;
  errorCount: number;
  warningCount: number;
}

export interface BatchTranscriptionResult extends VisionTranscriptionResult {
  pageCount: number;
  pages: Array<{ folioId: string; pageNumber: number; errorCount: number; warningCount: number }>;
  /** Number of pages that went through the consolidated Pass 2 repair. */
  repairedPageCount?: number;
}

export type BatchTranscriptionInput = {
  /** Local file URI from DocumentPicker / cache. */
  uri: string;
  name?: string;
  mimeType?: string;
  /** Browser File when available (web drag-drop). */
  file?: File;
  languageHint?: string;
  locale?: string;
  maxPages?: number;
  dpiScale?: number;
  imageMime?: ConvertPdfOptions["imageMime"];
  onProgress?: (progress: BatchProgress) => void;
  /**
   * Fired after each folio is transcribed + linted, with the cumulative HSMS so far.
   * Awaited so React can paint parchment before the next Azure call.
   */
  onFolioComplete?: (folio: TranscribedFolio, cumulativeHsms: string) => void | Promise<void>;
  /** Optional abort signal to stop between pages. */
  signal?: AbortSignal;
};

/** Join per-page HSMS payloads; ensure blank-line separation between leaves. */
export function mergeHsmsPages(pages: string[]): string {
  return pages
    .map((p) => extractHsmsAsciiPayload(p))
    .filter((p) => p.length > 0)
    .join("\n\n");
}

export function summarizeLint(hsmsAscii: string): Pick<
  VisionTranscriptionResult,
  "isValid" | "errorCount" | "warningCount"
> {
  const report: LintReport = lintHsmsTranscription(hsmsAscii);
  return {
    isValid: report.isValid,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
  };
}

/** Let React commit incremental parchment updates before the next network call. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function ensureFolioMarker(ascii: string, folioId: string): string {
  const trimmed = ascii.trim();
  if (!/\[fol\./i.test(trimmed)) {
    return `[fol. ${folioId}]\n${trimmed}`;
  }
  return trimmed;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Batch transcription aborted");
    err.name = "AbortError";
    throw err;
  }
}

function folioFromAscii(
  folioId: string,
  pageIndex: number,
  ascii: string,
): TranscribedFolio {
  const lint = summarizeLint(ascii);
  return {
    folioId,
    pageNumber: pageIndex + 1,
    hsmsAscii: ascii,
    errorCount: lint.errorCount,
    warningCount: lint.warningCount,
  };
}

/**
 * Single-page queue task (image uploads / smoke). Still runs conditional Pass 2
 * inside `transcribePageScan` — multi-page PDFs use batched Pass 2 instead.
 */
export async function processPageTask(
  task: {
    pageIndex: number;
    folioLabel: string;
    dataUri: string;
    languageHint?: string;
    locale?: string;
    mimeType?: string;
    skipSyntaxRepair?: boolean;
  },
  onPageComplete: (pageIndex: number, finalAscii: string, meta: TranscribedFolio) => void | Promise<void>,
): Promise<TranscribedFolio> {
  const result = await transcribePageScan({
    imageUri: task.dataUri,
    folioId: task.folioLabel,
    languageHint: task.languageHint,
    mimeType: task.mimeType,
    locale: task.locale,
    skipSyntaxRepair: task.skipSyntaxRepair,
  });
  const ascii = ensureFolioMarker(result.hsmsAscii, task.folioLabel);
  const folio: TranscribedFolio = {
    folioId: task.folioLabel,
    pageNumber: task.pageIndex + 1,
    hsmsAscii: ascii,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
  };
  await onPageComplete(task.pageIndex, ascii, folio);
  return folio;
}

/**
 * Hybrid entry: images go straight to vision; PDFs are sliced client-side first.
 * Never forwards `application/pdf` data URIs to Azure.
 * Streams folios via `onFolioComplete` as each Azure call returns.
 */
export async function runHybridTranscriptionPipeline(
  params: BatchTranscriptionInput,
): Promise<BatchTranscriptionResult> {
  const looksLikePdf = isPdfSource(params.mimeType ?? params.name, params.uri);

  if (!looksLikePdf) {
    params.onProgress?.({
      phase: "transcribing",
      currentPage: 1,
      totalPages: 1,
      currentFolio: "leaf",
      message: "Transcribing image…",
    });
    const single = await transcribePageScan({
      imageUri: params.uri,
      languageHint: params.languageHint,
      mimeType: params.mimeType,
      locale: params.locale,
    });
    const folio: TranscribedFolio = {
      folioId: "leaf",
      pageNumber: 1,
      hsmsAscii: single.hsmsAscii,
      errorCount: single.errorCount,
      warningCount: single.warningCount,
    };
    await params.onFolioComplete?.(folio, single.hsmsAscii);
    await yieldToUi();
    return {
      ...single,
      pageCount: 1,
      pages: [
        {
          folioId: "leaf",
          pageNumber: 1,
          errorCount: single.errorCount,
          warningCount: single.warningCount,
        },
      ],
      repairedPageCount: single.repaired ? 1 : 0,
    };
  }

  return processPdfBatchInBackground(params);
}

/**
 * Convert PDF pages to PNG frames on the client, Pass 1 each page (no Pass 2),
 * stream clean folios immediately, then one batched Pass 2 for flagged pages.
 */
export async function processPdfBatchInBackground(
  params: BatchTranscriptionInput,
): Promise<BatchTranscriptionResult> {
  const onProgress = params.onProgress;
  const signal = params.signal;

  throwIfAborted(signal);
  onProgress?.({
    phase: "slicing",
    currentPage: 0,
    totalPages: 0,
    currentFolio: "",
    message: "Rendering PDF pages to images…",
  });

  const source: PdfExtractSource =
    params.file && typeof File !== "undefined"
      ? { kind: "file", file: params.file }
      : { kind: "uri", uri: params.uri, name: params.name, mimeType: params.mimeType };

  const pageImages: ExtractedPageImage[] = await convertPdfToPageImages(source, {
    maxPages: params.maxPages,
    dpiScale: params.dpiScale,
    imageMime: params.imageMime ?? "image/jpeg",
    imageQuality: 0.88,
    onPageRendered: (info) => {
      onProgress?.({
        phase: "slicing",
        currentPage: info.pageNumber,
        totalPages: info.totalPages,
        currentFolio: info.folioId,
        message: `Rendered folio ${info.folioId} (${info.pageNumber}/${info.totalPages})`,
      });
    },
  });

  const totalPages = pageImages.length;
  const hsmsSlots: Array<string | null> = Array.from({ length: totalPages }, () => null);
  const folioSlots: Array<TranscribedFolio | null> = Array.from({ length: totalPages }, () => null);
  const flaggedForRepair: PageDiagnosticsPayload[] = [];

  const cumulativeFromSlots = (): string =>
    mergeHsmsPages(hsmsSlots.filter((s): s is string => typeof s === "string"));

  const emitFolio = async (folio: TranscribedFolio, pageIndex: number, ascii: string) => {
    hsmsSlots[pageIndex] = ascii;
    folioSlots[pageIndex] = folio;
    await params.onFolioComplete?.(folio, cumulativeFromSlots());
    await yieldToUi();
  };

  // ── Pass 1: vision OCR per page (stream clean; queue flagged) ────────────
  for (let i = 0; i < pageImages.length; i++) {
    throwIfAborted(signal);
    const page = pageImages[i];
    onProgress?.({
      phase: "transcribing",
      currentPage: i + 1,
      totalPages,
      currentFolio: page.folioId,
      message: `Transcribing [fol. ${page.folioId}]…`,
    });

    const result = await transcribePageScan({
      imageUri: page.dataUri,
      folioId: page.folioId,
      languageHint: params.languageHint ?? "POR",
      mimeType: params.imageMime === "image/png" ? "image/png" : "image/jpeg",
      locale: params.locale,
      // Defer Pass 2 — one batched repair after the vision queue.
      skipSyntaxRepair: true,
    });

    const ingested = ingestAgentTranscription(result.hsmsAscii);
    const ascii = ensureFolioMarker(ingested.hsmsAscii, page.folioId);

    if (ingested.isValid || ingested.criticalErrors.length === 0) {
      const folio = folioFromAscii(page.folioId, i, ascii);
      await emitFolio(folio, i, ascii);
    } else {
      flaggedForRepair.push({
        pageIndex: i,
        folioId: page.folioId,
        rawHsmsAscii: ascii,
        errorMessages: formatDiagnosticsForRepair(ingested.criticalErrors),
      });
    }

    // Drop the rendered frame reference so GC can reclaim large base64 strings.
    (page as { dataUri?: string }).dataUri = undefined;
  }

  // ── Pass 2: single batched syntax repair for all flagged pages ───────────
  let repairedPageCount = 0;
  if (flaggedForRepair.length > 0) {
    throwIfAborted(signal);
    onProgress?.({
      phase: "repairing",
      currentPage: totalPages,
      totalPages,
      currentFolio: flaggedForRepair[0]?.folioId ?? "",
      message: `Batch syntax repair for ${flaggedForRepair.length} page(s)…`,
    });

    try {
      const repairedPages = await runBatchPassTwoRepair(flaggedForRepair);
      repairedPageCount = repairedPages.length;

      for (const repaired of repairedPages) {
        throwIfAborted(signal);
        const reIngested = ingestAgentTranscription(repaired.repairedHsmsAscii);
        const ascii = ensureFolioMarker(reIngested.hsmsAscii, repaired.folioId);
        const folio = folioFromAscii(repaired.folioId, repaired.pageIndex, ascii);
        await emitFolio(folio, repaired.pageIndex, ascii);
      }
    } catch (err) {
      console.warn("Batch repair failed; falling back to Pass 1 outputs", err);
      for (const fallback of flaggedForRepair) {
        throwIfAborted(signal);
        const ascii = ensureFolioMarker(fallback.rawHsmsAscii, fallback.folioId);
        const folio = folioFromAscii(fallback.folioId, fallback.pageIndex, ascii);
        await emitFolio(folio, fallback.pageIndex, ascii);
      }
    }
  }

  onProgress?.({
    phase: "merging",
    currentPage: totalPages,
    totalPages,
    currentFolio: pageImages[totalPages - 1]?.folioId ?? "",
    message: "Finalizing HSMS document…",
  });

  const hsmsPages = hsmsSlots.map((s, i) => {
    if (typeof s === "string") return s;
    // Should not happen — fill any gap with empty to keep pageCount honest.
    console.warn(`Missing HSMS slot for page index ${i}`);
    return "";
  });
  const hsmsAscii = mergeHsmsPages(hsmsPages);
  const lint = summarizeLint(hsmsAscii);
  const pageMeta = folioSlots.map((f, i) =>
    f
      ? {
          folioId: f.folioId,
          pageNumber: f.pageNumber,
          errorCount: f.errorCount,
          warningCount: f.warningCount,
        }
      : {
          folioId: pageImages[i]?.folioId ?? String(i + 1),
          pageNumber: i + 1,
          errorCount: 0,
          warningCount: 0,
        },
  );

  return {
    hsmsAscii,
    ...lint,
    pageCount: totalPages,
    pages: pageMeta,
    repairedPageCount,
    repaired: repairedPageCount > 0,
  };
}
