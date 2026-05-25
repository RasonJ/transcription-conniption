export type ManuscriptExportFormat = "txt" | "html" | "svg" | "png" | "jpeg" | "webp";

const EXTENSION_FORMAT: Record<string, ManuscriptExportFormat> = {
  txt: "txt",
  text: "txt",
  html: "html",
  htm: "html",
  svg: "svg",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
};

const FORMAT_MIME: Record<ManuscriptExportFormat, string> = {
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const FORMAT_EXTENSIONS: Record<ManuscriptExportFormat, string> = {
  txt: ".txt",
  html: ".html",
  svg: ".svg",
  png: ".png",
  jpeg: ".jpg",
  webp: ".webp",
};

export function exportBaseName(sourceFileName?: string | null): string {
  const base = (sourceFileName ?? "manuscript").replace(/\.[^/.]+$/, "");
  return base.replace(/[^\w.\-]+/g, "_") || "manuscript";
}

export function inferExportFormatFromFileName(fileName: string): ManuscriptExportFormat | null {
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) {
    return null;
  }
  return EXTENSION_FORMAT[match[1]] ?? null;
}

export function mimeTypeForExportFormat(format: ManuscriptExportFormat): string {
  return FORMAT_MIME[format];
}

export function defaultFileNameForFormat(
  sourceFileName: string | null | undefined,
  format: ManuscriptExportFormat,
): string {
  return `${exportBaseName(sourceFileName)}${FORMAT_EXTENSIONS[format]}`;
}

export function ensureFileNameExtension(fileName: string, format: ManuscriptExportFormat): string {
  const trimmed = fileName.trim().replace(/[/\\?%*:|"<>]/g, "_");
  if (!trimmed) {
    return defaultFileNameForFormat(null, format);
  }
  const inferred = inferExportFormatFromFileName(trimmed);
  if (inferred) {
    return trimmed;
  }
  return `${trimmed}${FORMAT_EXTENSIONS[format]}`;
}

export const EXPORT_FORMAT_OPTIONS: { format: ManuscriptExportFormat; label: string; hint: string }[] = [
  { format: "txt", label: "Plain text (.txt)", hint: "Original HSMS transcription source" },
  { format: "html", label: "HTML facsimile (.html)", hint: "Legacy table layout for browsers" },
  { format: "svg", label: "Vector image (.svg)", hint: "Scalable parchment sheet" },
  { format: "png", label: "PNG image (.png)", hint: "Raster snapshot (web)" },
  { format: "jpeg", label: "JPEG image (.jpg)", hint: "Compressed raster (web)" },
];

export function isRasterExportFormat(format: ManuscriptExportFormat): boolean {
  return format === "png" || format === "jpeg" || format === "webp";
}
