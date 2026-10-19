import { compileManuscriptTree } from "../utils/compiler";
import { askCopilot } from "../utils/copilot/ask";
import { extractWord } from "../utils/copilot/slots";
import {
  buildKwicConcordance,
  countWordOccurrences,
} from "../utils/copilot/stats";

const SAMPLE = `[fol. 1r]
{CB1.
1 muito excelente Principe que os conceptos
2 & pella mesma razam a sciencia nam se
3 muito excelente & muito claro
}
[fol. 1v]
{CB1.
4 outra vez muito
}`;

describe("word count & KWIC copilot path", () => {
  const parsed = compileManuscriptTree(SAMPLE);

  it("extracts the target word from count / where-appears phrasing", () => {
    expect(extractWord("how many times is muito in this")).toBe("muito");
    expect(extractWord("count occurrences of muito")).toBe("muito");
    expect(extractWord("show me where muito appears")).toBe("muito");
    expect(extractWord('kwic for "muito"')).toBe("muito");
  });

  it("counts occurrences with per-folio breakdown", () => {
    const occ = countWordOccurrences(parsed, "muito");
    expect(occ.count).toBe(4);
    expect(occ.folioCount).toBe(2);
    expect(occ.byFolio["1r"]).toBe(3);
    expect(occ.byFolio["1v"]).toBe(1);
  });

  it("builds KWIC matches for the target word", () => {
    const hits = buildKwicConcordance(parsed, "muito", 3);
    expect(hits.length).toBe(4);
    expect(hits[0].keyword.toLowerCase()).toContain("muito");
    expect(hits.some((h) => h.folioId === "1v")).toBe(true);
  });

  it("routes count questions to stats.term_frequency", () => {
    const answer = askCopilot("how many times is muito in this", parsed);
    expect(answer.recipeId).toBe("stats.term_frequency");
    expect(answer.count).toBe(4);
    expect(answer.params?.word).toBe("muito");
    expect(answer.breakdown?.length).toBe(2);
  });

  it("routes KWIC questions to search.kwic", () => {
    const answer = askCopilot("show me where muito appears", parsed);
    expect(answer.recipeId).toBe("search.kwic");
    expect(answer.count).toBe(4);
    expect(answer.rows.length).toBeGreaterThan(0);
  });
});
