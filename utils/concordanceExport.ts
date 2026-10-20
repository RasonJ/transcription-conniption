/**
 * KWIC concordance as CSV (SPEC-CONCORDANCE-LANGUAGE LEX-P3).
 */
import type { ConcordanceIndex } from "@/constants/manuscript";

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function concordanceToCsv(index: ConcordanceIndex, methodLine: string): string {
  const header = ["lemma", "count", "folio", "line", "pre", "keyword", "post"];
  const rows: string[] = [header.join(",")];
  const lemmas = Object.keys(index).sort((a, b) => a.localeCompare(b));
  for (const lemma of lemmas) {
    const entry = index[lemma];
    if (!entry) continue;
    for (const occ of entry.occurrences) {
      rows.push(
        [
          csvCell(lemma),
          csvCell(entry.count),
          csvCell(occ.folioId),
          csvCell(occ.lineNumber ?? ""),
          csvCell(occ.preContext),
          csvCell(occ.keyword),
          csvCell(occ.postContext),
        ].join(","),
      );
    }
  }
  if (methodLine) rows.push(`# ${methodLine.replace(/\n/g, " ")}`);
  return rows.join("\n");
}
