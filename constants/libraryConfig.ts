import { Platform } from "react-native";

/** Web: files copied by `npm run sync:library` into `public/`. */
export const LIBRARY_CATALOG_FILENAME = "library-catalog.json";
export const LIBRARY_ENTRIES_DIR = "library/entries";
export const LIBRARY_FACETS_DIR = "library/facets";
export const CORPUS_TFIDF_FILENAME = "corpus-tfidf.json";
export const CORPUS_STATS_FILENAME = "corpus-stats.json";
export const CORPUS_POSTINGS_FILENAME = "corpus-term-postings.json";
export const LIBRARY_GRAPH_FILENAME = "library-graph.json";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Base URL for library JSON (no trailing slash).
 * Set `EXPO_PUBLIC_LIBRARY_BASE_URL` when the catalog is hosted elsewhere.
 */
export function getLibraryBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_LIBRARY_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return "";
}

function publicUrl(pathFromRoot: string): string {
  const base = getLibraryBaseUrl();
  const path = pathFromRoot.replace(/^\/+/, "");
  return base ? `${base}/${path}` : `/${path}`;
}

export function getLibraryCatalogUrl(): string {
  return publicUrl(LIBRARY_CATALOG_FILENAME);
}

export function getLibraryEntryUrl(baseName: string): string {
  const file = `${encodeURIComponent(baseName)}.json`;
  return publicUrl(`${LIBRARY_ENTRIES_DIR}/${file}`);
}

export function getLibraryFacetsUrl(baseName: string): string {
  const file = `${encodeURIComponent(baseName)}.json`;
  return publicUrl(`${LIBRARY_FACETS_DIR}/${file}`);
}

export function getCorpusTfidfUrl(): string {
  return publicUrl(CORPUS_TFIDF_FILENAME);
}

export function getCorpusStatsUrl(): string {
  return publicUrl(CORPUS_STATS_FILENAME);
}

export function getLibraryGraphUrl(): string {
  return publicUrl(LIBRARY_GRAPH_FILENAME);
}

export function getCorpusPostingsUrl(): string {
  return publicUrl(CORPUS_POSTINGS_FILENAME);
}

/** External lang:term IDF index under assets/library/tfidf-index, published to public/. */
export const UPLOAD_TFIDF_INDEX_DIR = "library/tfidf-index";

/** Wikipedia-scale IDF table, stored compressed. The HSMS catalog sidecar stays plain JSON. */
export const UPLOAD_CORPUS_TFIDF_ZIP = "corpus-tfidf.json.zip";
export const UPLOAD_CORPUS_TFIDF_ENTRY = "corpus-tfidf.json";

export function getUploadCorpusTfidfUrl(): string {
  return publicUrl(`${UPLOAD_TFIDF_INDEX_DIR}/${UPLOAD_CORPUS_TFIDF_ZIP}`);
}

export function getUploadCorpusStatsUrl(): string {
  return publicUrl(`${UPLOAD_TFIDF_INDEX_DIR}/corpus-stats.json`);
}
