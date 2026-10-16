import { askCopilot, runRecipeById } from "../utils/copilot/ask";
import {
  overviewFromPrecompiled,
  runEagerFromPrecompiled,
} from "../utils/copilot/sidecarRecipes";
import {
  executeMcpSidecarTool,
  queryCodicologicalGraph,
  rankFromPostings,
} from "../utils/copilot/mcpSidecarRuntime";
import {
  buildPrecompiledFacets,
  type CorpusTermPostings,
  type CorpusTfidf,
  type LibraryGraph,
} from "../utils/corpusPrecompute";
import {
  clearLibrarySidecarCaches,
  seedCorpusTermPostings,
  seedCorpusTfidf,
  seedLibraryGraph,
  seedPrecompiledFacets,
} from "../utils/librarySidecars";
import { compileManuscriptTree } from "../utils/compiler";

const SAMPLE = `{RMK: Pedro Nunes.}
{RMK: Tratado da sphera.}
[fol. 1r]
{CB1.
{RUB. Capitulo segundo.}
1 {IN3.}Sphera do mundo
2 {GL. glosa sobre a sphera}
3 {LAT. carmen}
{CW. fin}}`;

describe("sidecarRecipes + MCP runtime", () => {
  const parsed = compileManuscriptTree(SAMPLE);
  const pre = buildPrecompiledFacets(parsed, "TEXT.TRS", { sourceText: SAMPLE });

  afterEach(() => {
    clearLibrarySidecarCaches();
  });

  it("builds overview chips from precompiled facets without live FacetIndex", () => {
    const overview = overviewFromPrecompiled(pre);
    expect(overview.some((o) => o.recipeId === "illum.initial_hierarchy")).toBe(true);
    expect(overview.some((o) => o.recipeId === "marg.gloss_vs_addenda")).toBe(true);
  });

  it("answers eager recipes from the sidecar", () => {
    const initials = runEagerFromPrecompiled("illum.initial_hierarchy", pre);
    expect(initials?.count).toBeGreaterThan(0);
    expect(initials?.rows.length).toBeGreaterThan(0);

    const glosses = runEagerFromPrecompiled("marg.gloss_vs_addenda", pre);
    expect(glosses?.count).toBeGreaterThan(0);
  });

  it("askCopilot prefers precompiled facets for eager recipes", () => {
    const answer = askCopilot("distribution of illuminated initials", parsed, {
      precompiledFacets: pre,
      resolveFacets: () => {
        throw new Error("should not rebuild facets for eager sidecar recipe");
      },
    });
    expect(answer.recipeId).toBe("illum.initial_hierarchy");
    expect(answer.headline).toMatch(/precompiled|initial/i);
  });

  it("runRecipeById uses sidecar for glosses", () => {
    const answer = runRecipeById("marg.gloss_vs_addenda", parsed, {
      precompiledFacets: pre,
      resolveFacets: () => {
        throw new Error("sidecar should answer");
      },
    });
    expect(answer?.headline).toMatch(/gloss|precompiled/i);
    expect(answer?.rows.length).toBeGreaterThan(0);
  });

  it("ranks from term postings and queries the library graph", () => {
    const tfidf: CorpusTfidf = {
      format: "hsms-corpus-tfidf/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      totalDocuments: 2,
      idf: { sphera: 1.5, mundo: 0.2 },
      df: { sphera: 1, mundo: 2 },
    };
    const postings: CorpusTermPostings = {
      format: "hsms-corpus-postings/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      totalDocuments: 2,
      postings: {
        sphera: [
          { id: "TEXT.TRS", tf: 4 },
          { id: "TEXT.OTH", tf: 1 },
        ],
      },
    };
    const ranked = rankFromPostings("sphera", postings, tfidf, 5);
    expect(ranked[0]).toMatchObject({ baseName: "TEXT.TRS", tf: 4 });
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);

    const graph: LibraryGraph = {
      format: "hsms-library-graph/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      nodeCount: 3,
      edgeCount: 2,
      nodes: [
        { id: "MS.TEXT.TRS", type: "manuscript", label: "Tratado" },
        { id: "AUTHOR.pedro_nunes", type: "author", label: "Pedro Nunes" },
        { id: "CITY.lisboa", type: "city", label: "Lisboa" },
      ],
      edges: [
        { source: "MS.TEXT.TRS", target: "AUTHOR.pedro_nunes", rel: "AUTHORED_BY" },
        { source: "MS.TEXT.TRS", target: "CITY.lisboa", rel: "PUBLISHED_IN" },
      ],
    };
    const q = queryCodicologicalGraph(graph, {
      entityId: "MS.TEXT.TRS",
      relation: "AUTHORED_BY",
    });
    expect(q.matches).toHaveLength(1);
    expect(q.matches[0].target?.label).toBe("Pedro Nunes");
  });

  it("executeMcpSidecarTool serves get_precompiled_facets from cache", async () => {
    seedPrecompiledFacets(pre);
    const result = await executeMcpSidecarTool("get_precompiled_facets", {
      witnessId: "TEXT.TRS",
    });
    expect(result.ok).toBe(true);
    expect((result.data as { baseName: string }).baseName).toBe("TEXT.TRS");
  });

  it("executeMcpSidecarTool ranks via postings", async () => {
    seedCorpusTfidf({
      format: "hsms-corpus-tfidf/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      totalDocuments: 1,
      idf: { sphera: 2 },
      df: { sphera: 1 },
    });
    seedCorpusTermPostings({
      format: "hsms-corpus-postings/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      totalDocuments: 1,
      postings: { sphera: [{ id: "TEXT.TRS", tf: 3 }] },
    });
    const result = await executeMcpSidecarTool("rank_witnesses_tfidf", {
      term: "sphera",
      topK: 5,
    });
    expect(result.ok).toBe(true);
    const data = result.data as { ranked: Array<{ baseName: string }> };
    expect(data.ranked[0].baseName).toBe("TEXT.TRS");
  });

  it("executeMcpSidecarTool queries graph", async () => {
    seedLibraryGraph({
      format: "hsms-library-graph/1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      nodeCount: 2,
      edgeCount: 1,
      nodes: [
        { id: "MS.A", type: "manuscript", label: "A" },
        { id: "AUTHOR.x", type: "author", label: "X" },
      ],
      edges: [{ source: "MS.A", target: "AUTHOR.x", rel: "AUTHORED_BY" }],
    });
    const result = await executeMcpSidecarTool("query_codicological_graph", {
      relation: "AUTHORED_BY",
      entityId: "MS.A",
    });
    expect(result.ok).toBe(true);
  });
});
