import { tokenizeString } from "../utils/hsmsLexer";
import { tokenToSegs } from "../components/svgFacsimile/tokenRendering";
import { normalizeDisplayDiacritics } from "../utils/legacyDiacritics";

describe("grapheme cluster tokenization", () => {
  it("keeps ma~dar as one cohesive text token", () => {
    const tokens = tokenizeString("ma~dar");
    expect(tokens.some((t) => t.type === "otiose_mark")).toBe(false);
    expect(tokens.map((t) => t.normalized ?? t.value).join("")).toBe("mãdar");
  });

  it("binds split ma + ~ via merge pass", () => {
    const tokens = tokenizeString("ma~dar");
    const joined = tokens.map((t) => t.value).join("");
    expect(joined).not.toContain("~");
    expect(joined).toContain("ã");
  });

  it("binds c' as a cedilla grapheme cluster", () => {
    const tokens = tokenizeString("c'on");
    expect(tokens.some((t) => t.type === "otiose_mark")).toBe(false);
    expect(tokens.map((t) => t.normalized ?? t.value).join("")).toMatch(/^ç/);
  });

  it("normalizes n~ to ñ for display", () => {
    expect(normalizeDisplayDiacritics("n~")).toBe("ñ");
    expect(normalizeDisplayDiacritics("c'")).toBe("ç");
  });

  it("renders expansions as raised superscripts when expanded", () => {
    const segs = tokenToSegs(
      { type: "expansion", value: "er", raw: "<er>" },
      "prose",
      {
        showExpanded: true,
        showDeletions: true,
        suppressOtioseMarks: false,
        useNormalizedDiacritics: true,
      },
    );
    expect(segs[0]?.text).toBe("er");
    expect(segs[0]?.super).toBe(true);
    expect(segs[0]?.italic).toBe(true);
  });
});
