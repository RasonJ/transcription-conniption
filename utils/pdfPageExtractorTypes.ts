/**
 * Shared types / helpers for client-side PDF → PNG page slicing.
 * Platform implementations: `pdfPageExtractor.web.ts` / `pdfPageExtractor.native.ts`.
 */

export interface ExtractedPageImage {
  /** Suggested HSMS folio id, e.g. `1r`, `1v`, `2r`. */
  folioId: string;
  pageNumber: number;
  /** `data:image/png;base64,…` vision frame — never a PDF. */
  dataUri: string;
}

export type PdfExtractSource =
  | { kind: "file"; file: File }
  | { kind: "uri"; uri: string; name?: string; mimeType?: string };

export type ConvertPdfOptions = {
  /** Canvas scale (2 ≈ high-DPI for historical type). */
  dpiScale?: number;
  /** Cap pages (default 25) to avoid vision/context blowouts. */
  maxPages?: number;
  /** JPEG quality 0–1 when encoding (PNG ignores quality on most browsers). */
  imageQuality?: number;
  /** Prefer `image/jpeg` for smaller A2A payloads (default png). */
  imageMime?: "image/png" | "image/jpeg";
  onPageRendered?: (info: { pageNumber: number; totalPages: number; folioId: string }) => void;
};

export const DEFAULT_PDF_MAX_PAGES = 25;
export const DEFAULT_PDF_DPI_SCALE = 2;

/**
 * Map 1-based PDF page index to recto/verso folio labels:
 * page 1 → 1r, page 2 → 1v, page 3 → 2r, …
 */
export function folioIdFromPageNumber(pageNumber: number): string {
  const n = Math.max(1, Math.floor(pageNumber));
  const folioNum = Math.ceil(n / 2);
  const side = n % 2 !== 0 ? "r" : "v";
  return `${folioNum}${side}`;
}

export function isPdfSource(nameOrMime?: string | null, uri?: string | null): boolean {
  const mime = (nameOrMime ?? "").toLowerCase();
  if (mime.includes("pdf") || mime === "application/pdf") return true;
  const path = (uri ?? nameOrMime ?? "").toLowerCase();
  return /\.pdf($|\?)/i.test(path);
}

export class PdfSlicerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfSlicerError";
  }
}
