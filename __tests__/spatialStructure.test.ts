import {
  kwicFromLemma,
  linesIndentedByDropInitial,
  seedFromWitness,
  seedSpatialStructure,
  unstitchHyphenatedWords,
} from "../utils/reasoningGraph";
import { parseCopilotSample } from "./copilotFixture";

describe("spatial / physical reasoning layer", () => {
  const parsed = parseCopilotSample();

  it("seeds Folio → Column → Block containment with next_folio", () => {
    const g = seedFromWitness(parsed, { witnessId: "W1", spatial: "shallow" });
    expect(g.nodes.some((n) => n.type === "Folio")).toBe(true);
    expect(g.nodes.some((n) => n.type === "Column")).toBe(true);
    expect(g.nodes.some((n) => n.type === "Block")).toBe(true);
    expect(g.edges.some((e) => e.relation === "has_folio")).toBe(true);
    expect(g.edges.some((e) => e.relation === "has_column")).toBe(true);
    expect(g.edges.some((e) => e.relation === "contains_block")).toBe(true);
    expect(g.edges.some((e) => e.relation === "next_folio")).toBe(true);

    const folio = g.nodes.find((n) => n.id === "FOLIO:1r");
    expect(folio?.attributes.side).toBe("recto");
    expect(folio?.attributes.sequenceIndex).toBe(0);
  });

  it("deep mode emits Token / Line / lemma / next_token chains", () => {
    const g = seedFromWitness(parsed, {
      witnessId: "W1",
      spatial: "deep",
      maxTokensPerFolio: 80,
    });
    expect(g.nodes.some((n) => n.type === "Line")).toBe(true);
    expect(g.nodes.some((n) => n.type === "Token")).toBe(true);
    expect(g.nodes.some((n) => n.type === "LemmaNode")).toBe(true);
    expect(g.edges.some((e) => e.relation === "contains_token")).toBe(true);
    expect(g.edges.some((e) => e.relation === "next_token")).toBe(true);
    expect(g.edges.some((e) => e.relation === "maps_to_lemma")).toBe(true);
  });

  it("supports hyphen unstitch and KWIC helpers", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1", spatial: false });
    g = seedSpatialStructure(g, parsed, { manuscriptId: "MANUSCRIPT:W1", mode: "deep", maxTokensPerFolio: 120 });

    // Helpers should not throw even if sample has no hyphens
    expect(() => unstitchHyphenatedWords(g)).not.toThrow();
    expect(() => linesIndentedByDropInitial(g, "A")).not.toThrow();

    const lemma = g.nodes.find((n) => n.type === "LemmaNode");
    if (lemma) {
      const kwic = kwicFromLemma(g, String(lemma.attributes.lemma), 3);
      expect(kwic.length).toBeGreaterThan(0);
      expect(kwic[0]!.hit.length).toBeGreaterThan(0);
    }
  });

  it("enriches Manuscript with physical bibliographic fields", () => {
    const g = seedFromWitness(parsed, { witnessId: "W1" });
    const ms = g.nodes.find((n) => n.type === "Manuscript")!;
    expect(ms.attributes.repository ?? ms.attributes.city ?? ms.attributes.language).toBeTruthy();
    expect(ms.attributes.id).toBe("MANUSCRIPT:W1");
  });
});
