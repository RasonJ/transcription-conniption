import type { ParsedManuscript } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { inferManuscriptTitle } from "@/utils/manuscriptTitle";

export const LIBRARY_CATALOG_FORMAT = "hsms-library-catalog/2";
export const LIBRARY_CATALOG_FORMAT_V1 = "hsms-library-catalog/1";
export const LIBRARY_ENTRY_FORMAT = "hsms-library-entry/2";
export const LIBRARY_ENTRY_FORMAT_V1 = "hsms-library-entry/1";

export type TitleSource = "rmk" | "filename" | "manual" | "override";

export type LibraryCatalogEntry = {
  id: string;
  hsmsId: string;
  baseName: string;
  sourceFileName: string;
  path: string;
  title: string;
  titleSource: TitleSource;
  author: string;
  authorUnknown: boolean;
  /** Display date string (may be empty). */
  date: string;
  /** Numeric year for sorting; null when unknown. */
  year: number | null;
  city: string;
  printer: string;
  repository: string;
  shelfmark: string;
  language: string;
  workId: string;
  partLabel?: string;
  partOrder?: number;
  keywords: string;
  status: "ok" | "failed";
  exportedAt: string;
  folioCount?: number;
  wordCount?: number;
};

/** @deprecated Alias — use LibraryCatalogEntry (v2). */
export type LibraryCatalogEntryV2 = LibraryCatalogEntry;

export type WorkGroup = {
  workId: string;
  title: string;
  author: string;
  authorUnknown: boolean;
  yearRange: string;
  primaryEntry: LibraryCatalogEntry;
  parts: LibraryCatalogEntry[];
  totalWords: number;
  totalFolios: number;
};

export type LibraryCatalog = {
  format: typeof LIBRARY_CATALOG_FORMAT | typeof LIBRARY_CATALOG_FORMAT_V1 | string;
  generatedAt: string;
  outputDir: string;
  entryCount: number;
  entries: LibraryCatalogEntry[];
};

export type LibraryEntryPayload = LibraryCatalogEntry & {
  format: typeof LIBRARY_ENTRY_FORMAT | typeof LIBRARY_ENTRY_FORMAT_V1 | string;
  transcriptionText: string;
};

const UNKNOWN_AUTHOR_RE = /^(desconocido|an[oó]nimo|unknown|\.?\s*desconocido)$/i;
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function cleanTitleCandidate(raw: string, hsmsId: string): string {
  const trimmed = raw.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "").trim();
  if (!trimmed || UNKNOWN_AUTHOR_RE.test(trimmed)) {
    return hsmsId ? `Untitled (${hsmsId})` : "Untitled";
  }
  return trimmed;
}

function parseYearNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/(\d{3,4})/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  // Reject implausible shelfmark-like "years" (e.g. 9247 from HSMS ids).
  if (!Number.isFinite(n) || n < 1000 || n > 2100) return null;
  return n;
}

function derivePartLabel(sourceFileName: string, baseName: string): string {
  const leaf = (sourceFileName.split(/[/\\]/).pop() ?? baseName)
    .replace(/\.txt$/i, "")
    .replace(/_/g, " ");
  return leaf.replace(/\s+/g, " ").trim();
}

function deriveWorkId(sourceFileName: string, baseName: string, title: string): string {
  const hay = `${title} ${sourceFileName} ${baseName}`;
  if (/celestina/i.test(hay)) return "celestina";
  const parts = sourceFileName.replace(/\\/g, "/").split("/");
  if (parts.length >= 2) {
    const dir = parts[0];
    const stem = parts[parts.length - 1]
      .replace(/\.txt$/i, "")
      .replace(/_\d+[a-z]?$/i, "")
      .replace(/\d+[a-z]?$/i, "");
    return `${dir}/${stem || baseName}`.toLowerCase();
  }
  return baseName.replace(/_+\d+[a-z]?$/i, "").toLowerCase() || baseName;
}

function deriveHsmsId(entry: Record<string, unknown>, baseName: string): string {
  if (typeof entry.hsmsId === "string" && entry.hsmsId.trim()) return entry.hsmsId.trim();
  if (typeof entry.author === "string" && /^HSMS-\d+/i.test(entry.author.trim())) {
    return entry.author.trim().toUpperCase();
  }
  const kw = typeof entry.keywords === "string" ? entry.keywords : "";
  const fromKw = kw.match(/\bhsms-\d+\b/i);
  if (fromKw) return fromKw[0].toUpperCase();
  return `HSMS-${baseName}`;
}

