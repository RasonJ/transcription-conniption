/**
 * Witness-level initial tradition from {RMK:} identification (SPEC-ORNATE-INITIALS §3.2).
 */
import { extractLibraryMetadataFromRmk } from "@/utils/libraryCatalog";
import type { InitialTradition } from "./scene";

export interface WitnessRmkContext {
  isPrint: boolean;
  year: number | null;
  city: string;
  printer: string;
  shelfmark: string;
}

function parseYear(raw: string): number | null {
  const match = raw.match(/\d{3,4}/);
  if (!match) return null;
  const year = parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
}

function shelfmarkHint(transcriptionText: string): string {
  const mss = transcriptionText.match(/MSS\/[^\s}.]+/i);
  if (mss) return mss[0];
  const inc = transcriptionText.match(/INC\/[^\s}.]+/i);
  if (inc) return inc[0];
  return "";
}

export function witnessContextFromRmk(transcriptionText: string): WitnessRmkContext {
  const meta = extractLibraryMetadataFromRmk(transcriptionText);
  const year = parseYear(meta.year);
  const shelfmark = shelfmarkHint(transcriptionText);
  const isManuscriptShelf = /^MSS\//i.test(shelfmark);
  const hasPrinterImprint = Boolean(meta.printer && meta.city && year && year >= 1450);
  return {
    isPrint: hasPrinterImprint && !isManuscriptShelf,
    year,
    city: meta.city,
    printer: meta.printer,
    shelfmark,
  };
}

/**
 * Deterministic tradition for the whole witness.
 * Printed imprint (place | printer | date) → woodcut or incunable.
 * Empty imprint or MSS/ shelfmark → manuscript penwork.
 */
export function deriveTraditionFromRmk(transcriptionText: string): InitialTradition {
  const ctx = witnessContextFromRmk(transcriptionText);
  if (!ctx.isPrint) {
    return "ms.penwork";
  }
  const incunabula =
    /^INC\//i.test(ctx.shelfmark) || (ctx.year !== null && ctx.year > 0 && ctx.year <= 1500);
  if (incunabula) {
    return "print.incunable";
  }
  return "print.woodcut";
}

type TraditionMetadata = {
  imprint?: { city?: string; printer?: string; date?: string };
  witness?: { city?: string; library?: string; shelfmark?: string };
};

/**
 * Tradition for HTML/SVG export. Raw `{RMK:}` wins; otherwise the parsed imprint
 * and shelfmark are replayed through the same RMK rules.
 */
export function traditionForWitness(metadata: TraditionMetadata, sourceText?: string): InitialTradition {
  if (sourceText && /\{RMK\s*:/i.test(sourceText)) {
    return deriveTraditionFromRmk(sourceText);
  }
  const lines: string[] = [];
  const imprint = metadata.imprint;
  const imprintLine = [imprint?.city, imprint?.printer, imprint?.date].filter(Boolean).join(" | ");
  if (imprintLine) lines.push(`{RMK: ${imprintLine}}`);
  const witness = metadata.witness;
  if (witness?.shelfmark) lines.push(`{RMK: ${witness.shelfmark}}`);
  else if (witness?.city && witness.library) {
    lines.push(`{RMK: ${witness.city} | ${witness.library}}`);
  }
  return deriveTraditionFromRmk(lines.length ? lines.join("\n") : (sourceText ?? ""));
}
