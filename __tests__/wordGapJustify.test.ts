import { DOMParser } from "@xmldom/xmldom";
import {
  JUSTIFY_MAX_GAP,
  SUPER_WIDTH_SCALE,
  countWordGaps,
  lineFitsJustifyCap,
  segsLineWidth,
  wordGapExtra,
} from "../components/svgFacsimile/glyphMetrics";
import { renderJustifiedSvgLine } from "../components/svgFacsimile/justifiedSvgLine";
import { PROSE_FILL, seg } from "../components/svgFacsimile/tokenRendering";

function svgTspans(xml: string): Element[] {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${xml}</svg>`,
    "text/xml",
  );
  const nodes = doc.getElementsByTagName("tspan");
  const out: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes.item(i);
    if (node) out.push(node);
  }
  return out;
}
describe("word-gap justification", () => {
  it("measures superscript expansions at 80% of the segment font size", () => {
    const base = [seg({ text: "ue", fill: PROSE_FILL, fs: 16 })];
    const raised = [seg({ text: "ue", fill: PROSE_FILL, fs: 16, super: true })];
    expect(segsLineWidth(raised)).toBeCloseTo(segsLineWidth(base) * SUPER_WIDTH_SCALE);
  });

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
    const extra = wordGapExtra(segs, natural + JUSTIFY_MAX_GAP * 4, false, false);
    expect(extra).toBe(JUSTIFY_MAX_GAP);
  });

  it("lets a normal prose line reach the column when the gap stays within the cap", () => {
    const segs = [
      seg({ text: "Phera", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "segundo", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "Euclides", fill: PROSE_FILL }),
    ];
    const natural = segsLineWidth(segs);
    const extra = wordGapExtra(segs, natural + 20, false, false);
    expect(extra).toBeCloseTo(10);
    expect(extra).toBeGreaterThan(6);
  });

  it("keeps CSS justification off for last lines, headings, and sparse gaps", () => {
    const segs = [
      seg({ text: "ho", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "diametro", fill: PROSE_FILL }),
    ];
    const natural = segsLineWidth(segs);
    expect(lineFitsJustifyCap(segs, natural + 10, false, false)).toBe(true);
    expect(lineFitsJustifyCap(segs, natural + 10, true, false)).toBe(false);
    expect(lineFitsJustifyCap(segs, natural + 10, false, true)).toBe(false);
    expect(lineFitsJustifyCap(segs, natural + JUSTIFY_MAX_GAP * 4, false, false)).toBe(false);
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
    const tspans = svgTspans(xml);
    expect(tspans).toHaveLength(1);
    expect(tspans[0]?.textContent).toContain("muyto");
    expect(tspans[0]?.textContent).toContain("circum");
    const dx = tspans[0]?.getAttribute("dx");
    expect(dx).toBeTruthy();
    const dxVals = dx!.split(/\s+/).map(Number);
    expect(dxVals.every((v) => v >= 0 && v <= JUSTIFY_MAX_GAP)).toBe(true);
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
    const tspans = svgTspans(xml);
    expect(tspans[0]?.textContent).toContain("tas.");
    expect(tspans[0]?.hasAttribute("dx")).toBe(false);
  });
});
