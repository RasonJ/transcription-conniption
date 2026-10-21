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
    expect(svg).toMatchSnapshot();
  });

  it("uses spatial column layout and ornate drop-cap rects", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const svg = exportToSvgDocument(parsed, { sourceText: DEFAULT_DEMO });

    expect(svg).toContain("folio ");
    // Lisboa | Galharde | 1537 is a woodcut initial: field, inner panel, and ornament paths.
    expect(svg).toContain(">S</text>");
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(4);
    expect(svg).toMatch(/<rect[^>]*rx="[1-9][^"]*"[^>]*fill="#[0-9a-fA-F]+"/);
  });

  it("derives woodcut from parsed imprint when source text is omitted", () => {
    const parsed = compileManuscriptTree(DEFAULT_DEMO);
    const svg = exportToSvgDocument(parsed);
    expect(svg).toContain(">S</text>");
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(4);
  });

  it("derives penwork from an MSS shelfmark", () => {
    const source = `{RMK: Anon.}
{RMK: Madrid | BNE | MSS/123}
[fol. 1r]
{CB1.
1 {IN4.} Abcd
}`;
    const svg = exportToSvgDocument(compileManuscriptTree(source));
    expect(svg).toContain(">A</text>");
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(4);
    expect(svg).not.toContain(">S</text>");
  });

  it("renders expansions as superscript-sized glyphs when expanded", () => {
    const parsed = compileManuscriptTree("1 {CB.} L<IBRO> test line.");
    const svg = exportToSvgDocument(parsed, { showExpanded: true });

    expect(svg).not.toContain("⟨");
    expect(svg).toMatch(/font-size="11\.5"/);
  });
});
