import { compileManuscriptTree } from "../utils/compiler";
import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { askCopilot } from "../utils/copilot/ask";
import { ngrams, termFrequency, vocabDensity } from "../utils/copilot/executors/voyant";

const SAMPLE = `{RMK: Test witness.}
[fol. 1r]
{CB1.
1 Sphera do mundo e sphera do ceo
2 o mundo e a terra e o mundo
}
[fol. 1v]
{CB1.
3 novamente o mundo outra vez
}`;

describe("Voyant-style corpus recipes", () => {
  const parsed = compileManuscriptTree(SAMPLE);
  const facets = buildFacetIndex(parsed);

  it("ranks term frequencies", () => {
    const result = termFrequency(facets, parsed);
    expect(result.count).toBeGreaterThan(0);
    expect(result.breakdown?.length).toBeGreaterThan(0);
    expect(result.headline).toMatch(/term|types|tokens/i);
  });

  it("extracts bigrams", () => {
    const result = ngrams(facets, parsed, 2);
    expect(result.count).toBeGreaterThan(0);
    expect(result.rows[0]?.detail?.includes(" ")).toBe(true);
  });

  it("reports vocabulary density", () => {
    const result = vocabDensity(facets, parsed);
    expect(result.breakdown?.some((b) => b.label === "hapax")).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("routes Copilot triggers to the new recipes", () => {
    const freq = askCopilot("show word frequency distribution", parsed);
    expect(freq.recipeId).toBe("corpus.term_frequency");

    const dens = askCopilot("analyze vocabulary density", parsed);
    expect(dens.recipeId).toBe("corpus.vocab_density");

    const grams = askCopilot("extract n-grams", parsed);
    expect(grams.recipeId).toBe("corpus.ngrams");
    expect(grams.headline).toMatch(/gram/i);
  });
});
