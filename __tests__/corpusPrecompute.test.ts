import { compileManuscriptTree } from "../utils/compiler";
import {
  buildCorpusTfidf,
  buildLibraryGraph,
  buildPrecompiledFacets,
  computeIdf,
  scoreWitnessTerm,
  type PrecompiledFacets,
} from "../utils/corpusPrecompute";
import { buildLibraryCatalog } from "../utils/libraryCatalog";

const SAMPLE = `{RMK: Pedro Nunes.}
{RMK: Tratado da sphera.}
{RMK: Lisboa | Germão Galharde | 1537.}
[fol. 1r]
{CB1.
{RUB. Capitulo segundo.}
1 {IN3.}Sphera do mundo e circulo equinocial
2 {GL. glosa sobre a sphera}
{CW. fin}}`;

describe("corpusPrecompute", () => {
  it("computes IDF with the batch formula", () => {
    expect(computeIdf(876, 0)).toBeCloseTo(Math.log(876 / 1), 5);
    expect(computeIdf(100, 9)).toBeCloseTo(Math.log(100 / 10), 5);
  });

  it("builds compact facet sidecars with term frequencies", () => {
    const parsed = compileManuscriptTree(SAMPLE);
    const facets = buildPrecompiledFacets(parsed, "TEXT.TRS", { sourceText: SAMPLE });
    expect(facets.format).toBe("hsms-facets/1");
    expect(facets.baseName).toBe("TEXT.TRS");
    expect(facets.wordCount).toBeGreaterThan(0);
    expect(facets.facets.rubrics.length).toBeGreaterThan(0);
    expect(facets.facets.dropInitials.some((d) => d.depth === 3)).toBe(true);
    expect(facets.termFreq.sphera ?? facets.termFreq.circulo).toBeGreaterThan(0);
  });

  it("builds corpus TF-IDF and scores witnesses", () => {
    const tfidf = buildCorpusTfidf([
      { baseName: "TEXT.A", terms: ["sphera", "circulo", "fazer"] },
      { baseName: "TEXT.B", terms: ["fazer", "mundo"] },
      { baseName: "TEXT.C", terms: ["fazer", "livro"] },
    ]);
    expect(tfidf.totalDocuments).toBe(3);
    // Rare "sphera" (df=1) outranks ubiquitous "fazer" (df=3).
    expect(tfidf.idf.sphera).toBeGreaterThan(tfidf.idf.fazer);

    const scoreA = scoreWitnessTerm("sphera", { sphera: 4, fazer: 1 }, tfidf);
    const scoreB = scoreWitnessTerm("sphera", { fazer: 12 }, tfidf);
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it("builds a codicological library graph from catalog + facets", () => {
    const parsed = compileManuscriptTree(SAMPLE);
    const facets = buildPrecompiledFacets(parsed, "TEXT.TRS", { sourceText: SAMPLE });
    const catalog = buildLibraryCatalog(
      [
        {
          id: "TEXT.TRS",
          baseName: "TEXT.TRS",
          sourceFileName: "TEXT.TRS.txt",
          title: "Tratado da sphera",
          author: "Pedro Nunes",
          year: "1537",
          city: "Lisboa",
          printer: "Germão Galharde",
          keywords: "sphera nunes",
          status: "ok",
          exportedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "/out",
    );
    const tfidf = buildCorpusTfidf([{ baseName: "TEXT.TRS", terms: Object.keys(facets.termFreq) }]);
    // Force a mid-rarity term into df so CONTAINS_TERM edges can appear in larger corpora;
    // with a single doc, CONTAINS_TERM is skipped (df min 2). Metadata edges still present.
    const graph = buildLibraryGraph(catalog, [facets], tfidf);
    expect(graph.nodes.some((n) => n.type === "author")).toBe(true);
    expect(graph.nodes.some((n) => n.id.startsWith("AUTHOR."))).toBe(true);
    expect(graph.edges.some((e) => e.rel === "AUTHORED_BY")).toBe(true);
    expect(graph.edges.some((e) => e.rel === "PRINTED_BY")).toBe(true);
    expect(graph.edges.some((e) => e.rel === "PUBLISHED_IN")).toBe(true);
  });
});
