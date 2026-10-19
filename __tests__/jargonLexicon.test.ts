import { canonicalizeJargon } from "../utils/copilot/jargonLexicon";
import { askCopilot } from "../utils/copilot/ask";
import { parseCopilotSample } from "./copilotFixture";

describe("canonicalizeJargon", () => {
  it("maps Iberian concordance / count phrasing to English tokens", () => {
    const a = canonicalizeJargon("cuántas veces aparece dios");
    expect(a.canonical.toLowerCase()).toContain("how many times appears");
    expect(a.replacements.length).toBeGreaterThan(0);

    const b = canonicalizeJargon("onde aparece rey");
    expect(b.canonical.toLowerCase()).toContain("show me where");
  });

  it("normalizes paleographic jargon", () => {
    const r = canonicalizeJargon("listar reclamos y tachaduras");
    expect(r.canonical.toLowerCase()).toMatch(/catchwords/);
    expect(r.canonical.toLowerCase()).toMatch(/scribal deletions/);
  });

  it("prefers multi-word aliases over shorter ones", () => {
    const r = canonicalizeJargon("activar ortografía moderna");
    expect(r.canonical.toLowerCase()).toContain("modern orthography");
  });
});

describe("askCopilot jargon + doActions", () => {
  const parsed = parseCopilotSample();

  it("attaches jargonApplied and taxonomy doActions on routed answers", () => {
    const answer = askCopilot("cuántas veces aparece dios", parsed);
    expect(answer.jargonApplied?.length).toBeGreaterThan(0);
    if (answer.recipeId === "stats.term_frequency") {
      expect(answer.taxonomyId).toBe("analyze:stats:term_frequency");
      expect(answer.doActions).toEqual(expect.arrayContaining(["OPEN_KWIC", "JUMP_FOLIO"]));
    }
  });
});
