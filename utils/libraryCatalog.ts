import type { ParsedManuscript } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { inferManuscriptTitle } from "@/utils/manuscriptTitle";

export const LIBRARY_CATALOG_FORMAT = "hsms-library-catalog/1";
export const LIBRARY_ENTRY_FORMAT = "hsms-library-entry/1";

export type LibraryCatalogEntry = {
  id: string;
  baseName: string;
  sourceFileName: string;
  title: string;
  author: string;
  year: string;
  city: string;
  printer: string;
  keywords: string;
  status: "ok" | "failed";
  exportedAt: string;
  folioCount?: number;
  wordCount?: number;
};

export type LibraryCatalog = {
  format: typeof LIBRARY_CATALOG_FORMAT;
  generatedAt: string;
  outputDir: string;
  entryCount: number;
  entries: LibraryCatalogEntry[];
};

export type LibraryEntryPayload = LibraryCatalogEntry & {
  format: typeof LIBRARY_ENTRY_FORMAT;
  transcriptionText: string;
};

export type LibrarySearchFilters = {
  author?: string;
  year?: string;
  keywords?: string;
};

export function extractYearFromImprintDate(date?: string): string {
  if (!date) {
    return "";
  }
  const match = date.trim().match(/(\d{3,4})/);
  return match ? match[1] : "";
}

function extractYearFromRmkLines(transcriptionText: string): string {
  for (const line of transcriptionText.split(/\r?\n/)) {
    const pipeMatch = line.match(/\{RMK:\s*[^}|]+\|[^}|]+\|\s*([^}.]+)/i);
    if (pipeMatch) {
      const year = extractYearFromImprintDate(pipeMatch[1].trim());
      if (year) {
        return year;
      }
    }
  }
  return "";
}

/** Fast RMK-only metadata scan (no full compile). Used when rebuilding catalog from native bundles. */
export function extractLibraryMetadataFromRmk(
  transcriptionText: string,
  options?: { sourceFileName?: string; manuscriptTitle?: string },
): Pick<
  LibraryCatalogEntry,
  "author" | "title" | "year" | "city" | "printer"
> {
  let author = "";
  let title = options?.manuscriptTitle?.trim() ?? "";
  let city = "";
  let printer = "";
  let year = "";

  for (const line of transcriptionText.split(/\r?\n/)) {
    const match = line.match(/\{RMK:\s*(.*?)\.?\}/i);
    if (!match) {
      continue;
    }
    const content = match[1].trim();
    if (!content) {
      continue;
    }
    if (content.includes("|")) {
      const parts = content.split("|").map((p) => p.trim());
      if (!city && parts[0]) {
        city = parts[0];
      }
      if (!printer && parts[1]) {
        printer = parts[1];
      }
      if (!year && parts[2]) {
        year = extractYearFromImprintDate(parts[2]);
      }
      continue;
    }
    if (!author) {
      author = content;
    } else if (!title) {
      title = content;
    }
  }

  if (!title) {
    title = inferManuscriptTitle(transcriptionText, options?.sourceFileName);
  }

  if (!year) {
    year = extractYearFromRmkLines(transcriptionText);
  }

  return { author, title, year, city, printer };
}

export function extractLibraryMetadata(
  transcriptionText: string,
  options?: { sourceFileName?: string; manuscriptTitle?: string },
): Pick<
  LibraryCatalogEntry,
  "author" | "title" | "year" | "city" | "printer" | "folioCount" | "wordCount"
> {
  const parsed: ParsedManuscript = compileManuscriptTree(transcriptionText);
  const { metadata, stats, folios } = parsed;
  const title =
    options?.manuscriptTitle?.trim() ||
    metadata.title ||
    inferManuscriptTitle(transcriptionText, options?.sourceFileName);

  const year =
    extractYearFromImprintDate(metadata.imprint?.date) ||
    extractYearFromImprintDate(metadata.witness?.shelfmark) ||
    extractYearFromRmkLines(transcriptionText);

  return {
    author: metadata.author,
    title,
    year,
    city: metadata.imprint?.city ?? metadata.witness?.city ?? "",
    printer: metadata.imprint?.printer ?? metadata.witness?.library ?? "",
    folioCount: folios.length,
    wordCount: stats.totalWords,
  };
}

