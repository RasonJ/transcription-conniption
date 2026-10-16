import { countWordGaps, segsLineWidth, wordGapExtra } from "../components/svgFacsimile/glyphMetrics";
import { renderJustifiedSvgLine } from "../components/svgFacsimile/justifiedSvgLine";
import { PROSE_FILL, seg } from "../components/svgFacsimile/tokenRendering";

describe("word-gap justification", () => {
  it("does not stretch lines that have no word spaces", () => {
    const segs = [seg({ text: "tas.", fill: PROSE_FILL })];
    expect(countWordGaps(segs)).toBe(0);
    expect(wordGapExtra(segs, 600, false, false)).toBe(0);
  });

  it("caps per-gap expansion so short drop-cap lines cannot letter-space", () => {
    const segs = [
      seg({ text: "Phera", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "segundo", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "Euclides", fill: PROSE_FILL }),
    ];
    const natural = segsLineWidth(segs);
    const extra = wordGapExtra(segs, 620, false, false);
    expect(natural).toBeLessThan(620);
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThanOrEqual(6);
    // Character-level rivers would be tens of px; word-gap stays modest.
    expect(extra).toBeLessThan(10);
  });

  it("skips expansion on last lines and when skipJustify is set", () => {
    const segs = [
      seg({ text: "ho", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "diametro", fill: PROSE_FILL }),
    ];
    expect(wordGapExtra(segs, 600, true, false)).toBe(0);
    expect(wordGapExtra(segs, 600, false, true)).toBe(0);
  });

  it("SVG export adds extra advance only on spaces", () => {
    const xml = renderJustifiedSvgLine(
      [
        seg({ text: "muyto", fill: PROSE_FILL }),
        seg({ text: " ", fill: PROSE_FILL }),
        seg({ text: "circum", fill: PROSE_FILL }),
      ],
      40,
      44,
      400,
      false,
      false,
    );
    expect(xml).toContain("muyto");
    expect(xml).toContain("circum");
    // Still one coalesced tspan, not per-glyph elements.
    expect((xml.match(/<tspan /g) ?? []).length).toBe(1);
    // dx must be space-only extras — never full glyph widths (those double-advance).
    const dxMatch = xml.match(/dx="([^"]+)"/);
    expect(dxMatch).toBeTruthy();
    const dxVals = dxMatch![1].split(/\s+/).map(Number);
    expect(dxVals.every((v) => v >= 0 && v <= 6)).toBe(true);
    expect(dxVals.some((v) => v > 0)).toBe(true);
  });

  it("SVG export omits dx when the line is not justified", () => {
    const xml = renderJustifiedSvgLine(
      [seg({ text: "tas.", fill: PROSE_FILL })],
      40,
      44,
      400,
      false,
      false,
    );
    expect(xml).toContain("tas.");
    expect(xml).not.toMatch(/\sdx="/);
  });
});
