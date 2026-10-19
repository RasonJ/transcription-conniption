import { blockToSegs } from "@/components/svgFacsimile/tokenRendering";
import type { ManuscriptBlock, Token } from "@/constants/manuscript";
import {
  convertHsmsToMufiGlyphs,
  lookupPaleographicMufi,
  MUFI_PALEOGRAPHIC_MAP,
} from "@/utils/mufiCharacterMap";

function tok(partial: Partial<Token> & Pick<Token, "type" | "value" | "raw">): Token {
  return partial as Token;
}

describe("MUFI paleographic map (Tier 2)", () => {
  it("maps c' / n~ / & to Unicode or PUA glyphs", () => {
    expect(convertHsmsToMufiGlyphs("c'ielo", true)).toBe("çielo");
    expect(convertHsmsToMufiGlyphs("sen~or", true)).toBe("señor");
    expect(convertHsmsToMufiGlyphs("rey & reyna", true)).toContain("⁊");
    expect(lookupPaleographicMufi("q<ue>")?.codePoint).toBe("E681");
  });

  it("uses decomposed fallback when usePua is false", () => {
    expect(convertHsmsToMufiGlyphs("c'", false)).toBe("c\u0327");
    expect(convertHsmsToMufiGlyphs("q<ue>", false)).toBe("q\u0304");
  });

  it("prefers longer patterns (p<ar>a before shorter)", () => {
    expect(convertHsmsToMufiGlyphs("p<ar>a", true)).toBe("ꝑa");
    expect(MUFI_PALEOGRAPHIC_MAP["p<er>"]?.char).toBe("ꝑ");
  });

  it("blockToSegs coalesces q + <ue> into one MUFI glyph", () => {
    const block: ManuscriptBlock = {
      type: "prose",
      columns: 1,
      tokens: [
        tok({ type: "text", value: "q", raw: "q" }),
        tok({ type: "expansion", value: "ue", raw: "<ue>" }),
      ],
    };
    const segs = blockToSegs(block, {
      showExpanded: true,
      showDeletions: true,
      suppressOtioseMarks: false,
      useNormalizedDiacritics: false,
      useMufiGraphemes: true,
      usePuaFont: true,
    });
    expect(segs.map((s) => s.text).join("")).toBe("\uE681");
  });

  it("leaves HSMS ASCII untouched when MUFI display is off", () => {
    expect(convertHsmsToMufiGlyphs("q<ue>", true)).not.toBe("q<ue>");
    const block: ManuscriptBlock = {
      type: "prose",
      columns: 1,
      tokens: [
        tok({ type: "text", value: "q", raw: "q" }),
        tok({ type: "expansion", value: "ue", raw: "<ue>" }),
      ],
    };
    const segs = blockToSegs(block, {
      showExpanded: true,
      showDeletions: true,
      suppressOtioseMarks: false,
      useNormalizedDiacritics: false,
      useMufiGraphemes: false,
    });
    expect(segs.some((s) => s.text === "ue")).toBe(true);
  });
});
