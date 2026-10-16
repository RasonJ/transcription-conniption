import { folioIdFromPageNumber, isPdfSource } from "../utils/pdfPageExtractorTypes";
import { mergeHsmsPages, summarizeLint } from "../services/batchTranscriptionService";

describe("pdfPageExtractor helpers", () => {
  it("maps page numbers to recto/verso folio ids", () => {
    expect(folioIdFromPageNumber(1)).toBe("1r");
    expect(folioIdFromPageNumber(2)).toBe("1v");
    expect(folioIdFromPageNumber(3)).toBe("2r");
    expect(folioIdFromPageNumber(4)).toBe("2v");
    expect(folioIdFromPageNumber(25)).toBe("13r");
  });

  it("detects PDF sources by mime and extension", () => {
    expect(isPdfSource("application/pdf")).toBe(true);
    expect(isPdfSource("TrSph-PNunes-FAX.25.pdf")).toBe(true);
    expect(isPdfSource("image/png", "file:///tmp/leaf.png")).toBe(false);
    expect(isPdfSource(undefined, "cache/scan.PDF")).toBe(true);
  });
});

describe("batchTranscriptionService merge", () => {
  it("joins page payloads with blank lines and strips fences", () => {
    const merged = mergeHsmsPages([
      "```hsms\n[fol. 1r]\n{CB1.\na\n}\n```",
      "[fol. 1v]\n{CB1.\nb\n}",
    ]);
    expect(merged).toContain("[fol. 1r]");
    expect(merged).toContain("[fol. 1v]");
    expect(merged).not.toContain("```");
    expect(merged.split("\n\n").length).toBeGreaterThanOrEqual(2);
  });

  it("summarizes lint on merged text", () => {
    const lint = summarizeLint("[fol. 1r]\n{CB1.\nok\n}");
    expect(typeof lint.isValid).toBe("boolean");
    expect(lint.errorCount).toBeGreaterThanOrEqual(0);
  });
});
