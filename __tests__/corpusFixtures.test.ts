import { buildConcordance } from "../utils/concordance";
import { compileManuscriptTree, parseComplexFolio } from "../utils/compiler";
import { parseHsMsText } from "../utils/manuscriptParser";

/** OSTA / corporate corpus regression fixtures (inline excerpts). */
describe("corpus fixture regressions", () => {
  it("TEXT.YND-style nested RUB + LAT on one line", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB2.\n12 {RUB. Ui[toriano] {LAT. Circundederunt me}}\n}",
    );
    const rubric = ast.folios[0]?.blocks.find((b) => b.type === "rubric");
    expect(rubric).toBeDefined();
    expect(rubric?.tokens.some((t) => t.envLayers?.some((l) => l.code === "LAT"))).toBe(true);
  });

  it("TEXT.ORS-style folio with implicit column track via parseComplexFolio", () => {
    expect(parseComplexFolio("[fol. 42rA]")).toEqual({
      id: "42rA",
      injectedColumns: 2,
    });
  });

  it("TEXT.TPS / YEN-style scribal punctuation in running prose", () => {
    const ast = compileManuscriptTree("[fol. 1r]\n{CB1.\n1 aldehuela($.)[.] llamada betlen\n}");
    const tokens = ast.folios[0]?.blocks.flatMap((b) => b.tokens) ?? [];
    expect(tokens.some((t) => t.type === "scribal_punctuation")).toBe(true);
    const index = buildConcordance(ast);
    expect(index.aldehuela?.count ?? index.llamada?.count).toBeGreaterThanOrEqual(1);
  });

  it("TEXT.CDP-style dual column folio blocks", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB2.\n1 En el nonbre de Dios\n}");
    expect(ast.folios[0]?.blocks[0]?.columns).toBe(2);
  });
});
