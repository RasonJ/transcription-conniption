import type { ParsedManuscript } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { buildFacetIndex, type FacetIndex } from "@/utils/copilot/facetIndex";
import { frequencyMap, normalizeWord, wordStats } from "@/utils/copilot/stats";
import type { LibraryCatalog, LibraryCatalogEntry } from "@/utils/libraryCatalog";
import { LIBRARY_ENTRY_FORMAT, type LibraryEntryPayload } from "@/utils/libraryCatalog";
import { renderNormalizedBlock } from "@/utils/normalizedText";

export const FACETS_FORMAT = "hsms-facets/1";
export const CORPUS_TFIDF_FORMAT = "hsms-corpus-tfidf/1";
export const CORPUS_STATS_FORMAT = "hsms-corpus-stats/1";
export const LIBRARY_GRAPH_FORMAT = "hsms-library-graph/1";

const TOP_TERM_LIMIT = 250;
const IDF_EXPORT_LIMIT = 8000;
const TERM_GRAPH_MAX_DF = 8;
const TERM_GRAPH_MIN_DF = 2;
const MAX_RUBRIC_EXCERPTS = 48;
const MAX_GLOSS_EXCERPTS = 48;
const MAX_INITIAL_EXCERPTS = 48;

export type PrecompiledFacetHit = {
  folioId: string;
  line?: string;
  text: string;
  type?: string;
  letter?: string;
  depth?: number;
};

export type PrecompiledFacets = {
  format: typeof FACETS_FORMAT;
  baseName: string;
  witnessHash: string;
  wordCount: number;
  typeCount: number;
  ttr: number;
  sttr: number;
  hapax: number;
  facets: {
    rubrics: PrecompiledFacetHit[];
    glosses: PrecompiledFacetHit[];
    dropInitials: PrecompiledFacetHit[];
    codeSwitching: Array<{ lang: string; words: number; tokens: number; spans: number }>;
    hands: Array<{ hand: string; count: number }>;
    blockCounts: Record<string, number>;
    tokenCounts: Record<string, number>;
  };
  /** Top term frequencies (normalized lemmas) for BM25 / TF-IDF scoring. */
  termFreq: Record<string, number>;
};

export type CorpusTfidf = {
  format: typeof CORPUS_TFIDF_FORMAT;
  generatedAt: string;
  totalDocuments: number;
  /** IDF(t) = ln(|D| / (1 + df(t))) */
  idf: Record<string, number>;
  /** Document frequency for each exported term. */
  df: Record<string, number>;
};

export type CorpusStats = {
  format: typeof CORPUS_STATS_FORMAT;
  generatedAt: string;
  totalDocuments: number;
  totalWords: number;
  meanTtr: number;
  meanSttr: number;
  witnesses: Array<{
    baseName: string;
    wordCount: number;
    typeCount: number;
    ttr: number;
    sttr: number;
    rubricCount: number;
    glossCount: number;
    dropInitialCount: number;
    languageCodes: string[];
  }>;
};

export type LibraryGraphNode = {
  id: string;
  type: "manuscript" | "author" | "printer" | "city" | "year" | "term";
  label: string;
};

export type LibraryGraphEdge = {
  source: string;
  target: string;
  rel: "AUTHORED_BY" | "PRINTED_BY" | "PUBLISHED_IN" | "DATED" | "CONTAINS_TERM";
  weight?: number;
};

export type LibraryGraph = {
  format: typeof LIBRARY_GRAPH_FORMAT;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  nodes: LibraryGraphNode[];
  edges: LibraryGraphEdge[];
};

export type CorpusPrecomputeArtifacts = {
  facetsWritten: number;
  corpusTfidf: CorpusTfidf;
  corpusStats: CorpusStats;
  libraryGraph: LibraryGraph;
};

function slugEntity(kind: string, label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return `${kind}.${slug || "unknown"}`;
}

function blockTextAt(parsed: ParsedManuscript, folioId: string, blockIndex: number): string {
  const folio = parsed.folios.find((f) => f.id === folioId);
  const block = folio?.blocks[blockIndex];
  if (!block) return "";
  return renderNormalizedBlock(block).trim();
}

