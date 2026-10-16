const RE_EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Lowercase, strip combining marks and edge punctuation. */
export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(RE_EDGE_PUNCT, "");
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