export function buildLibraryKeywords(
  fields: Pick<
    LibraryCatalogEntry,
    "author" | "title" | "year" | "city" | "printer" | "baseName" | "sourceFileName"
  >,
): string {
  return [
    fields.author,
    fields.title,
    fields.year,
    fields.city,
    fields.printer,
    fields.baseName,
    fields.sourceFileName,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLibraryCatalogEntry(input: {
  baseName: string;
  sourceFileName: string;
  status: "ok" | "failed";
  exportedAt: string;
  transcriptionText?: string;
  manuscriptTitle?: string;
  folioCount?: number;
  wordCount?: number;
}): LibraryCatalogEntry {
  const meta =
    input.status === "ok" && input.transcriptionText
      ? extractLibraryMetadata(input.transcriptionText, {
          sourceFileName: input.sourceFileName,
          manuscriptTitle: input.manuscriptTitle,
        })
      : {
          author: "",
          title: input.manuscriptTitle ?? input.baseName.replace(/_/g, " "),
          year: "",
          city: "",
          printer: "",
          folioCount: input.folioCount,
          wordCount: input.wordCount,
        };

  const entry: LibraryCatalogEntry = {
    id: input.baseName,
    baseName: input.baseName,
    sourceFileName: input.sourceFileName,
    title: meta.title,
    author: meta.author,
    year: meta.year,
    city: meta.city,
    printer: meta.printer,
    keywords: "",
    status: input.status,
    exportedAt: input.exportedAt,
    folioCount: meta.folioCount ?? input.folioCount,
    wordCount: meta.wordCount ?? input.wordCount,
  };

  entry.keywords = buildLibraryKeywords(entry);
  return entry;
}

export function buildLibraryEntryPayload(input: {
  baseName: string;
  sourceFileName: string;
  exportedAt: string;
  transcriptionText: string;
  manuscriptTitle?: string;
}): LibraryEntryPayload {
  const catalogEntry = buildLibraryCatalogEntry({
    ...input,
    status: "ok",
  });

  return {
    format: LIBRARY_ENTRY_FORMAT,
    ...catalogEntry,
    transcriptionText: input.transcriptionText,
  };
}

export function buildLibraryCatalog(
  entries: LibraryCatalogEntry[],
  outputDir: string,
): LibraryCatalog {
  const sorted = [...entries].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  return {
    format: LIBRARY_CATALOG_FORMAT,
    generatedAt: new Date().toISOString(),
    outputDir,
    entryCount: sorted.length,
    entries: sorted,
  };
}

function normalizeQuery(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesField(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return haystack.toLowerCase().includes(needle);
}

/** Filter catalog rows by author, year, and/or keywords (all non-empty filters are ANDed). */
export function filterLibraryEntries(
  entries: LibraryCatalogEntry[],
  filters: LibrarySearchFilters,
): LibraryCatalogEntry[] {
  const author = normalizeQuery(filters.author);
  const year = normalizeQuery(filters.year);
  const keywords = normalizeQuery(filters.keywords);

  if (!author && !year && !keywords) {
    return entries;
  }

  return entries.filter((entry) => {
    if (author && !matchesField(entry.author, author)) {
      return false;
    }
    if (year) {
      const yearHaystack = `${entry.year} ${entry.keywords}`.trim();
      if (!matchesField(yearHaystack, year)) {
        return false;
      }
    }
    if (keywords && !matchesField(entry.keywords, keywords)) {
      return false;
    }
    return true;
  });
}

export function countLibraryByStatus(entries: LibraryCatalogEntry[]): {
  ok: number;
  failed: number;
} {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].status === "ok") {
      ok++;
    } else {
      failed++;
    }
  }
  return { ok, failed };
}