/** Compact JSON-serializable facet sidecar for MCP / library search. */
export function buildPrecompiledFacets(
  parsed: ParsedManuscript,
  baseName: string,
  options?: { sourceText?: string; topTerms?: number },
): PrecompiledFacets {
  const facets = buildFacetIndex(parsed, { sourceText: options?.sourceText });
  const stats = wordStats(facets.words.surfaces);
  const freq = frequencyMap(facets.words.surfaces);
  const topTerms = options?.topTerms ?? TOP_TERM_LIMIT;

  const termFreqEntries = [...freq.entries()]
    .filter(([term]) => isIndexableTerm(term))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topTerms);

  const termFreq: Record<string, number> = {};
  for (const [term, count] of termFreqEntries) {
    termFreq[term] = count;
  }

  const rubrics: PrecompiledFacetHit[] = [];
  for (const ref of facets.blockRefs.get("rubric") ?? []) {
    if (rubrics.length >= MAX_RUBRIC_EXCERPTS) break;
    const text = blockTextAt(parsed, ref.folioId, ref.blockIndex);
    if (!text) continue;
    rubrics.push({ folioId: ref.folioId, line: ref.lineNumber, text });
  }

  const glosses: PrecompiledFacetHit[] = [];
  for (const type of ["gloss", "addendum"] as const) {
    for (const ref of facets.blockRefs.get(type) ?? []) {
      if (glosses.length >= MAX_GLOSS_EXCERPTS) break;
      const text = blockTextAt(parsed, ref.folioId, ref.blockIndex);
      if (!text) continue;
      glosses.push({ folioId: ref.folioId, line: ref.lineNumber, text, type });
    }
  }

  const dropInitials: PrecompiledFacetHit[] = [];
  for (const [depth, refs] of facets.initialDepth.entries()) {
    for (const ref of refs) {
      if (dropInitials.length >= MAX_INITIAL_EXCERPTS) break;
      const folio = parsed.folios[ref.folioIndex];
      const token = folio?.blocks[ref.blockIndex]?.tokens[ref.tokenIndex];
      const letter = (token?.value ?? token?.raw ?? "?").slice(0, 8);
      dropInitials.push({
        folioId: ref.folioId,
        line: ref.lineNumber,
        text: letter,
        letter,
        depth,
      });
    }
  }

  const codeSwitching = [...facets.languageSpans.entries()]
    .map(([lang, facet]) => ({
      lang,
      words: facet.words,
      tokens: facet.tokens,
      spans: facet.spans.length,
    }))
    .sort((a, b) => b.words - a.words || a.lang.localeCompare(b.lang));

  const hands = [...facets.handRefs.entries()]
    .map(([hand, refs]) => ({ hand, count: refs.length }))
    .sort((a, b) => b.count - a.count || a.hand.localeCompare(b.hand));

  const blockCounts: Record<string, number> = {};
  facets.blockTypeCounts.forEach((count, type) => {
    blockCounts[type] = count;
  });

  const tokenCounts: Record<string, number> = {};
  facets.tokenTypeCounts.forEach((counts, type) => {
    tokenCounts[type] = counts.total;
  });

  return {
    format: FACETS_FORMAT,
    baseName,
    witnessHash: facets.witnessHash,
    wordCount: stats.tokens,
    typeCount: stats.types,
    ttr: stats.ttr,
    sttr: stats.sttr,
    hapax: stats.hapax,
    facets: {
      rubrics,
      glosses,
      dropInitials,
      codeSwitching,
      hands,
      blockCounts,
      tokenCounts,
    },
    termFreq,
  };
}

/** Skip pure digits / ultra-short tokens that pollute IDF rankings. */
export function isIndexableTerm(term: string): boolean {
  return term.length >= 3 && !/^\d+$/.test(term);
}

/** IDF(t, D) = ln(|D| / (1 + df(t))). */
export function computeIdf(totalDocuments: number, documentFrequency: number): number {
  if (totalDocuments <= 0) return 0;
  return Math.log(totalDocuments / (1 + documentFrequency));
}

