import type { CorpusLanguageIdf } from "@/utils/corpusTfidfScore";

export const FACETS_FORMAT = "hsms-facets/1";
export const CORPUS_TFIDF_FORMAT = "hsms-corpus-tfidf/1";
export const CORPUS_STATS_FORMAT = "hsms-corpus-stats/1";
export const LIBRARY_GRAPH_FORMAT = "hsms-library-graph/1";
export const CORPUS_POSTINGS_FORMAT = "hsms-corpus-postings/1";

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
  /** IDF(t) = ln(|D| / (1 + df(t))) for terms exported from the catalog build. */
  idf: Record<string, number>;
  /** Document frequency for each exported term. */
  df: Record<string, number>;
  /** Same IDF table split by witness language code. Absent until a catalog build sees language codes. */
  byLanguage?: Record<string, CorpusLanguageIdf & { df: Record<string, number> }>;
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

/** Inverted index: term → top witnesses by TF (for O(1) MCP TF-IDF ranking). */
export type CorpusTermPostings = {
  format: typeof CORPUS_POSTINGS_FORMAT;
  generatedAt: string;
  totalDocuments: number;
  postings: Record<string, Array<{ id: string; tf: number }>>;
  /** Postings restricted to witnesses that carry each language code. */
  postingsByLanguage?: Record<string, CorpusTermPostings["postings"]>;
};

export type CorpusPrecomputeArtifacts = {
  facetsWritten: number;
  corpusTfidf: CorpusTfidf;
  corpusStats: CorpusStats;
  libraryGraph: LibraryGraph;
  corpusPostings: CorpusTermPostings;
};