/** Upgrade legacy v1 (or partial) catalog entries to v2. */
export function upgradeCatalogEntryToV2(entry: Record<string, unknown>): LibraryCatalogEntry {
  if (
    typeof entry.titleSource === "string" &&
    typeof entry.workId === "string" &&
    typeof entry.hsmsId === "string" &&
    (typeof entry.year === "number" || entry.year === null) &&
    typeof entry.date === "string"
  ) {
    return entry as unknown as LibraryCatalogEntry;
  }

  const baseName = String(entry.baseName ?? entry.id ?? "unknown");
  const sourceFileName = String(entry.sourceFileName ?? baseName);
  const hsmsId = deriveHsmsId(entry, baseName);
  const rawAuthor = typeof entry.author === "string" ? entry.author.trim() : "";
  const authorIsHsmsId = /^HSMS-\d+/i.test(rawAuthor);
  const authorUnknown =
    !rawAuthor ||
    authorIsHsmsId ||
    UNKNOWN_AUTHOR_RE.test(rawAuthor);

  const rawTitle = typeof entry.title === "string" ? entry.title : "";
  const title = cleanTitleCandidate(rawTitle || baseName.replace(/_/g, " "), hsmsId);
  const titleSource: TitleSource =
    entry.titleSource === "rmk" ||
    entry.titleSource === "filename" ||
    entry.titleSource === "manual" ||
    entry.titleSource === "override"
      ? entry.titleSource
      : rawTitle && !UNKNOWN_AUTHOR_RE.test(rawTitle.replace(/^[\s.]+/, ""))
        ? "rmk"
        : "filename";

  const yearLegacy = entry.year;
  const year =
    typeof yearLegacy === "number"
      ? yearLegacy
      : parseYearNumber(typeof yearLegacy === "string" ? yearLegacy : entry.date);
  const date =
    typeof entry.date === "string" && entry.date.trim()
      ? entry.date.trim()
      : year !== null
        ? String(year)
        : typeof yearLegacy === "string"
          ? yearLegacy
          : "";

  const city = typeof entry.city === "string" ? entry.city : "";
  const printer = typeof entry.printer === "string" ? entry.printer : "";
  const repository =
    typeof entry.repository === "string" && entry.repository
      ? entry.repository
      : printer && /biblioteca|library|archivo|national/i.test(printer)
        ? printer
        : "";

  const workId =
    typeof entry.workId === "string" && entry.workId
      ? entry.workId
      : deriveWorkId(sourceFileName, baseName, title);
  const partLabel =
    typeof entry.partLabel === "string" && entry.partLabel
      ? entry.partLabel
      : derivePartLabel(sourceFileName, baseName);

  return {
    id: String(entry.id ?? baseName),
    hsmsId,
    baseName,
    sourceFileName,
    path: typeof entry.path === "string" ? entry.path : sourceFileName,
    title,
    titleSource,
    author: authorUnknown ? "Author unknown" : rawAuthor,
    authorUnknown,
    date,
    year,
    city,
    printer: repository && printer === repository ? "" : printer,
    repository,
    shelfmark: typeof entry.shelfmark === "string" ? entry.shelfmark : "",
    language: typeof entry.language === "string" ? entry.language : "osp",
    workId,
    partLabel,
    partOrder: typeof entry.partOrder === "number" ? entry.partOrder : undefined,
    keywords: typeof entry.keywords === "string" ? entry.keywords : "",
    status: entry.status === "failed" ? "failed" : "ok",
    exportedAt:
      typeof entry.exportedAt === "string" ? entry.exportedAt : new Date().toISOString(),
    folioCount: typeof entry.folioCount === "number" ? entry.folioCount : undefined,
    wordCount: typeof entry.wordCount === "number" ? entry.wordCount : undefined,
  };
}

/** Normalize a catalog blob (v1 or v2) to v2 entries. */
export function normalizeLibraryCatalog(raw: {
  format?: string;
  generatedAt?: string;
  outputDir?: string;
  entryCount?: number;
  entries?: unknown[];
}): LibraryCatalog {
  const entries = (raw.entries ?? []).map((e) =>
    upgradeCatalogEntryToV2((e ?? {}) as Record<string, unknown>),
  );
  // Assign partOrder within each workId using natural sort of partLabel.
  const byWork = new Map<string, LibraryCatalogEntry[]>();
  for (const e of entries) {
    const list = byWork.get(e.workId) ?? [];
    list.push(e);
    byWork.set(e.workId, list);
  }
  for (const parts of byWork.values()) {
    parts.sort((a, b) =>
      naturalCollator.compare(a.partLabel || a.title, b.partLabel || b.title),
    );
    parts.forEach((p, i) => {
      p.partOrder = i;
    });
  }

  return {
    format: LIBRARY_CATALOG_FORMAT,
    generatedAt: raw.generatedAt ?? new Date().toISOString(),
    outputDir: raw.outputDir ?? "",
    entryCount: entries.length,
    entries,
  };
}

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
): {
  author: string;
  title: string;
  year: string;
  city: string;
  printer: string;
} {
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
): {
  author: string;
  title: string;
  year: string;
  city: string;
  printer: string;
  folioCount?: number;
  wordCount?: number;
  titleSource: TitleSource;
} {
  const parsed: ParsedManuscript = compileManuscriptTree(transcriptionText);
  const { metadata, stats, folios } = parsed;
  const fromRmk = Boolean(metadata.title?.trim());
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
    titleSource: options?.manuscriptTitle?.trim()
      ? "manual"
      : fromRmk
        ? "rmk"
        : "filename",
  };
}

export function buildLibraryKeywords(
  fields: Pick<
    LibraryCatalogEntry,
    "author" | "title" | "date" | "city" | "printer" | "repository" | "baseName" | "sourceFileName" | "hsmsId"
  >,
): string {
  return [
    fields.hsmsId,
    fields.author,
    fields.title,
    fields.date,
    fields.city,
    fields.printer,
    fields.repository,
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
          titleSource: "filename" as TitleSource,
        };

  const draft = {
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
    titleSource: meta.titleSource,
  };

  const entry = upgradeCatalogEntryToV2(draft);
  entry.titleSource = meta.titleSource;
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
    if (author && !matchesField(entry.author, author) && !matchesField(entry.hsmsId, author)) {
      return false;
    }
    if (year) {
      const yearHaystack = `${entry.date} ${entry.year ?? ""} ${entry.keywords}`.trim();
      if (!matchesField(yearHaystack, year)) {
        return false;
      }
    }
    if (
      keywords &&
      !matchesField(entry.keywords, keywords) &&
      !matchesField(entry.title, keywords) &&
      !matchesField(entry.workId, keywords)
    ) {
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
