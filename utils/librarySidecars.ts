import {
  getCorpusPostingsUrl,
  getCorpusStatsUrl,
  getCorpusTfidfUrl,
  getLibraryFacetsUrl,
  getLibraryGraphUrl,
} from "@/constants/libraryConfig";
import {
  CORPUS_POSTINGS_FORMAT,
  CORPUS_STATS_FORMAT,
  CORPUS_TFIDF_FORMAT,
  FACETS_FORMAT,
  LIBRARY_GRAPH_FORMAT,
  type CorpusStats,
  type CorpusTermPostings,
  type CorpusTfidf,
  type LibraryGraph,
  type PrecompiledFacets,
} from "@/utils/corpusPrecompute";

const facetsCache = new Map<string, PrecompiledFacets>();
let tfidfCache: CorpusTfidf | null = null;
let statsCache: CorpusStats | null = null;
let graphCache: LibraryGraph | null = null;
let postingsCache: CorpusTermPostings | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export function isPrecompiledFacets(value: unknown): value is PrecompiledFacets {
  if (!value || typeof value !== "object") return false;
  const v = value as PrecompiledFacets;
  return v.format === FACETS_FORMAT && typeof v.baseName === "string" && !!v.facets;
}

export function isCorpusTfidf(value: unknown): value is CorpusTfidf {
  if (!value || typeof value !== "object") return false;
  const v = value as CorpusTfidf;
  return v.format === CORPUS_TFIDF_FORMAT && typeof v.totalDocuments === "number" && !!v.idf;
}

export function isCorpusStats(value: unknown): value is CorpusStats {
  if (!value || typeof value !== "object") return false;
  const v = value as CorpusStats;
  return v.format === CORPUS_STATS_FORMAT && Array.isArray(v.witnesses);
}

export function isLibraryGraph(value: unknown): value is LibraryGraph {
  if (!value || typeof value !== "object") return false;
  const v = value as LibraryGraph;
  return v.format === LIBRARY_GRAPH_FORMAT && Array.isArray(v.nodes) && Array.isArray(v.edges);
}

export function isCorpusTermPostings(value: unknown): value is CorpusTermPostings {
  if (!value || typeof value !== "object") return false;
  const v = value as CorpusTermPostings;
  return v.format === CORPUS_POSTINGS_FORMAT && !!v.postings;
}

/** Load precompiled facets for a library witness (cached). Returns null on miss. */
export async function loadPrecompiledFacets(
  baseName: string,
): Promise<PrecompiledFacets | null> {
  const hit = facetsCache.get(baseName);
  if (hit) return hit;

  try {
    const remote = await fetchJson<unknown>(getLibraryFacetsUrl(baseName));
    if (isPrecompiledFacets(remote)) {
      facetsCache.set(baseName, remote);
      return remote;
    }
  } catch {
    // Fall through to bundled asset attempt.
  }

  try {
    // Metro static require map is impractical for 700+ files; dynamic path via fetch only.
    // Native builds that synced assets under a HTTP-served origin still hit getLibraryFacetsUrl.
  } catch {
    // ignore
  }

  return null;
}

export async function loadCorpusTfidf(): Promise<CorpusTfidf | null> {
  if (tfidfCache) return tfidfCache;
  try {
    const remote = await fetchJson<unknown>(getCorpusTfidfUrl());
    if (isCorpusTfidf(remote)) {
      tfidfCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadCorpusStats(): Promise<CorpusStats | null> {
  if (statsCache) return statsCache;
  try {
    const remote = await fetchJson<unknown>(getCorpusStatsUrl());
    if (isCorpusStats(remote)) {
      statsCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadLibraryGraph(): Promise<LibraryGraph | null> {
  if (graphCache) return graphCache;
  try {
    const remote = await fetchJson<unknown>(getLibraryGraphUrl());
    if (isLibraryGraph(remote)) {
      graphCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadCorpusTermPostings(): Promise<CorpusTermPostings | null> {
  if (postingsCache) return postingsCache;
  try {
    const remote = await fetchJson<unknown>(getCorpusPostingsUrl());
    if (isCorpusTermPostings(remote)) {
      postingsCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

/** @internal test helper */
export function clearLibrarySidecarCaches(): void {
  facetsCache.clear();
  tfidfCache = null;
  statsCache = null;
  graphCache = null;
  postingsCache = null;
}

/** Inject a facets sidecar (tests / offline MCP). */
export function seedPrecompiledFacets(facets: PrecompiledFacets): void {
  facetsCache.set(facets.baseName, facets);
}

export function seedCorpusTfidf(tfidf: CorpusTfidf): void {
  tfidfCache = tfidf;
}

export function seedLibraryGraph(graph: LibraryGraph): void {
  graphCache = graph;
}

export function seedCorpusTermPostings(postings: CorpusTermPostings): void {
  postingsCache = postings;
}
