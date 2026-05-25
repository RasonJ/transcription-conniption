import { buildConcordance, extractWordsFromFlow } from "../utils/concordance";
import { parseHsMsText, tokenizeString } from "../utils/manuscriptParser";

describe("concordance from reconstructed flow", () => {
  it("joins hyphen-split lemmas across line boundaries", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB1.\n1 adela-\n2 ntar al pueblo\n}",
    );
    expect(ast.reconstructedFlow).toContain("adelantar");
    const index = buildConcordance(ast);
    expect(index.adelantar?.count).toBeGreaterThanOrEqual(1);
    expect(index.adela).toBeUndefined();
    expect(index.ntar).toBeUndefined();
  });

  it("extractWordsFromFlow does not split on internal hyphens already joined", () => {
    expect(extractWordsFromFlow("adelantar al pueblo")).toEqual(["adelantar", "al", "pueblo"]);
  });
});

describe("diacritic word units", () => {
  it("matches te~<n>de with tail-expansion diacritic pattern", () => {
    const {
      DIACRITIC_CLUSTER_SOURCE,
      DIACRITIC_WITH_TAIL_EXPANSIONS_SOURCE,
    } = require("../utils/legacyDiacritics");
    expect(new RegExp(DIACRITIC_CLUSTER_SOURCE).test("te~")).toBe(true);
    expect(new RegExp(DIACRITIC_WITH_TAIL_EXPANSIONS_SOURCE).test("te~<n>de")).toBe(true);
  });

  it("tokenizes te~<n>de as one morphological unit", () => {
    const tokens = tokenizeString("te~<n>de");
    const diacriticTokens = tokens.filter((t) => t.type === "text" && t.normalized);
    expect(diacriticTokens).toHaveLength(1);
    expect(diacriticTokens[0]?.raw).toBe("te~<n>de");
    expect(diacriticTokens[0]?.normalized).toMatch(/t.*nde/i);
  });

  it("indexes unified diacritic-expansion words in concordance", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB1.\n1 te~<n>de la casa\n}");
    const index = buildConcordance(ast);
    const lemmaKey = Object.keys(index).find((k) => k.includes("nde") || k.includes("tende"));
    expect(lemmaKey).toBeDefined();
  });
});
