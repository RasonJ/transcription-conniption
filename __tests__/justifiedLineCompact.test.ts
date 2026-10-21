import { JUSTIFY_MAX_GAP } from "../components/svgFacsimile/glyphMetrics";
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
    expect(dx).toBeTruthy();
    const text = "muyto circum";
    const vals = dx![1].split(/\s+/).map(Number);
    expect(vals).toHaveLength(text.length);
    expect(vals.every((v) => v >= 0 && v <= JUSTIFY_MAX_GAP)).toBe(true);
    vals.forEach((v, i) => {
      if (text[i] !== " ") expect(v).toBe(0);
    });
    expect(vals.some((v) => v > 0)).toBe(true);
  });
});
