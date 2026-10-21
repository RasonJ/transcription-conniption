import { segsLineWidth } from "../components/svgFacsimile/glyphMetrics";
import {
  applyProminenceToSegs,
  HIT_HIGHLIGHT_FILL,
  PROSE_FILL,
  SALIENT_CONTEXT_FILL,
  seg,
} from "../components/svgFacsimile/tokenRendering";

describe("salient term prominence", () => {
  const idf = { "es:castilla": 6.2, "es:de": 1.1 };

  it("recolors an exact hit and a rare neighbor without changing weight or size", () => {
    const line = [
      seg({ text: "Reyna", fill: PROSE_FILL, bold: false, fs: 16 }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "de", fill: PROSE_FILL }),
      seg({ text: " ", fill: PROSE_FILL }),
      seg({ text: "castilla", fill: PROSE_FILL }),
    ];
    const styled = applyProminenceToSegs(line, "reyna", idf, "es");
    expect(styled[0]?.fill).toBe(HIT_HIGHLIGHT_FILL);
    expect(styled[0]?.bold).toBe(false);
    expect(styled[0]?.fs).toBe(16);
    expect(styled[2]?.fill).toBe(PROSE_FILL);
    expect(styled[4]?.fill).toBe(SALIENT_CONTEXT_FILL);
    expect(styled[4]?.bold).toBe(false);
    expect(segsLineWidth(styled)).toBe(segsLineWidth(line));
  });

  it("leaves words at the IDF boundary uncolored", () => {
    const line = [seg({ text: "ley", fill: PROSE_FILL })];
    const styled = applyProminenceToSegs(line, "", { "es:ley": 5 }, "es");
    expect(styled[0]?.fill).toBe(PROSE_FILL);
  });
});
