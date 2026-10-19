import { compileManuscriptTree } from "../utils/compiler";
import { askCopilot } from "../utils/copilot/ask";
import { RECIPES } from "../utils/copilot/catalog";

const SAMPLE = `{RMK: Pedro Nunes. Tratado da Sphera. Lisboa: Germão Galharde, 1537. BN Lisboa Res. 234.}
[fol. 1r]
{CB1.
1 muito excelente Principe
}
[fol. 1v]
{CB1.
2 outra vez
}
{CW. outra}
`;

/** Representative lightweight matrix → local recipe (no Azure). */
const ROUTES: Array<{ q: string; recipeId: string }> = [
  { q: "how many times is muito in this", recipeId: "stats.term_frequency" },
  { q: "show me where muito appears", recipeId: "search.kwic" },
  { q: "calculate type token ratio", recipeId: "stats.ttr_hapax" },
  { q: "highlight all tildes used for nasal suspensions", recipeId: "abbr.nasal_tilde_vs_geminate" },
  { q: "show all superscript vowel contractions", recipeId: "abbr.superscripts" },
  { q: "locate all catchwords at the foot of pages", recipeId: "codex.catchwords" },
  { q: "what is the shelfmark for this manuscript", recipeId: "meta.witness" },
  { q: "toggle modern orthography for this page", recipeId: "ui.control" },
  { q: "export current view to tei xml", recipeId: "ui.control" },
  { q: "find the next illuminated drop cap", recipeId: "illum.initial_hierarchy" },
  { q: "highlight all scribal expunctions", recipeId: "corr.deletions_scribal_vs_editorial" },
  { q: "show all contemporary marginal glosses", recipeId: "marg.gloss_vs_addenda" },
];

describe("lightweight intent matrix → local recipes", () => {
  const parsed = compileManuscriptTree(SAMPLE);

  it("registers meta.witness, codex.catchwords, and ui.control", () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    expect(ids.has("meta.witness")).toBe(true);
    expect(ids.has("codex.catchwords")).toBe(true);
    expect(ids.has("ui.control")).toBe(true);
    expect(RECIPES.length).toBeGreaterThanOrEqual(61);
  });

  it.each(ROUTES)("routes “$q” → $recipeId", ({ q, recipeId }) => {
    const answer = askCopilot(q, parsed);
    expect(answer.recipeId).toBe(recipeId);
    expect(answer.lowConfidence).not.toBe(true);
  });

  it("returns catchwords and metadata locally", () => {
    const cw = askCopilot("list catchwords in this witness", parsed);
    expect(cw.recipeId).toBe("codex.catchwords");
    expect(cw.count).toBe(1);

    const meta = askCopilot("which library holds the physical copy", parsed);
    expect(meta.recipeId).toBe("meta.witness");
    expect(meta.count).toBeGreaterThan(0);
  });
});
