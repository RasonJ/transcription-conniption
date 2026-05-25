import { extractBalancedBraceBlock, tokenizeFigureBraceBlock } from "../utils/braceBlocks";
import { tokenizeLineStructural } from "../utils/structuralAssembly";

describe("braceBlocks", () => {
  it("extracts nested ILL caption with inner IN marker", () => {
    const line = "{ILL. {IN4.} TRatado da sphera}";
    const block = extractBalancedBraceBlock(line);
    expect(block?.block).toBe(line);
  });

  it("tokenizes {MIN.} {IN3.} SPhera as figure + drop cap + text", () => {
    const tokens = tokenizeLineStructural("{MIN.} {IN3.} SPhera segundo");
    expect(tokens.some((t) => t.type === "figure_anchor" && t.figureType === "MIN")).toBe(true);
    expect(tokens.some((t) => t.type === "drop_initial" && t.value === "S")).toBe(true);
    expect(tokens.some((t) => t.value === "Phera")).toBe(true);
  });

  it("tokenizes historiated ILL block with leading drop cap", () => {
    const tokens = tokenizeFigureBraceBlock("{ILL. {IN4.} TRatado}");
    expect(tokens[0]?.type).toBe("figure_anchor");
    expect(tokens[0]?.figureType).toBe("ILL");
    expect(tokens.some((t) => t.type === "drop_initial" && t.value === "T")).toBe(true);
  });
});
