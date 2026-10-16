/**
 * Voyant-inspired distant-reading recipes on the local FacetIndex word stream.
 * Tier A — no network; uses concordance-ready surfaces + stats helpers.
 */
import type { ParsedManuscript } from "../../../constants/manuscript";
import type { FacetIndex } from "../facetIndex";
import {
  frequencyMap,
  hapaxCount,
  normalizeWord,
  typeTokenRatio,
  wordStats,
} from "../stats";
import type { EvidenceRow, RecipeResult } from "../types";
import { ROW_LIMIT } from "./tierA";

const TOP_N = 25;

function surfaces(facets: FacetIndex): string[] {
  return facets.words.surfaces;
}

function folioIdAt(facets: FacetIndex, wordIndex: number): string {
  const fi = facets.words.folioIndex[wordIndex] ?? 0;
  return facets.folioIds[fi] ?? String(fi);
}

/** `corpus.term_frequency` — top surface frequencies (Cirrus-style). */
export function termFrequency(facets: FacetIndex, _parsed: ParsedManuscript): RecipeResult {
  const words = surfaces(facets);
  const freq = frequencyMap(words);
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N);

  const rows: EvidenceRow[] = ranked.map(([term, count]) => {
    const idx = words.findIndex((w) => normalizeWord(w) === term);
    return {
      folioId: idx >= 0 ? folioIdAt(facets, idx) : facets.folioIds[0] ?? "?",
      label: String(count),
      detail: term,
    };
  });

  const total = words.length;
  const top = ranked[0];
  return {
    headline: top
      ? `Top term “${top[0]}” ×${top[1]} (${freq.size} types / ${total} tokens).`
      : "No indexable words in this witness.",
    params: top ? { term: top[0], n: top[1], types: freq.size, tokens: total } : {},
    messageKey: top ? undefined : "none",
    count: freq.size,
    breakdown: ranked.slice(0, 12).map(([label, value]) => ({ label, value })),
    rows,
  };
}

/** `corpus.ngrams` — contiguous n-gram frequencies (default bigrams). */
export function ngrams(
  facets: FacetIndex,
  _parsed: ParsedManuscript,
  n = 2,
): RecipeResult {
  const size = Math.max(2, Math.min(5, Math.floor(n) || 2));
  const words = surfaces(facets).map(normalizeWord).filter(Boolean);
  const counts = new Map<string, number>();
  for (let i = 0; i + size <= words.length; i++) {
    const gram = words.slice(i, i + size).join(" ");
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N);

  return {
    headline:
      ranked.length === 0
        ? `No ${size}-grams found.`
        : `Top ${size}-gram “${ranked[0][0]}” ×${ranked[0][1]} (${counts.size} distinct).`,
    params: ranked.length === 0 ? { size } : { size, gram: ranked[0][0], n: ranked[0][1], distinct: counts.size },
    messageKey: ranked.length === 0 ? "none" : undefined,
    count: counts.size,
    breakdown: ranked.slice(0, 12).map(([label, value]) => ({ label, value })),
    rows: ranked.slice(0, ROW_LIMIT).map(([gram, count]) => ({
      folioId: facets.folioIds[0] ?? "?",
      label: String(count),
      detail: gram,
    })),
  };
}

/** `corpus.vocab_density` — TTR / hapax / STTR and per-folio type density. */
export function vocabDensity(facets: FacetIndex, _parsed: ParsedManuscript): RecipeResult {
  const words = surfaces(facets);
  const stats = wordStats(words);
  const byFolio = new Map<string, string[]>();
  for (let i = 0; i < words.length; i++) {
    const id = folioIdAt(facets, i);
    const list = byFolio.get(id) ?? [];
    list.push(words[i]);
    byFolio.set(id, list);
  }

  const folioRows: EvidenceRow[] = [...byFolio.entries()]
    .map(([folioId, folioWords]) => {
      const ttr = typeTokenRatio(folioWords);
      const hapax = hapaxCount(folioWords);
      return {
        folioId,
        label: `TTR ${ttr.toFixed(3)}`,
        detail: `${folioWords.length} tokens · ${hapax} hapax`,
        ttr,
      };
    })
    .sort((a, b) => b.ttr - a.ttr)
    .slice(0, ROW_LIMIT)
    .map(({ folioId, label, detail }) => ({ folioId, label, detail }));

  const hapaxShare = stats.tokens === 0 ? 0 : (stats.hapax / stats.tokens) * 100;

  return {
    headline: `Vocabulary density: TTR ${stats.ttr.toFixed(3)}, STTR ${stats.sttr.toFixed(3)}, hapax ${stats.hapax} (${hapaxShare.toFixed(1)}% of tokens).`,
    params: { ttr: stats.ttr.toFixed(3), sttr: stats.sttr.toFixed(3), hapax: stats.hapax, share: hapaxShare.toFixed(1) },
    count: stats.types,
    breakdown: [
      { label: "tokens", value: stats.tokens, key: "tokens" },
      { label: "types", value: stats.types, key: "types" },
      { label: "hapax", value: stats.hapax, key: "hapax" },
      { label: "dislegomena", value: stats.disLegomena, key: "dislegomena" },
    ],
    rows: folioRows,
  };
}
