import { tokenizeString } from "../utils/hsmsLexer";
import { resolveDiacriticWord } from "../utils/legacyDiacritics";

describe("tilde nasal clusters in prose", () => {
  it("resolves ma~dar as mãdar", () => {
    expect(resolveDiacriticWord("ma~dar")).toBe("mãdar");
    const tokens = tokenizeString("ma~dar");
    expect(tokens.some((t) => t.type === "otiose_mark")).toBe(false);
    expect(tokens.map((t) => t.normalized ?? t.value).join("")).toBe("mãdar");
  });

  it("resolves algu~a with nasal u~ abbreviation", () => {
    expect(resolveDiacriticWord("algu~a")).toBe("alguna");
    const tokens = tokenizeString("algu~a");
    expect(tokens.some((t) => t.type === "otiose_mark")).toBe(false);
    expect(tokens.map((t) => t.normalized ?? t.value).join("")).toBe("alguna");
  });

  it("resolves cumpra~ and inteirame~te fragments", () => {
    expect(resolveDiacriticWord("cumpra~")).toBe("cumprã");
    expect(resolveDiacriticWord("jnteirame~te")).toBe("jnteiramẽte");
    expect(tokenizeString("cumpra~").some((t) => t.type === "otiose_mark")).toBe(false);
  });
});
