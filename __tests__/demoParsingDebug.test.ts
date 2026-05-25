import { DEFAULT_DEMO } from "../constants/demoTranscriptions";
import { compileManuscriptTree } from "../utils/compiler";
import { tokenizeString } from "../utils/hsmsLexer";
import { resolveDiacriticWord } from "../utils/legacyDiacritics";
import { formatRunningHeaderText, normalizeMetadataPlainText } from "../utils/metadataText";

describe("demo philological parsing", () => {
  it("resolves c'o~ compound in anotacoes", () => {
    expect(resolveDiacriticWord("c'o~")).toBe("çõ");
    expect(resolveDiacriticWord("anotac'o~es")).toBe("anotações");
    const tokens = tokenizeString("anotac'o~es");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].normalized).toBe("anotações");
  });

  it("tokenizes L<IBRO> as expansion", () => {
    const tokens = tokenizeString("L<IBRO> DELA SPHERA");
    expect(tokens.filter((t) => t.type === "expansion").map((t) => t.value)).toEqual(["IBRO"]);
    expect(tokens[0]).toMatchObject({ type: "text", value: "L" });
  });

  it("parses demo metadata and heading expansions", () => {
    expect(normalizeMetadataPlainText("anotac'o~es")).toBe("anotações");
    const ast = compileManuscriptTree(DEFAULT_DEMO);
    expect(ast.metadata.title).toMatch(/anotaç/i);
    expect(ast.metadata.title).not.toContain("'");
    expect(ast.metadata.imprint?.printer).toMatch(/Germão/i);
    expect(ast.metadata.imprint?.printer).not.toContain("~");
    const heading = ast.folios[0]?.headings[0] ?? "";
    expect(heading).toBe("L<IBRO> DELA SPHERA");
    expect(formatRunningHeaderText(heading)).toBe("LIBRO DELA SPHERA");
  });
});
