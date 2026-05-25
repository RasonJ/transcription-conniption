import { DEFAULT_DEMO } from "../constants/demoTranscriptions";
import { compileManuscriptTree } from "../utils/compiler";
import { exportToLegacyHTML, htmlExportFileName } from "../utils/htmlExport";

describe("htmlExport", () => {
  it("produces parchment palette and folio table structure", () => {
    const ast = compileManuscriptTree(DEFAULT_DEMO);
    const html = exportToLegacyHTML(ast);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("#f4ebd0");
    expect(html).toContain("Tratado");
    expect(html).toContain("Pedro Nunes");
    expect(html).not.toContain("{RMK:");
  });

  it("renders float:left drop initials with depth-based font size", () => {
    const ast = compileManuscriptTree(DEFAULT_DEMO);
    const html = exportToLegacyHTML(ast);

    expect(html).toContain("float: left");
    expect(html).toContain("drop-initial-cap");
    expect(html).toMatch(/font-size: 60px/);
    expect(html).toContain(">S</span>");
  });

  it("wraps expansions in italic tags", () => {
    const ast = compileManuscriptTree(DEFAULT_DEMO);
    const html = exportToLegacyHTML(ast);
    expect(html).toContain("<i>");
    expect(html).toContain("cilicet");
  });

  it("zips {CB2.} rows side-by-side via spatial layout", () => {
    const ast = compileManuscriptTree(
      `[fol. 1r]
{CB2.
1 {RUB. Left heading}
2 left body}
{CB2.
3 {RUB. Right heading}
4 right body}`,
    );
    const html = exportToLegacyHTML(ast);
    expect(html).toContain("column-layout-split");
    expect(html).toContain("Left heading");
    expect(html).toContain("right body");
  });

  it("escapes raw ampersands in token text", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 foo & bar here}`);
    const html = exportToLegacyHTML(ast);
    expect(html).toContain("foo &amp; bar");
  });

  it("derives .html filename from witness name", () => {
    expect(htmlExportFileName("TEXT.ACR.txt")).toBe("TEXT.ACR.html");
    expect(htmlExportFileName(null)).toBe("manuscript.html");
  });
});
