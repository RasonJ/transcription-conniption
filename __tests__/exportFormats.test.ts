import {
  EXPORT_FORMAT_OPTIONS,
  defaultFileNameForFormat,
  ensureFileNameExtension,
  inferExportFormatFromFileName,
  mimeTypeForExportFormat,
} from "../utils/exportFormats";
import { buildManuscriptExportPayload } from "../utils/manuscriptExport";
import { compileManuscriptTree } from "../utils/compiler";
import { DEFAULT_DEMO } from "../constants/demoTranscriptions";

describe("exportFormats", () => {
  it("lists all eight primary sheet formats", () => {
    const ids = EXPORT_FORMAT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      "tei_xml",
      "tei_normalized_xml",
      "html",
      "svg",
      "png",
      "jpeg",
      "txt",
      "hsms_bundle",
    ]);
  });

  it("infers format from file extension", () => {
    expect(inferExportFormatFromFileName("witness.txt")).toBe("txt");
    expect(inferExportFormatFromFileName("page.HTML")).toBe("html");
    expect(inferExportFormatFromFileName("leaf.svg")).toBe("svg");
    expect(inferExportFormatFromFileName("scan.png")).toBe("png");
    expect(inferExportFormatFromFileName("photo.jpeg")).toBe("jpeg");
    expect(inferExportFormatFromFileName("edition.xml")).toBe("tei_xml");
    expect(inferExportFormatFromFileName("bundle.hsms")).toBe("hsms_bundle");
  });

  it("builds default names per format", () => {
    expect(defaultFileNameForFormat("TEXT.ACR.txt", "html")).toBe("TEXT.ACR.html");
    expect(defaultFileNameForFormat("TEXT.ACR.txt", "tei_xml")).toBe("TEXT.ACR.xml");
  });

  it("appends extension when missing", () => {
    expect(ensureFileNameExtension("TEXT.ACR", "png")).toBe("TEXT.ACR.png");
    expect(ensureFileNameExtension("TEXT.ACR", "tei_normalized_xml")).toBe("TEXT.ACR.xml");
  });

  it("keeps .xml when the selected TEI variant is explicit", () => {
    expect(ensureFileNameExtension("edition.xml", "tei_normalized_xml")).toBe("edition.xml");
  });

  it("builds txt, html, svg, and TEI payloads", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const ctx = { parsed, sourceText: DEFAULT_DEMO, display: {} };
    expect(buildManuscriptExportPayload("txt", ctx).contents).toContain("{RMK:");
    expect(buildManuscriptExportPayload("html", ctx).contents).toContain("<!DOCTYPE html>");
    expect(buildManuscriptExportPayload("svg", ctx).contents).toContain("<svg");
    expect(buildManuscriptExportPayload("tei_xml", ctx).contents).toContain("<TEI");
    expect(mimeTypeForExportFormat("png")).toBe("image/png");
    expect(mimeTypeForExportFormat("hsms_bundle")).toBe("application/json");
  });
});
