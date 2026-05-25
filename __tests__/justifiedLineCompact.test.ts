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
    expect(xml).toContain("<tspan dx=");
    expect(xml).toContain("muyto");
    expect((xml.match(/<tspan /g) ?? []).length).toBe(1);
    expect(xml).not.toMatch(/<tspan[^>]*>m<\/tspan>/);
  });
});
