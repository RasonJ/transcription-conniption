import { HSMS_DIACRITIC_MAP } from "../utils/generated/hsmsDiacriticMap";
import { resolveDiacriticWord, resolveLegacyDiacritic } from "../utils/legacyDiacritics";

describe("HSMS diacritic map (generated)", () => {
  it("includes legacy cedilla and tilde entries", () => {
    expect(HSMS_DIACRITIC_MAP["c'"]).toBe("ç");
    expect(HSMS_DIACRITIC_MAP["n@~"]).toBe("ñ");
    expect(HSMS_DIACRITIC_MAP["e@~"]).toBe("ẽ");
  });

  it("resolves interleaved expansion inside cluster", () => {
    expect(resolveLegacyDiacritic("c<r>on@~")).toContain("r");
  });

  it("resolves te~<n>de as one word unit", () => {
    expect(resolveDiacriticWord("te~<n>de")).toMatch(/t[êeẽ]nde/i);
  });

  it("resolves Portuguese c'o~ compounds", () => {
    expect(resolveDiacriticWord("c'o~")).toBe("çõ");
    expect(resolveDiacriticWord("anotac'o~es")).toBe("anotações");
  });

  it("resolves corpus name abbreviations", () => {
    expect(resolveDiacriticWord("P@'")).toBe("Pedro");
    expect(resolveDiacriticWord("q.")).toBe("que");
  });
});
