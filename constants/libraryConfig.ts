import { Platform } from "react-native";

/** Web: files copied by `npm run sync:library` into `public/`. */
export const LIBRARY_CATALOG_FILENAME = "library-catalog.json";
export const LIBRARY_ENTRIES_DIR = "library/entries";

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

export function getLibraryCatalogUrl(): string {
  const base = getLibraryBaseUrl();
  return base ? `${base}/${LIBRARY_CATALOG_FILENAME}` : `/${LIBRARY_CATALOG_FILENAME}`;
}

export function getLibraryEntryUrl(baseName: string): string {
  const base = getLibraryBaseUrl();
  const file = `${encodeURIComponent(baseName)}.json`;
  return base
    ? `${base}/${LIBRARY_ENTRIES_DIR}/${file}`
    : `/${LIBRARY_ENTRIES_DIR}/${file}`;
}
