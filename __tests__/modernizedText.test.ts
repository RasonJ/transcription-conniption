import { parseHsMsText } from "../utils/manuscriptParser";
import {
  applyRomanceOrthographyRules,
  expandHistoricalVariants,
  modernizeBlockLine,
  modernizeFolioLines,
  modernizeTokenText,
} from "../utils/modernizedText";

describe("modernizedText", () => {
  it("maps common Portuguese early-modern spellings", () => {
    expect(modernizeTokenText({ type: "text", value: "liuro", raw: "liuro" })).toBe("livro");
    expect(modernizeTokenText({ type: "text", value: "Ho", raw: "Ho" })).toBe("O");
    expect(modernizeTokenText({ type: "text", value: "nam", raw: "nam" })).toBe("não");
    expect(modernizeTokenText({ type: "text", value: "pella", raw: "pella" })).toBe("pela");
  });

  it("applies c' and nasal tilde orthography rules", () => {
    expect(applyRomanceOrthographyRules("fac'o", "PRT")).toBe("faço");
    expect(applyRomanceOrthographyRules("nauegac'a~o", "PRT")).toMatch(/navegaç/i);
  });

  it("keeps drop-cap grapheme attached to the remainder of the word", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB1.\n3 {IN4.} Dzbo bem auenturado\n}");
    const prose = ast.folios[0]?.blocks.find((b) => b.tokens.some((t) => t.type === "drop_initial"));
    expect(prose).toBeDefined();
    const line = modernizeBlockLine(prose!, "PRT");
    expect(line.toLowerCase()).toMatch(/^dzbo\b|^dzbo /);
    expect(line.toLowerCase()).toContain("aventurado");
  });

  it("builds numbered modern folio rows and skips deletions", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB1.\n1 {HD. AO SERENISSIMO}\n2 liuro do doutor\n3 (^riscado) texto\n}",
    );
    const rows = modernizeFolioLines(ast.folios[0]?.blocks ?? [], "PRT");
    expect(rows.some((r) => /livro/i.test(r.modernText))).toBe(true);
    expect(rows.every((r) => !/riscado/i.test(r.modernText))).toBe(true);
  });

  it("modernizes Castilian markers when languageHint is SPN", () => {
    expect(modernizeTokenText({ type: "text", value: "dixo", raw: "dixo" }, "SPN")).toBe("dijo");
    expect(modernizeTokenText({ type: "text", value: "cauallero", raw: "cauallero" }, "SPN")).toBe(
      "caballero",
    );
  });

  it("reverse-expands modern não into diplomatic variants", () => {
    expect(expandHistoricalVariants("não").map((v) => v.toLowerCase())).toEqual(
      expect.arrayContaining(["nam", "nao", "não"]),
    );
  });
});
