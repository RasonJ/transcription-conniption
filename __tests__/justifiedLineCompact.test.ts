import { renderJustifiedSvgLine } from "../components/svgFacsimile/justifiedSvgLine";
import { seg } from "../components/svgFacsimile/tokenRendering";
import { PROSE_FILL } from "../components/svgFacsimile/tokenRendering";

describe("compact justified line export", () => {
  it("emits one tspan per segment with dx arrays, not per character", () => {
    const xml = renderJustifiedSvgLine(
      [
        seg({ text: "muyto", fill: PROSE_FILL }),
        seg({ text: " ", fill: PROSE_FILL }),
        seg({ text: "circum", fill: PROSE_FILL }),
      ],
      40,
      44,
      200,
      false,
      false,
    );
    expect(xml).toContain("muyto");
    expect((xml.match(/<tspan /g) ?? []).length).toBe(1);
    expect(xml).not.toMatch(/<tspan[^>]*>m<\/tspan>/);
    // Justification extras only — values must stay in the per-gap cap, not glyph widths.
    const dx = xml.match(/dx="([^"]+)"/);
    if (dx) {
      const vals = dx[1].split(/\s+/).map(Number);
      expect(vals.every((v) => v <= 6)).toBe(true);
    }
  });
});
