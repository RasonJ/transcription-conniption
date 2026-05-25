import type { ParsedManuscript } from "../constants/manuscript";
import { exportToLegacyHTML, type LegacyHtmlExportOptions } from "./htmlExport";
import { exportToSvgDocument } from "./svgDocumentExport";
import type { ManuscriptExportFormat } from "./exportFormats";
import { isRasterExportFormat } from "./exportFormats";

export type ManuscriptExportContext = {
  parsed: ParsedManuscript;
  sourceText: string;
  display: LegacyHtmlExportOptions;
};

export type ExportPayload =
  | { kind: "text"; contents: string }
  | { kind: "binary"; base64: string };

export function buildManuscriptExportPayload(
  format: ManuscriptExportFormat,
  ctx: ManuscriptExportContext,
): ExportPayload {
  switch (format) {
    case "txt":
      return { kind: "text", contents: ctx.sourceText };
    case "html":
      return { kind: "text", contents: exportToLegacyHTML(ctx.parsed, ctx.display) };
    case "svg":
      return { kind: "text", contents: exportToSvgDocument(ctx.parsed, ctx.display) };
    case "png":
    case "jpeg":
    case "webp":
      return {
        kind: "text",
        contents: exportToSvgDocument(ctx.parsed, ctx.display),
      };
    default:
      return { kind: "text", contents: ctx.sourceText };
  }
}

export function payloadNeedsRasterization(format: ManuscriptExportFormat): boolean {
  return isRasterExportFormat(format);
}
