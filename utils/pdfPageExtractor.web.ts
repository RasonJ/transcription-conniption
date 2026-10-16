/**
 * Expo Web PDF slicer — pdfjs-dist renders each page to a high-DPI canvas,
 * then exports PNG/JPEG data URIs for Azure vision (never sends PDF bytes).
 */
import {
  DEFAULT_PDF_DPI_SCALE,
  DEFAULT_PDF_MAX_PAGES,
  folioIdFromPageNumber,
  PdfSlicerError,
  type ConvertPdfOptions,
  type ExtractedPageImage,
  type PdfExtractSource,
} from "./pdfPageExtractorTypes";

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const pdfjs = mod as PdfjsModule;
      // CDN worker keeps Metro from bundling the worker entry (Expo web).
      if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function sourceToArrayBuffer(source: PdfExtractSource): Promise<ArrayBuffer> {
  if (source.kind === "file") {
    return source.file.arrayBuffer();
  }
  const res = await fetch(source.uri);
  if (!res.ok) {
    throw new PdfSlicerError(`Failed to read PDF (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * Converts a client PDF into a sequence of Base64 page images for vision OCR.
 */
export async function convertPdfToPageImages(
  source: PdfExtractSource | File,
  options: ConvertPdfOptions = {},
): Promise<ExtractedPageImage[]> {
  const src: PdfExtractSource =
    typeof File !== "undefined" && source instanceof File
      ? { kind: "file", file: source }
      : (source as PdfExtractSource);

  const dpiScale = options.dpiScale ?? DEFAULT_PDF_DPI_SCALE;
  const maxPages = options.maxPages ?? DEFAULT_PDF_MAX_PAGES;
  const imageMime = options.imageMime ?? "image/png";
  const imageQuality = options.imageQuality ?? 0.92;

  const pdfjs = await loadPdfjs();
  const data = await sourceToArrayBuffer(src);
  const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  try {
    const total = Math.min(pdfDocument.numPages, maxPages);
    const pageImages: ExtractedPageImage[] = [];

    for (let pageNum = 1; pageNum <= total; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      let canvas: HTMLCanvasElement | null = null;
      try {
        // Apply the PDF page /Rotate so glyphs appear upright for Azure vision.
        const pageRotate = typeof page.rotate === "number" ? page.rotate : 0;
        const viewport = page.getViewport({ scale: dpiScale, rotation: pageRotate });
        canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new PdfSlicerError("Canvas 2D context unavailable for PDF page render");
        }
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;

        const folioId = folioIdFromPageNumber(pageNum);
        const dataUri =
          imageMime === "image/jpeg"
            ? canvas.toDataURL("image/jpeg", imageQuality)
            : canvas.toDataURL("image/png");

        pageImages.push({ folioId, pageNumber: pageNum, dataUri });
        options.onPageRendered?.({ pageNumber: pageNum, totalPages: total, folioId });
      } finally {
        // Tear down canvas bitmaps even when render/toDataURL throws —
        // long manuscripts otherwise retain GPU/context handles until tab crash.
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
          canvas.remove();
        }
        page.cleanup();
      }
    }

    if (pageImages.length === 0) {
      throw new PdfSlicerError("PDF produced no page images");
    }
    return pageImages;
  } finally {
    await pdfDocument.destroy();
  }
}

export {
  DEFAULT_PDF_DPI_SCALE,
  DEFAULT_PDF_MAX_PAGES,
  folioIdFromPageNumber,
  isPdfSource,
  PdfSlicerError,
  type ConvertPdfOptions,
  type ExtractedPageImage,
  type PdfExtractSource,
} from "./pdfPageExtractorTypes";
