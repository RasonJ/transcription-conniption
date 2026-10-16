import type { ParsedManuscript } from "../../../constants/manuscript";
import { detectWitnessLanguage, foldForSearch, type WitnessLanguage } from "../../witnessLanguage";
import type { LineRecord } from "../lineIndex";
import type { EvidenceRow, RecipeContext } from "../types";

export const ROW_LIMIT = 50;
const SNIPPET_MAX = 72;

export function plural(n: number, one: string, other: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : other}`;
}

export function snippet(text: string, max = SNIPPET_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function lineRow(line: LineRecord, label: string, detail?: string): EvidenceRow {
  return {
    folioId: line.folioId,
    lineNumber: line.lineNumber,
    label,
    detail: snippet(detail ?? line.diplomatic),
  };
}

/** Diplomatic word lowercased for pattern tests; legacy marks kept. */
export function lowerDiplomatic(word: string): string {
  return word.toLowerCase();
}

/** Reading form for counting and lexical matching: accents folded, edge punctuation stripped. */
export function readingKey(word: string): string {
  return foldForSearch(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function witnessLanguageOf(ctx: RecipeContext): WitnessLanguage {
  return ctx.witnessLanguage ?? detectWitnessLanguage(ctx.parsed).language;
}

/** Key–word–in–context around word `i` of `words` (±radius). */
export function kwic(words: readonly string[], i: number, radius = 5): string {
  const lo = Math.max(0, i - radius);
  const hi = Math.min(words.length, i + radius + 1);
  return `${words.slice(lo, i).join(" ")} [${words[i]}] ${words.slice(i + 1, hi).join(" ")}`.trim();
}

export function pct(part: number, whole: number): string {
  return whole === 0 ? "0.0" : ((part / whole) * 100).toFixed(1);
}

export function folioCount(parsed: ParsedManuscript): number {
  return parsed.folios.length;
}
