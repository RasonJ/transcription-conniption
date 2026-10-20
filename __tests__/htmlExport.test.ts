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

  it("renders drop initials from the shared initial scene", () => {
    const ast = compileManuscriptTree(DEFAULT_DEMO);
    const html = exportToLegacyHTML(ast);

    expect(html).toContain("float:left");
    expect(html).toContain("drop-initial-cap");
    expect(html).toContain("<svg");
    expect(html).toContain(">S</text>");
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

  it("escapes raw ampersands when MUFI glyphs are off", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 foo & bar here}`);
    const html = exportToLegacyHTML(ast, { useMufiGlyphs: false });
    expect(html).toContain("foo &amp; bar");
  });

  it("maps Tironian et via MUFI glyphs by default", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 foo & bar here}`);
    const html = exportToLegacyHTML(ast);
    expect(html).toContain("foo ⁊ bar");
    expect(html).not.toContain("foo &amp; bar");
  });

  it("can prefer decomposed MUFI forms over PUA", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 c'ielo}`);
    const pua = exportToLegacyHTML(ast, {
      useMufiGlyphs: true,
      usePuaFont: true,
      useNormalizedDiacritics: false,
    });
    const decomposed = exportToLegacyHTML(ast, {
      useMufiGlyphs: true,
      usePuaFont: false,
      useNormalizedDiacritics: false,
    });
    expect(pua).toContain("çielo");
    expect(decomposed).toContain("c\u0327ielo");
  });

  it("places line numbers in a left gutter outside copyable body text", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 first line\n2 second line}`);
    const html = exportToLegacyHTML(ast);
    expect(html).toContain('class="left-line-gutter"');
    expect(html).toContain('class="gutter-line-num"');
    expect(html).toContain("user-select: none");
    expect(html).toMatch(/gutter-line-num">1</);
    expect(html).toMatch(/gutter-line-num">2</);
    expect(html).toContain("first line");
  });

  it("can hide the line-number gutter", () => {
    const ast = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 first line}`);
    const html = exportToLegacyHTML(ast, { showLineNumbers: false });
    expect(html).not.toContain('class="left-line-gutter"');
    expect(html).toContain("first line");
  });

  it("derives .html filename from witness name", () => {
    expect(htmlExportFileName("TEXT.ACR.txt")).toBe("TEXT.ACR.html");
    expect(htmlExportFileName(null)).toBe("manuscript.html");
  });
});
