import type { ParsedManuscript } from "../../constants/manuscript";
import { getLineIndex } from "./lineIndex";

const RE_EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Lowercase, strip combining marks and edge punctuation. */
export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(RE_EDGE_PUNCT, "");
}

export interface WordOccurrenceResult {
  count: number;
  folioCount: number;
  byFolio: Record<string, number>;
}

/** Exact token count for a surface form (accents folded). */
export function countWordOccurrences(
  manuscript: ParsedManuscript,
  targetWord: string,
): WordOccurrenceResult {
  const needle = normalizeWord(targetWord);
  const byFolio: Record<string, number> = {};
  let totalCount = 0;
  if (!needle) return { count: 0, folioCount: 0, byFolio };

  for (const line of getLineIndex(manuscript)) {
    for (const w of line.words) {
      if (normalizeWord(w.reading) !== needle) continue;
      totalCount++;
      byFolio[line.folioId] = (byFolio[line.folioId] ?? 0) + 1;
    }
  }

  return {
    count: totalCount,
    folioCount: Object.keys(byFolio).length,
    byFolio,
  };
}

export interface KwicMatch {
  folioId: string;
  lineNumber?: string;
  prefix: string;
  keyword: string;
  suffix: string;
}

/** KWIC rows for a surface form (accents folded). */
export function buildKwicConcordance(
  manuscript: ParsedManuscript,
  targetWord: string,
  windowSize: number = 5,
): KwicMatch[] {
  const needle = normalizeWord(targetWord);
  const matches: KwicMatch[] = [];
  if (!needle) return matches;

  for (const line of getLineIndex(manuscript)) {
    const readings = line.words.map((w) => w.reading);
    readings.forEach((w, i) => {
      if (normalizeWord(w) !== needle) return;
      const lo = Math.max(0, i - windowSize);
      const hi = Math.min(readings.length, i + 1 + windowSize);
      matches.push({
        folioId: line.folioId,
        lineNumber: line.lineNumber,
        prefix: readings.slice(lo, i).join(" "),
        keyword: line.words[i].diplomatic || targetWord,
        suffix: readings.slice(i + 1, hi).join(" "),
      });
    });
  }
  return matches;
}

export function frequencyMap(words: readonly string[], normalize: boolean = true): Map<string, number> {
  const freq = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const w = normalize ? normalizeWord(words[i]) : words[i];
    if (!w) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

/** Types / tokens. Raw TTR falls as texts grow; prefer `standardizedTtr` across witnesses. */
export function typeTokenRatio(words: readonly string[]): number {
  const freq = frequencyMap(words);
  let tokens = 0;
  freq.forEach((n) => {
    tokens += n;
  });
  return tokens === 0 ? 0 : freq.size / tokens;
}

/** Number of word types occurring exactly once. */
export function hapaxCount(words: readonly string[]): number {
  return countWithFrequency(frequencyMap(words), 1);
}

export function disLegomenaCount(words: readonly string[]): number {
  return countWithFrequency(frequencyMap(words), 2);
}

function countWithFrequency(freq: Map<string, number>, n: number): number {
  let count = 0;
  freq.forEach((v) => {
    if (v === n) count++;
  });
  return count;
}

/** Mean TTR over consecutive full windows (default 1,000 tokens); falls back to raw TTR when shorter. */
export function standardizedTtr(words: readonly string[], window: number = 1000): number {
  if (words.length < window) return typeTokenRatio(words);
  let sum = 0;
  let windows = 0;
  for (let start = 0; start + window <= words.length; start += window) {
    sum += typeTokenRatio(words.slice(start, start + window));
    windows++;
  }
  return sum / windows;
}

export interface WordStats {
  tokens: number;
  types: number;
  ttr: number;
  sttr: number;
  hapax: number;
  disLegomena: number;
}

export function wordStats(words: readonly string[]): WordStats {
  const freq = frequencyMap(words);
  let tokens = 0;
  freq.forEach((n) => {
    tokens += n;
  });
  return {
    tokens,
    types: freq.size,
    ttr: tokens === 0 ? 0 : freq.size / tokens,
    sttr: standardizedTtr(words),
    hapax: countWithFrequency(freq, 1),
    disLegomena: countWithFrequency(freq, 2),
  };
}
