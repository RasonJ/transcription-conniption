import {
  getCorpusPostingsUrl,
  getCorpusStatsUrl,
  getCorpusTfidfUrl,
  getLibraryFacetsUrl,
  getLibraryGraphUrl,
  getUploadCorpusStatsUrl,
  getUploadCorpusTfidfUrl,
  UPLOAD_CORPUS_TFIDF_ENTRY,
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
import { readZipJson } from "@/utils/zipEntry";

const facetsCache = new Map<string, PrecompiledFacets>();
let tfidfCache: CorpusTfidf | null = null;
let statsCache: CorpusStats | null = null;
let graphCache: LibraryGraph | null = null;
let postingsCache: CorpusTermPostings | null = null;
let uploadTfidfCache: Record<string, number> | null = null;
let uploadStatsCache: UploadCorpusStats | null = null;

/** Flat `lang:term` → IDF table from assets/library/tfidf-index (not the HSMS catalog sidecar). */
export type UploadCorpusStats = {
  totalDocuments: number;
  totalWords: number;
  languageCodes?: string[];
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

/** Fetch a zip and parse one JSON entry. The archive is not written out expanded. */
async function fetchZipJson<T>(url: string, entryName: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return readZipJson<T>(await response.arrayBuffer(), entryName);
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
function isUploadStats(value: unknown): value is UploadCorpusStats {
  if (!value || typeof value !== "object") return false;
  return typeof (value as UploadCorpusStats).totalDocuments === "number";
}

function isUploadIdfTable(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key in record) {
    return typeof record[key] === "number";
  }
  return false;
}

/** Precomputed `lang:term` IDF values. Does not replace the HSMS catalog corpus-tfidf.json. */
export async function loadUploadCorpusTfidf(): Promise<Record<string, number> | null> {
  if (uploadTfidfCache) return uploadTfidfCache;
  try {
    const remote = await fetchZipJson<unknown>(getUploadCorpusTfidfUrl(), UPLOAD_CORPUS_TFIDF_ENTRY);
    if (isUploadIdfTable(remote)) {
      uploadTfidfCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

export async function loadUploadCorpusStats(): Promise<UploadCorpusStats | null> {
  if (uploadStatsCache) return uploadStatsCache;
  try {
    const remote = await fetchJson<unknown>(getUploadCorpusStatsUrl());
    if (isUploadStats(remote)) {
      uploadStatsCache = remote;
      return remote;
    }
  } catch {
    return null;
  }
  return null;
}

export function seedUploadCorpusTfidf(idf: Record<string, number>, stats?: UploadCorpusStats): void {
  uploadTfidfCache = idf;
  if (stats) uploadStatsCache = stats;
}

export function clearLibrarySidecarCaches(): void {
  facetsCache.clear();
  tfidfCache = null;
  statsCache = null;
  graphCache = null;
  postingsCache = null;
  uploadTfidfCache = null;
  uploadStatsCache = null;
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
