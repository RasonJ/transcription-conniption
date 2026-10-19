import fs from "node:fs";
import path from "node:path";
import type { PrecompiledFacets } from "../utils/corpusPrecompute";
import { seedFacetsIntoGraph, topTermsForManuscript } from "../utils/reasoningGraph";

const FACETS_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "library",
  "facets",
  "1500__auto_02.json",
);

describe("facets → reasoning graph (1500__auto_02)", () => {
  const facets = JSON.parse(fs.readFileSync(FACETS_PATH, "utf8")) as PrecompiledFacets;

  it("lifts manuscript stats and termFreq into nodes/edges", () => {
    const g = seedFacetsIntoGraph(facets, undefined, {
      catalog: {
        title: "1500/auto 02 (Celestina)",
        author: "Fernando de Rojas",
        year: "1500",
        keywords: "celestina",
      },
      topTerms: 40,
      maxHapaxEdges: 20,
    });

    const ms = g.nodes.find((n) => n.id === "MANUSCRIPT:1500__auto_02");
    expect(ms?.type).toBe("Manuscript");
    expect(ms?.attributes.wordCount).toBe(1634);
    expect(ms?.attributes.hapax).toBe(528);
    expect(ms?.attributes.ttr).toBeCloseTo(0.4357, 3);

    expect(g.nodes.some((n) => n.type === "WitnessStats")).toBe(true);
    expect(g.edges.some((e) => e.relation === "has_stats")).toBe(true);
    expect(g.edges.some((e) => e.relation === "contains_term")).toBe(true);
    expect(g.edges.some((e) => e.relation === "uses_block_type")).toBe(true);
    expect(g.edges.some((e) => e.relation === "uses_token_type")).toBe(true);
    expect(g.edges.some((e) => e.relation === "authored")).toBe(true);

    const top = topTermsForManuscript(g, "MANUSCRIPT:1500__auto_02", 5);
    expect(top[0]?.lemma).toBe("que");
    expect(top[0]?.tf).toBe(89);
  });

  it("links hapax terms when present in termFreq", () => {
    const g = seedFacetsIntoGraph(facets, undefined, { topTerms: 10, maxHapaxEdges: 15 });
    const hapaxEdges = g.edges.filter((e) => e.relation === "has_hapax_term");
    expect(hapaxEdges.length).toBeGreaterThan(0);
    expect(hapaxEdges.every((e) => e.properties?.tf === 1)).toBe(true);
  });
});
