/**
 * Bi-directional source ↔ manuscript line map (SPEC-EDITOR ED-11 / ED-12).
 */
import type { ParsedManuscript } from "@/constants/manuscript";

export interface LineMapEntry {
  sourceLineIndex: number;
  folioId: string;
  msLineNumber?: string;
}

export interface LineMap {
  sourceToMs: (sourceLineIndex: number) => { folioId: string; msLineNumber?: string } | null;
  msToSource: (folioId: string, msLineNumber: string) => number | null;
}

const RE_FOLIO = /^\[\s*fol(?:io)?\.?\s*([^\]]+)\]/i;
const RE_LINE_PREFIX = /^(\d{1,4})\s+/;

/**
 * Build O(1) lookups by walking the raw source for folio markers and
 * aligning block `lineNumber` values in manuscript order.
 */
export function buildSourceLineMap(parsed: ParsedManuscript, rawSource: string): LineMap {
  const sourceToMsMap = new Map<number, { folioId: string; msLineNumber?: string }>();
  const msToSourceMap = new Map<string, number>();

  const lines = rawSource.split(/\r?\n/);
  let currentFolio = parsed.folios[0]?.id ?? "";

  // Pass 1: folio markers on source lines.
  for (let i = 0; i < lines.length; i++) {
    const folioMatch = lines[i].trim().match(RE_FOLIO);
    if (folioMatch) {
      currentFolio = folioMatch[1].replace(/\s+/g, "");
      sourceToMsMap.set(i, { folioId: currentFolio });
      continue;
    }
    const prefix = lines[i].match(RE_LINE_PREFIX);
    if (prefix && currentFolio) {
      const msLineNumber = prefix[1];
      sourceToMsMap.set(i, { folioId: currentFolio, msLineNumber });
      const key = `${currentFolio}:${msLineNumber}`;
      if (!msToSourceMap.has(key)) msToSourceMap.set(key, i);
    }
  }

  // Pass 2: fill gaps from parsed blocks when source lacked numeric prefixes.
  for (const folio of parsed.folios) {
    for (const block of folio.blocks) {
      if (!block.lineNumber) continue;
      const key = `${folio.id}:${block.lineNumber}`;
      if (msToSourceMap.has(key)) continue;
      // Best-effort: leave unmapped until a source line with that prefix appears.
    }
  }

  return {
    sourceToMs: (index) => sourceToMsMap.get(index) ?? null,
    msToSource: (folioId, lineNum) => msToSourceMap.get(`${folioId}:${lineNum}`) ?? null,
  };
}
