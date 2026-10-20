import {
  scoreWitnessTerm,
  type CorpusTermPostings,
  type CorpusTfidf,
  type LibraryGraph,
  type PrecompiledFacets,
} from "@/utils/corpusPrecompute";
import {
  loadCorpusTermPostings,
  loadCorpusTfidf,
  loadLibraryGraph,
  loadPrecompiledFacets,
} from "@/utils/librarySidecars";
import { isAzureAgentConfigured } from "@/services/azureAgentConfig";
import { convertHtrToHsms } from "@/utils/htrConverter";
import {
  auditHsmsProoferIncidents,
  formatProoferTsv,
  prooferIncidentsToRows,
} from "@/utils/prooferIncidents";
import { normalizeWord } from "./stats";

export type McpSidecarToolResult = {
  ok: boolean;
  tool: string;
  elapsedMs: number;
  data?: unknown;
  error?: string;
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Rank witnesses by TF×IDF from inverted postings + global IDF. */
export function rankFromPostings(
  term: string,
  postings: CorpusTermPostings,
  tfidf: CorpusTfidf,
  topK = 10,
): Array<{ baseName: string; score: number; tf: number; idf: number }> {
  const normalized = normalizeWord(term);
  const idf = tfidf.idf[normalized] ?? 0;
  const hits = postings.postings[normalized] ?? [];
  return hits
    .map((h) => ({
      baseName: h.id,
      tf: h.tf,
      idf,
      score: Number((h.tf * idf).toFixed(6)),
    }))
    .sort((a, b) => b.score - a.score || a.baseName.localeCompare(b.baseName))
    .slice(0, Math.max(1, Math.min(50, topK)));
}

/** Rank witnesses by TF×IDF using a loaded facets map + global IDF table. */
export function rankWitnessesTfidf(
  term: string,
  facetsByBase: Map<string, PrecompiledFacets>,
  tfidf: CorpusTfidf,
  topK = 10,
): Array<{ baseName: string; score: number; tf: number; idf: number }> {
  const normalized = normalizeWord(term);
  const idf = tfidf.idf[normalized] ?? 0;
  const ranked: Array<{ baseName: string; score: number; tf: number; idf: number }> = [];

  facetsByBase.forEach((facets, baseName) => {
    const tf = facets.termFreq[normalized] ?? 0;
    if (tf <= 0) return;
    ranked.push({
      baseName,
      tf,
      idf,
      score: Number(scoreWitnessTerm(normalized, facets.termFreq, tfidf).toFixed(6)),
    });
  });

  ranked.sort((a, b) => b.score - a.score || a.baseName.localeCompare(b.baseName));
  return ranked.slice(0, Math.max(1, Math.min(50, topK)));
}

export function queryCodicologicalGraph(
  graph: LibraryGraph,
  options: {
    entityId?: string;
    relation: LibraryGraph["edges"][number]["rel"];
    neighborType?: LibraryGraph["nodes"][number]["type"];
  },
): {
  relation: string;
  matches: Array<{
    edge: LibraryGraph["edges"][number];
    source: LibraryGraph["nodes"][number] | undefined;
    target: LibraryGraph["nodes"][number] | undefined;
  }>;
} {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const matches = graph.edges
    .filter((e) => e.rel === options.relation)
    .filter((e) => {
      if (!options.entityId) return true;
      return e.source === options.entityId || e.target === options.entityId;
    })
    .filter((e) => {
      if (!options.neighborType || !options.entityId) return true;
      const otherId = e.source === options.entityId ? e.target : e.source;
      return byId.get(otherId)?.type === options.neighborType;
    })
    .slice(0, 100)
    .map((edge) => ({
      edge,
      source: byId.get(edge.source),
      target: byId.get(edge.target),
    }));

  return { relation: options.relation, matches };
}

/**
 * Execute precomputed corpus/graph MCP tools without parsing a witness AST.
 */
export async function executeMcpSidecarTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpSidecarToolResult> {
  const t0 = now();
  try {
    if (name === "get_precompiled_facets") {
      const witnessId = String(args.witnessId ?? "").trim();
      if (!witnessId) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "witnessId required" };
      }
      const facets = await loadPrecompiledFacets(witnessId);
      if (!facets) {
        return {
          ok: false,
          tool: name,
          elapsedMs: now() - t0,
          error: `No facets sidecar for ${witnessId}`,
        };
      }
      return { ok: true, tool: name, elapsedMs: now() - t0, data: facets };
    }

    if (name === "rank_witnesses_tfidf") {
      const term = String(args.term ?? "").trim();
      if (!term) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "term required" };
      }
      const topK = typeof args.topK === "number" ? args.topK : 10;
      const [tfidf, postings] = await Promise.all([loadCorpusTfidf(), loadCorpusTermPostings()]);
      if (!tfidf) {
        return {
          ok: false,
          tool: name,
          elapsedMs: now() - t0,
          error: "corpus-tfidf.json not available — run npm run build:library && npm run sync:library",
        };
      }

      if (postings) {
        const ranked = rankFromPostings(term, postings, tfidf, topK);
        return {
          ok: true,
          tool: name,
          elapsedMs: now() - t0,
          data: {
            term: normalizeWord(term),
            totalDocuments: tfidf.totalDocuments,
            ranked,
          },
        };
      }

      const normalized = normalizeWord(term);
      return {
        ok: true,
        tool: name,
        elapsedMs: now() - t0,
        data: {
          term: normalized,
          idf: tfidf.idf[normalized] ?? null,
          df: tfidf.df[normalized] ?? 0,
          totalDocuments: tfidf.totalDocuments,
          ranked: [],
          note: "corpus-term-postings.json missing — IDF only.",
        },
      };
    }

    if (name === "convert_htr_to_hsms") {
      const htrText = String(args.htrText ?? args.text ?? args.htr_text ?? "");
      if (!htrText.trim()) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "htrText required" };
      }
      const result = convertHtrToHsms(htrText, {
        skipSpaceCleanup: Boolean(args.skip_space_cleanup ?? args.skipSpaceCleanup),
      });
      return {
        ok: true,
        tool: name,
        elapsedMs: now() - t0,
        data: result,
      };
    }

    if (name === "transcribe_manuscript_image") {
      if (!isAzureAgentConfigured()) {
        return {
          ok: false,
          tool: name,
          elapsedMs: now() - t0,
          error:
            "Azure agent not configured — set EXPO_PUBLIC_AZURE_AGENT_ENDPOINT and EXPO_PUBLIC_AZURE_AGENT_API_KEY",
        };
      }
      const imageUri = String(args.image_uri ?? args.imageUri ?? "").trim();
      if (!imageUri) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "image_uri required" };
      }
      const { runHybridTranscriptionPipeline } = await import(
        "@/services/batchTranscriptionService"
      );
      const vision = await runHybridTranscriptionPipeline({
        uri: imageUri,
        name: args.sourceFileName ? String(args.sourceFileName) : undefined,
        mimeType: args.mime_type
          ? String(args.mime_type)
          : imageUri.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(imageUri)
            ? "application/pdf"
            : undefined,
        languageHint: args.language_hint
          ? String(args.language_hint)
          : args.languageHint
            ? String(args.languageHint)
            : undefined,
        maxPages: typeof args.max_pages === "number" ? args.max_pages : undefined,
      });
      return {
        ok: true,
        tool: name,
        elapsedMs: now() - t0,
        data: vision,
      };
    }

    if (name === "audit_hsms_syntax") {
      const text = String(args.text ?? "");
      if (!text.trim()) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "text required" };
      }
      const sourceFileName = args.sourceFileName
        ? String(args.sourceFileName)
        : undefined;
      const incidents = auditHsmsProoferIncidents(text, { sourceFileName });
      const rows = prooferIncidentsToRows(incidents);
      const format = String(args.format ?? "json").toLowerCase();
      if (format === "tsv") {
        return {
          ok: true,
          tool: name,
          elapsedMs: now() - t0,
          data: {
            count: rows.length,
            tsv: formatProoferTsv(rows),
          },
        };
      }
      const errorCount = incidents.filter((i) => i.severity === "error").length;
      return {
        ok: true,
        tool: name,
        elapsedMs: now() - t0,
        data: {
          count: rows.length,
          errors: errorCount,
          warnings: incidents.length - errorCount,
          rows,
        },
      };
    }

    if (name === "query_codicological_graph") {
      const relation = String(args.relation ?? "").trim() as LibraryGraph["edges"][number]["rel"];
      if (!relation) {
        return { ok: false, tool: name, elapsedMs: now() - t0, error: "relation required" };
      }
      const graph = await loadLibraryGraph();
      if (!graph) {
        return {
          ok: false,
          tool: name,
          elapsedMs: now() - t0,
          error: "library-graph.json not available — run npm run build:library && npm run sync:library",
        };
      }
      const data = queryCodicologicalGraph(graph, {
        entityId: args.entityId ? String(args.entityId) : undefined,
        relation,
        neighborType: args.neighborType
          ? (String(args.neighborType) as LibraryGraph["nodes"][number]["type"])
          : undefined,
      });
      return { ok: true, tool: name, elapsedMs: now() - t0, data };
    }

    return { ok: false, tool: name, elapsedMs: now() - t0, error: `Unknown sidecar tool: ${name}` };
  } catch (err) {
    return {
      ok: false,
      tool: name,
      elapsedMs: now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Rank using already-loaded facets (Studio / tests). */
export function rankLoadedWitnessesTfidf(
  term: string,
  facets: PrecompiledFacets[],
  tfidf: CorpusTfidf,
  topK = 10,
): ReturnType<typeof rankWitnessesTfidf> {
  const map = new Map(facets.map((f) => [f.baseName, f]));
  return rankWitnessesTfidf(term, map, tfidf, topK);
}