export function buildCorpusTfidf(
  documentTermSets: Array<{ baseName: string; terms: Iterable<string> }>,
  options?: { exportLimit?: number },
): CorpusTfidf {
  const totalDocuments = documentTermSets.length;
  const df = new Map<string, number>();

  for (const doc of documentTermSets) {
    const seen = new Set<string>();
    for (const raw of doc.terms) {
      const term = normalizeWord(raw);
      if (!term || !isIndexableTerm(term) || seen.has(term)) continue;
      seen.add(term);
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const exportLimit = options?.exportLimit ?? IDF_EXPORT_LIMIT;
  const ranked = [...df.entries()]
    .sort((a, b) => {
      // Prefer mid-rarity discriminative terms, then alphabetical.
      const scoreA = Math.abs(a[1] - totalDocuments * 0.15);
      const scoreB = Math.abs(b[1] - totalDocuments * 0.15);
      return scoreA - scoreB || a[0].localeCompare(b[0]);
    })
    .slice(0, exportLimit);

  const idf: Record<string, number> = {};
  const dfOut: Record<string, number> = {};
  for (const [term, count] of ranked) {
    dfOut[term] = count;
    idf[term] = Number(computeIdf(totalDocuments, count).toFixed(6));
  }

  return {
    format: CORPUS_TFIDF_FORMAT,
    generatedAt: new Date().toISOString(),
    totalDocuments,
    idf,
    df: dfOut,
  };
}

export function buildCorpusStats(facets: PrecompiledFacets[]): CorpusStats {
  let totalWords = 0;
  let ttrSum = 0;
  let sttrSum = 0;
  const witnesses = facets.map((f) => {
    totalWords += f.wordCount;
    ttrSum += f.ttr;
    sttrSum += f.sttr;
    return {
      baseName: f.baseName,
      wordCount: f.wordCount,
      typeCount: f.typeCount,
      ttr: Number(f.ttr.toFixed(6)),
      sttr: Number(f.sttr.toFixed(6)),
      rubricCount: f.facets.rubrics.length,
      glossCount: f.facets.glosses.length,
      dropInitialCount: f.facets.dropInitials.length,
      languageCodes: f.facets.codeSwitching.map((c) => c.lang),
    };
  });

  const n = facets.length || 1;
  return {
    format: CORPUS_STATS_FORMAT,
    generatedAt: new Date().toISOString(),
    totalDocuments: facets.length,
    totalWords,
    meanTtr: Number((ttrSum / n).toFixed(6)),
    meanSttr: Number((sttrSum / n).toFixed(6)),
    witnesses,
  };
}

export function buildLibraryGraph(
  catalog: LibraryCatalog,
  facets: PrecompiledFacets[],
  tfidf: CorpusTfidf,
): LibraryGraph {
  const nodes = new Map<string, LibraryGraphNode>();
  const edges: LibraryGraphEdge[] = [];
  const facetByBase = new Map(facets.map((f) => [f.baseName, f]));

  const addNode = (node: LibraryGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  for (const entry of catalog.entries) {
    if (entry.status !== "ok") continue;
    const msId = `MS.${entry.baseName}`;
    addNode({ id: msId, type: "manuscript", label: entry.title || entry.baseName });

    if (entry.author.trim()) {
      const id = slugEntity("AUTHOR", entry.author);
      addNode({ id, type: "author", label: entry.author.trim() });
      edges.push({ source: msId, target: id, rel: "AUTHORED_BY" });
    }
    if (entry.printer.trim()) {
      const id = slugEntity("PRINTER", entry.printer);
      addNode({ id, type: "printer", label: entry.printer.trim() });
      edges.push({ source: msId, target: id, rel: "PRINTED_BY" });
    }
    if (entry.city.trim()) {
      const id = slugEntity("CITY", entry.city);
      addNode({ id, type: "city", label: entry.city.trim() });
      edges.push({ source: msId, target: id, rel: "PUBLISHED_IN" });
    }
    if (entry.year.trim()) {
      const id = slugEntity("YEAR", entry.year);
      addNode({ id, type: "year", label: entry.year.trim() });
      edges.push({ source: msId, target: id, rel: "DATED" });
    }

    const facet = facetByBase.get(entry.baseName);
    if (!facet) continue;

    // Link rare discriminative terms (graphify-style shared vocabulary).
    for (const [term, tf] of Object.entries(facet.termFreq)) {
      const df = tfidf.df[term];
      if (df === undefined || df < TERM_GRAPH_MIN_DF || df > TERM_GRAPH_MAX_DF) continue;
      const idf = tfidf.idf[term] ?? computeIdf(tfidf.totalDocuments, df);
      const termId = slugEntity("TERM", term);
      addNode({ id: termId, type: "term", label: term });
      edges.push({
        source: msId,
        target: termId,
        rel: "CONTAINS_TERM",
        weight: Number((tf * idf).toFixed(4)),
      });
    }
  }

  return {
    format: LIBRARY_GRAPH_FORMAT,
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.size,
    edgeCount: edges.length,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
  };
}

/** TF × IDF score for a query term against a witness termFreq map. */
export function scoreWitnessTerm(
  term: string,
  termFreq: Record<string, number>,
  tfidf: CorpusTfidf,
): number {
  const normalized = normalizeWord(term);
  const tf = termFreq[normalized] ?? 0;
  if (tf <= 0) return 0;
  const idf = tfidf.idf[normalized] ?? computeIdf(tfidf.totalDocuments, tfidf.df[normalized] ?? 0);
  return tf * idf;
}

export interface CorpusPrecomputeFs {
  readdir(path: string): string[];
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
  exists(path: string): boolean;
  mkdir?(path: string): void;
}

/**
 * Rebuild facet sidecars + corpus TF-IDF / stats / graph from `out/*.library.json`.
 * Safe to run after batch convert or independently via `npm run build:library`.
 */
export function runCorpusPrecomputeWithFs(
  options: {
    outputDir: string;
    catalog: LibraryCatalog;
    onProgress?: (baseName: string, index: number, total: number) => void;
    /** Skip rewriting a facets sidecar when it already exists (faster incremental). */
    skipExistingFacets?: boolean;
  },
  fs: CorpusPrecomputeFs,
  joinPath: (...parts: string[]) => string = (...parts) => parts.join("/").replace(/\/+/g, "/"),
): CorpusPrecomputeArtifacts {
  const okEntries = options.catalog.entries.filter((e) => e.status === "ok");
  const compiledFacets: PrecompiledFacets[] = [];
  const docTerms: Array<{ baseName: string; terms: string[] }> = [];

  for (let i = 0; i < okEntries.length; i++) {
    const entry = okEntries[i];
    options.onProgress?.(entry.baseName, i + 1, okEntries.length);

    const facetsPath = joinPath(options.outputDir, `${entry.baseName}.facets.json`);
    const libraryPath = joinPath(options.outputDir, `${entry.baseName}.library.json`);

    if (options.skipExistingFacets && fs.exists(facetsPath)) {
      try {
        const existing = JSON.parse(fs.readFile(facetsPath)) as PrecompiledFacets;
        if (existing.format === FACETS_FORMAT) {
          compiledFacets.push(existing);
          docTerms.push({ baseName: entry.baseName, terms: Object.keys(existing.termFreq) });
          continue;
        }
      } catch {
        // fall through and rebuild
      }
    }

    if (!fs.exists(libraryPath)) {
      continue;
    }

    let transcriptionText = "";
    try {
      const payload = JSON.parse(fs.readFile(libraryPath)) as LibraryEntryPayload;
      if (payload.format === LIBRARY_ENTRY_FORMAT && payload.transcriptionText) {
        transcriptionText = payload.transcriptionText;
      }
    } catch {
      continue;
    }
    if (!transcriptionText) continue;

    const parsed = compileManuscriptTree(transcriptionText);
    const facets = buildPrecompiledFacets(parsed, entry.baseName, {
      sourceText: transcriptionText,
    });
    fs.writeFile(facetsPath, JSON.stringify(facets));
    compiledFacets.push(facets);
    docTerms.push({ baseName: entry.baseName, terms: Object.keys(facets.termFreq) });
  }

  const corpusTfidf = buildCorpusTfidf(docTerms);
  const corpusStats = buildCorpusStats(compiledFacets);
  const libraryGraph = buildLibraryGraph(options.catalog, compiledFacets, corpusTfidf);

  fs.writeFile(
    joinPath(options.outputDir, "corpus-tfidf.json"),
    JSON.stringify(corpusTfidf, null, 2),
  );
  fs.writeFile(
    joinPath(options.outputDir, "corpus-stats.json"),
    JSON.stringify(corpusStats, null, 2),
  );
  fs.writeFile(
    joinPath(options.outputDir, "library-graph.json"),
    JSON.stringify(libraryGraph, null, 2),
  );

  return {
    facetsWritten: compiledFacets.length,
    corpusTfidf,
    corpusStats,
    libraryGraph,
  };
}

/** @internal test helper — document-frequency map from a facet index word stream. */
export function uniqueNormalizedTermsFromFacets(facets: FacetIndex): string[] {
  const seen = new Set<string>();
  for (const surface of facets.words.surfaces) {
    const term = normalizeWord(surface);
    if (isIndexableTerm(term)) seen.add(term);
  }
  return [...seen];
}

export function catalogEntryTermHint(entry: LibraryCatalogEntry): string[] {
  return [entry.title, entry.author, entry.city, entry.printer, entry.keywords]
    .join(" ")
    .split(/\s+/)
    .map(normalizeWord)
    .filter((t) => t.length >= 3);
}
