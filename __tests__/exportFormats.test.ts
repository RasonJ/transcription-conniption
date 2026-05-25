import {
  defaultFileNameForFormat,
  ensureFileNameExtension,
  inferExportFormatFromFileName,
  mimeTypeForExportFormat,
} from "../utils/exportFormats";
import { buildManuscriptExportPayload } from "../utils/manuscriptExport";
import { compileManuscriptTree } from "../utils/compiler";
import { DEFAULT_DEMO } from "../constants/demoTranscriptions";

describe("exportFormats", () => {
  it("infers format from file extension", () => {
    expect(inferExportFormatFromFileName("witness.txt")).toBe("txt");
    expect(inferExportFormatFromFileName("page.HTML")).toBe("html");
    expect(inferExportFormatFromFileName("leaf.svg")).toBe("svg");
    expect(inferExportFormatFromFileName("scan.png")).toBe("png");
    expect(inferExportFormatFromFileName("photo.jpeg")).toBe("jpeg");
  });

  it("builds default names per format", () => {
    expect(defaultFileNameForFormat("TEXT.ACR.txt", "html")).toBe("TEXT.ACR.html");
  });

  it("appends extension when missing", () => {
    expect(ensureFileNameExtension("TEXT.ACR", "png")).toBe("TEXT.ACR.png");
  });

  it("builds txt, html, and svg payloads", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const ctx = { parsed, sourceText: DEFAULT_DEMO, display: {} };
    expect(buildManuscriptExportPayload("txt", ctx).contents).toContain("{RMK:");
    expect(buildManuscriptExportPayload("html", ctx).contents).toContain("<!DOCTYPE html>");
    expect(buildManuscriptExportPayload("svg", ctx).contents).toContain("<svg");
    expect(mimeTypeForExportFormat("png")).toBe("image/png");
  });
});
