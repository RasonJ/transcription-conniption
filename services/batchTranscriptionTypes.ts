/**
 * Lightweight types for the batch vision pipeline — safe to import from Tier 0.
 * Keep runtime Azure / PDF code in `batchTranscriptionService.ts` (lazy).
 */

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

export interface BatchTranscriptionResult {
  hsmsAscii: string;
  isValid: boolean;
  errorCount: number;
  warningCount: number;
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
  imageMime?: "image/png" | "image/jpeg";
  onProgress?: (progress: BatchProgress) => void;
  /**
   * Fired after each folio is transcribed + linted, with the cumulative HSMS so far.
   * Awaited so React can paint parchment before the next Azure call.
   */
  onFolioComplete?: (folio: TranscribedFolio, cumulativeHsms: string) => void | Promise<void>;
  /** Optional abort signal to stop between pages. */
  signal?: AbortSignal;
};
