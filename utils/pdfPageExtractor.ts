/**
 * Native / default PDF slicer (iOS & Android).
 * Expo Web overrides this via `pdfPageExtractor.web.ts` (pdf.js → canvas PNG).
 *
 * Expo Go has no canvas-backed pdf.js. Prefer Expo Web for multi-page PDFs.
 * Optional: install `react-native-pdf-to-image` in a custom native build.
 */
import { EncodingType, readAsStringAsync } from "@/utils/expoFileSystem";
import {
  DEFAULT_PDF_MAX_PAGES,
  folioIdFromPageNumber,
  PdfSlicerError,
  type ConvertPdfOptions,
  type ExtractedPageImage,
  type PdfExtractSource,
} from "./pdfPageExtractorTypes";

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

type NativeConvertResult = { outputFiles?: string[] } | string[];

async function tryNativePdfToImage(pdfUri: string): Promise<string[] | null> {
  try {
    // Optional peer for custom native builds — not required for Expo Web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-pdf-to-image") as {
      convert?: (uri: string) => Promise<NativeConvertResult>;
      default?: { convert?: (uri: string) => Promise<NativeConvertResult> };
    };
    const convert = mod.convert ?? mod.default?.convert;
    if (!convert) return null;
    const result = await convert(pdfUri);
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.outputFiles)) return result.outputFiles;
    return null;
  } catch {
    return null;
  }
}

async function fileUriToDataUri(fileUri: string): Promise<string> {
  const base64 = await readAsStringAsync(fileUri, { encoding: EncodingType.Base64 });
  const mime = /\.jpe?g$/i.test(fileUri) ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${base64}`;
}

/**
 * Converts a local PDF URI into page image data URIs when a native converter is available.
 */
export async function convertPdfToPageImages(
  source: PdfExtractSource | { uri: string },
  options: ConvertPdfOptions = {},
): Promise<ExtractedPageImage[]> {
  const uri =
    "kind" in source && source.kind === "uri"
      ? source.uri
      : "uri" in source
        ? source.uri
        : "";
  if (!uri) {
    throw new PdfSlicerError(
      "Native PDF slicing requires a file URI. On Expo Go, open the Studio in Expo Web to slice multi-page PDFs with PDF.js.",
    );
  }

  const maxPages = options.maxPages ?? DEFAULT_PDF_MAX_PAGES;
  const paths = await tryNativePdfToImage(uri);
  if (!paths || paths.length === 0) {
    throw new PdfSlicerError(
      "Multi-page PDF slicing on iOS/Android needs a custom native build with react-native-pdf-to-image, or use Expo Web (PDF.js client slicer). You can also upload individual page images.",
    );
  }

  const limited = paths.slice(0, maxPages);
  const pageImages: ExtractedPageImage[] = [];
  for (let i = 0; i < limited.length; i++) {
    const pageNumber = i + 1;
    const folioId = folioIdFromPageNumber(pageNumber);
    const dataUri = await fileUriToDataUri(limited[i]);
    pageImages.push({ folioId, pageNumber, dataUri });
    options.onPageRendered?.({
      pageNumber,
      totalPages: limited.length,
      folioId,
    });
    // Yield between pages so long native conversions do not stall the JS thread.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return pageImages;
}
