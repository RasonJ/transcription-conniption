import { compileManuscriptTree } from "../utils/compiler";
import { askCopilot } from "../utils/copilot/ask";
import { extractSlots, extractWord } from "../utils/copilot/slots";
import { buildKwicConcordance, countWordOccurrences } from "../utils/copilot/stats";
import { getRecipe } from "../utils/copilot/catalog";
import {
  expandHistoricalVariants,
  historicalVariantMatchKeys,
} from "../utils/modernizedText";

const SAMPLE = `[fol. 1r]
{CB1.
1 a sciencia nam te propria
2 Porque sciẽcia nam he outra
3 qualquer scriptura que nam seja
4 o liuro do doutor sancto
}`;

describe("modern→diplomatic KWIC variant expansion", () => {
  const parsed = compileManuscriptTree(SAMPLE);
  const kwicRecipe = getRecipe("search.kwic")!;

  it("expands não to historical spellings including nam", () => {
    const variants = expandHistoricalVariants("não");
    expect(variants.map((v) => v.toLowerCase())).toEqual(
      expect.arrayContaining(["nam", "nao", "não", "na~o"]),
    );
    const keys = historicalVariantMatchKeys("não");
    expect(keys.has("nam")).toBe(true);
    expect(keys.has("nao")).toBe(true);
  });

  it("extracts word + window from before/after phrasing", () => {
    // normalizeQuery folds accents, so “não” → “nao”; variant expansion still hits nam.
    expect(extractWord("show me the first 5 words before and after não")).toMatch(/^n[aã]o$/i);
    const slots = extractSlots("show me the first 5 words before and after não", kwicRecipe);
    expect(slots.word).toMatch(/^n[aã]o$/i);
    expect(slots.window).toBe(5);
  });

  it("counts nam when querying modern não", () => {
    const occ = countWordOccurrences(parsed, "não");
    expect(occ.count).toBe(3);
  });

  it("builds ±5 KWIC hits keyed by diplomatic nam", () => {
    const hits = buildKwicConcordance(parsed, "não", 5);
    expect(hits.length).toBe(3);
    expect(hits.every((h) => /nam/i.test(h.keyword))).toBe(true);
    expect(hits[0].prefix.split(/\s+/).length).toBeLessThanOrEqual(5);
    expect(hits[0].suffix.split(/\s+/).length).toBeLessThanOrEqual(5);
  });

  it("askCopilot routes modern before/after query to search.kwic with variants", () => {
    const answer = askCopilot("show me the first 5 words before and after não", parsed);
    expect(answer.recipeId).toBe("search.kwic");
    expect(answer.count).toBe(3);
    expect(answer.params?.window).toBe(5);
    expect(answer.headline.toLowerCase()).toMatch(/nam|variant/);
    expect(answer.rows.some((r) => /nam/i.test(r.label + (r.detail ?? "")))).toBe(true);
  });

  it("also expands livro → liuro", () => {
    expect(expandHistoricalVariants("livro")).toEqual(expect.arrayContaining(["liuro", "livro"]));
    expect(countWordOccurrences(parsed, "livro").count).toBe(1);
  });
});
