/**
 * Multi-part work aggregation (SPEC-LIBRARY LIB-4 / LIB-11).
 */
import type { LibraryCatalogEntry, WorkGroup } from "./libraryCatalog";

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function partSortKey(entry: LibraryCatalogEntry): string {
  return entry.partLabel || entry.title || entry.baseName;
}

/** Groups individual witness files into works (e.g. Celestina parts). */
export function groupCatalogEntriesIntoWorks(entries: LibraryCatalogEntry[]): WorkGroup[] {
  const groupsMap = new Map<string, LibraryCatalogEntry[]>();

  for (const entry of entries) {
    const key = entry.workId || entry.id;
    let list = groupsMap.get(key);
    if (!list) {
      list = [];
      groupsMap.set(key, list);
    }
    list.push(entry);
  }

  const workGroups: WorkGroup[] = [];

  for (const [workId, parts] of groupsMap.entries()) {
    parts.sort((a, b) => {
      const orderA = a.partOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.partOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return naturalCollator.compare(partSortKey(a), partSortKey(b));
    });

    const primary = parts[0];
    const totalWords = parts.reduce((sum, p) => sum + (p.wordCount || 0), 0);
    const totalFolios = parts.reduce((sum, p) => sum + (p.folioCount || 0), 0);

    const years = parts.map((p) => p.year).filter((y): y is number => y !== null && y !== undefined);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const yearRange = minYear
      ? minYear === maxYear
        ? `${minYear}`
        : `${minYear}–${maxYear}`
      : primary.date || "";

    workGroups.push({
      workId,
      title: primary.title.replace(/\s*\([^)]*\)\s*$/, "").trim() || primary.title,
      author: primary.author,
      authorUnknown: primary.authorUnknown,
      yearRange,
      primaryEntry: primary,
      parts,
      totalWords,
      totalFolios,
    });
  }

  return workGroups.sort((a, b) => naturalCollator.compare(a.title, b.title));
}
