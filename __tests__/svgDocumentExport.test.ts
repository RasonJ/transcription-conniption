import { DEFAULT_DEMO } from "../constants/demoTranscriptions";
import { compileManuscriptTree } from "../utils/compiler";
import { exportToSvgDocument } from "../utils/svgDocumentExport";

describe("svgDocumentExport", () => {
  it("emits per-character text nodes with explicit x coordinates", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const svg = exportToSvgDocument(parsed);

    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain(`width="800"`);
    expect(svg).toContain(`fill="#f4ebd0"`);
    expect(svg).toMatch(/<text x="[\d.]+" y="[\d.]+"/);
    expect(svg).not.toContain('text-anchor="justify"');
  });

  it("uses spatial column layout and ornate drop-cap rects", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const svg = exportToSvgDocument(parsed);

    expect(svg).toContain("folio ");
    expect(svg).toMatch(/<rect[^>]+rx="/);
  });

  it("renders expansions as superscript-sized glyphs when expanded", () => {
    const parsed = compileManuscriptTree("1 {CB.} L<IBRO> test line.");
    const svg = exportToSvgDocument(parsed, { showExpanded: true });

    expect(svg).not.toContain("⟨");
    expect(svg).toMatch(/font-size="11\.5"/);
  });
});
