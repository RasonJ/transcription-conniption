import {
  getLibraryCatalogUrl,
  getLibraryEntryUrl,
} from "@/constants/libraryConfig";
import type {
  LibraryCatalog,
  LibraryCatalogEntry,
  LibraryEntryPayload,
  LibrarySearchFilters,
} from "@/utils/libraryCatalog";
import {
  LIBRARY_CATALOG_FORMAT,
  LIBRARY_ENTRY_FORMAT,
  filterLibraryEntries,
} from "@/utils/libraryCatalog";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadState = "idle" | "loading" | "ready" | "error";

let bundledCatalog: LibraryCatalog | null = null;
try {
  // Optional committed snapshot (run `npm run sync:library` to refresh).
  bundledCatalog = require("@/assets/library/catalog.json") as LibraryCatalog;
} catch {
  bundledCatalog = null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function isLibraryCatalog(value: unknown): value is LibraryCatalog {
  if (!value || typeof value !== "object") {
    return false;
  }
  const catalog = value as LibraryCatalog;
  return (
    catalog.format === LIBRARY_CATALOG_FORMAT &&
    Array.isArray(catalog.entries)
  );
}

function isLibraryEntryPayload(value: unknown): value is LibraryEntryPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as LibraryEntryPayload;
  return (
    entry.format === LIBRARY_ENTRY_FORMAT &&
    typeof entry.transcriptionText === "string"
  );
}

export function useLibraryCatalog() {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<LibrarySearchFilters>({
    author: "",
    year: "",
    keywords: "",
  });
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const remoteUrl = getLibraryCatalogUrl();
    try {
      const remote = await fetchJson<unknown>(remoteUrl);
      if (isLibraryCatalog(remote)) {
        setCatalog(remote);
        setLoadState("ready");
        return;
      }
    } catch (remoteErr) {
      console.warn("Library catalog fetch failed", remoteUrl, remoteErr);
    }

    if (bundledCatalog && isLibraryCatalog(bundledCatalog)) {
      setCatalog(bundledCatalog);
      setLoadState("ready");
      return;
    }

    setCatalog(null);
    setLoadState("error");
    setErrorMessage(
      "No library catalog found. Run batch conversion, then `npm run build:library` and `npm run sync:library`.",
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredEntries = useMemo(() => {
    if (!catalog) {
      return [] as LibraryCatalogEntry[];
    }
    return filterLibraryEntries(catalog.entries, filters);
  }, [catalog, filters]);

  const loadEntryPayload = useCallback(async (entry: LibraryCatalogEntry) => {
    if (entry.status !== "ok") {
      throw new Error("This witness failed batch conversion and cannot be opened.");
    }

    setLoadingEntryId(entry.id);
    try {
      const url = getLibraryEntryUrl(entry.baseName);
      const remote = await fetchJson<unknown>(url);
      if (isLibraryEntryPayload(remote)) {
        return remote;
      }
      throw new Error("Invalid library entry payload");
    } finally {
      setLoadingEntryId(null);
    }
  }, []);

  return {
    loadState,
    catalog,
    errorMessage,
    filters,
    setFilters,
    filteredEntries,
    reload,
    loadEntryPayload,
    loadingEntryId,
  };
}
