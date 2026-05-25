import { renderNormalizedText } from "../utils/normalizedText";
import type { Token } from "../constants/manuscript";

describe("renderNormalizedText", () => {
  it("joins word-internal expansions without spurious spaces", () => {
    const tokens: Token[] = [
      { type: "text", value: "d", raw: "d" },
      { type: "expansion", value: "ic", raw: "<ic>" },
      { type: "text", value: "to", raw: "to" },
    ];
    expect(renderNormalizedText(tokens)).toBe("dicto");
  });

  it("strips legacy @ diacritic marks from normalized text tokens", () => {
    const tokens: Token[] = [
      { type: "text", value: "c", raw: "c" },
      { type: "expansion", value: "r", raw: "<r>" },
      { type: "text", value: "on", raw: "on" },
      { type: "text", value: "ica", raw: "ica", normalized: "ica" },
    ];
    expect(renderNormalizedText(tokens)).not.toContain("@");
  });

  it("renders figure and blank placeholders for synoptic reading", () => {
    const tokens: Token[] = [
      { type: "text", value: "See", raw: "See" },
      { type: "figure_anchor", value: "Astrolabe", raw: "{ILL. Astrolabe}", figureId: "x", figureType: "ILL" },
      { type: "blank_space", value: "blank", raw: "{BLNK.}" },
    ];
    const out = renderNormalizedText(tokens);
    expect(out).toContain("[Astrolabe]");
    expect(out).toContain("[...]");
  });
});
