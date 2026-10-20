export type ManuscriptExportFormat =
  | "tei_xml"
  | "tei_normalized_xml"
  | "html"
  | "svg"
  | "png"
  | "jpeg"
  | "webp"
  | "txt"
  | "hsms_bundle";

export type ExportFormatCategory = "edition" | "page" | "text" | "project";

export interface ExportFormatOption {
  id: ManuscriptExportFormat;
  /** @deprecated Prefer `id` — kept for callers that still read `.format`. */
  format: ManuscriptExportFormat;
  extension: string;
  mimeType: string;
  category: ExportFormatCategory;
  labelKey: string;
  descriptionKey: string;
  /** English fallback when i18n key is missing. */
  label: string;
  hint: string;
}

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
  xml: "tei_xml",
  hsms: "hsms_bundle",
};

const FORMAT_MIME: Record<ManuscriptExportFormat, string> = {
  tei_xml: "application/tei+xml",
  tei_normalized_xml: "application/tei+xml",
  html: "text/html;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain;charset=utf-8",
  hsms_bundle: "application/json",
};

const FORMAT_EXTENSIONS: Record<ManuscriptExportFormat, string> = {
  tei_xml: ".xml",
  tei_normalized_xml: ".xml",
  html: ".html",
  svg: ".svg",
  png: ".png",
  jpeg: ".jpg",
  webp: ".webp",
  txt: ".txt",
  hsms_bundle: ".hsms",
};

function option(
  partial: Omit<ExportFormatOption, "format"> & { id: ManuscriptExportFormat },
): ExportFormatOption {
  return { ...partial, format: partial.id };
}

/** Primary sheet formats (SPEC-STUDIO-IA §3.3). webp stays supported for raster helpers only. */
export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  option({
    id: "tei_xml",
    extension: ".xml",
    mimeType: FORMAT_MIME.tei_xml,
    category: "edition",
    labelKey: "export.format.teiXml.label",
    descriptionKey: "export.format.teiXml.description",
    label: "TEI XML (diplomatic)",
    hint: "For digital editions and archives",
  }),
  option({
    id: "tei_normalized_xml",
    extension: ".xml",
    mimeType: FORMAT_MIME.tei_normalized_xml,
    category: "edition",
    labelKey: "export.format.teiNormalizedXml.label",
    descriptionKey: "export.format.teiNormalizedXml.description",
    label: "TEI XML (normalized)",
    hint: "Expanded abbreviations, modern word division",
  }),
  option({
    id: "html",
    extension: ".html",
    mimeType: FORMAT_MIME.html,
    category: "page",
    labelKey: "export.format.html.label",
    descriptionKey: "export.format.html.description",
    label: "Web page (.html)",
    hint: "Opens in any browser; keeps the page layout",
  }),
  option({
    id: "svg",
    extension: ".svg",
    mimeType: FORMAT_MIME.svg,
    category: "page",
    labelKey: "export.format.svg.label",
    descriptionKey: "export.format.svg.description",
    label: "Vector image (.svg)",
    hint: "For print and publication figures",
  }),
  option({
    id: "png",
    extension: ".png",
    mimeType: FORMAT_MIME.png,
    category: "page",
    labelKey: "export.format.png.label",
    descriptionKey: "export.format.png.description",
    label: "PNG image (.png)",
    hint: "For slides and documents",
  }),
  option({
    id: "jpeg",
    extension: ".jpg",
    mimeType: FORMAT_MIME.jpeg,
    category: "page",
    labelKey: "export.format.jpeg.label",
    descriptionKey: "export.format.jpeg.description",
    label: "JPEG image (.jpg)",
    hint: "Compressed raster for slides and documents",
  }),
  option({
    id: "txt",
    extension: ".txt",
    mimeType: FORMAT_MIME.txt,
    category: "text",
    labelKey: "export.format.txt.label",
    descriptionKey: "export.format.txt.description",
    label: "Plain text (.txt)",
    hint: "The HSMS source as plain text",
  }),
  option({
    id: "hsms_bundle",
    extension: ".hsms",
    mimeType: FORMAT_MIME.hsms_bundle,
    category: "project",
    labelKey: "export.format.hsmsBundle.label",
    descriptionKey: "export.format.hsmsBundle.description",
    label: "Transcription bundle (.hsms)",
    hint: "Source, page images and settings, to reopen later",
  }),
];

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

export function extensionForExportFormat(format: ManuscriptExportFormat): string {
  return FORMAT_EXTENSIONS[format];
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
  // `.xml` is ambiguous — prefer the explicitly selected TEI variant.
  if (inferred === format) {
    return trimmed;
  }
  if (inferred === "tei_xml" && (format === "tei_xml" || format === "tei_normalized_xml")) {
    return trimmed;
  }
  // Recognized extension present: keep it (`.xml` stays for either TEI variant).
  if (inferred) {
    return trimmed;
  }
  return `${trimmed}${FORMAT_EXTENSIONS[format]}`;
}

export function isRasterExportFormat(format: ManuscriptExportFormat): boolean {
  return format === "png" || format === "jpeg" || format === "webp";
}

export function isTeiExportFormat(format: ManuscriptExportFormat): boolean {
  return format === "tei_xml" || format === "tei_normalized_xml";
}
