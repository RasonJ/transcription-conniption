/**
 * Statistical (Tier C) recipes over the word stream of one witness or the batch registry
 * (SPEC-COPILOT §9.3). Lemmas come from the lazy HSMS dictionary when it is loaded; until
 * then surface forms are used and the answer says so.
 */
import type { ParsedManuscript } from "../../../constants/manuscript";
import { isLemmaDictionaryReady, lookupHsmsLemma } from "../../hsmsDictionary";
import { stopwordsFor } from "../../witnessLanguage";
import { collocates, spellingSkeleton, topNgrams, zipfSlope } from "../corpusStats";
import { getLineIndex, isBodyLine } from "../lineIndex";
import { inferQuires } from "../quires";
import { wordStats } from "../stats";
import type { BreakdownEntry, EvidenceRow, RecipeContext, RecipeResult, RegistryWitness } from "../types";
import { ROW_LIMIT, kwic, lineRow, plural, readingKey, witnessLanguageOf } from "./common";

function bodyWords(parsed: ParsedManuscript): Array<{ key: string; folioIndex: number }> {
  const out: Array<{ key: string; folioIndex: number }> = [];
  for (const line of getLineIndex(parsed)) {
    if (!isBodyLine(line)) continue;
    for (const w of line.words) {
      if (w.lang && w.lang !== "SPN" && w.lang !== "PRT" && w.lang !== "GAL" && w.lang !== "CAT") continue;
      const k = readingKey(w.reading);
      if (k && /\p{L}/u.test(k)) out.push({ key: k, folioIndex: line.folioIndex });
    }
  }
  return out;
}

function lemmaOf(surface: string): string {
  return lookupHsmsLemma(surface) ?? surface;
}

/** `stats.ttr_hapax`: TTR, STTR per 1,000 tokens, hapax and dis legomena, per quire. */
export function ttrHapax(ctx: RecipeContext): RecipeResult {
  if (ctx.registry?.length) return registryTtr(ctx.registry);
  const words = bodyWords(ctx.parsed);
  const all = wordStats(words.map((w) => w.key));
  const quires = inferQuires(ctx.parsed, ctx.collation);
  const breakdown: BreakdownEntry[] = [];
  if (quires.count > 1) {
    for (let q = 1; q <= quires.count; q++) {
      const qw = words.filter((w) => (quires.quireOfFolio[w.folioIndex] ?? 1) === q).map((w) => w.key);
      if (!qw.length) continue;
      const s = wordStats(qw);
      breakdown.push({
        label: `Q${q}: ${s.tokens} tokens · TTR ${s.ttr.toFixed(3)} · hapax ${s.hapax}`,
        value: s.tokens,
        key: "quire_ttr",
        labelParams: { quire: q, tokens: s.tokens, ttr: s.ttr.toFixed(3), hapax: s.hapax },
      });
    }
  }
  return {
    headline: `${all.tokens} tokens, ${all.types} types: TTR ${all.ttr.toFixed(3)}, STTR/1000 ${all.sttr.toFixed(3)}, ${all.hapax} hapax and ${all.disLegomena} dis legomena. Raw TTR falls as texts grow; compare witnesses with STTR.`,
    params: {
      tokens: all.tokens,
      types: all.types,
      ttr: all.ttr.toFixed(3),
      sttr: all.sttr.toFixed(3),
      hapax: all.hapax,
      dis: all.disLegomena,
    },
    count: all.types,
    breakdown,
    rows: [],
  };
}

function registryTtr(registry: RegistryWitness[]): RecipeResult {
  const breakdown: BreakdownEntry[] = registry.map((w) => {
    const s = wordStats(bodyWords(w.parsed).map((x) => x.key));
    return {
      label: `${w.name}: STTR ${s.sttr.toFixed(3)} · ${s.tokens} tokens · hapax ${s.hapax}`,
      value: s.tokens,
      key: "witness_ttr",
      labelParams: { name: w.name, sttr: s.sttr.toFixed(3), tokens: s.tokens, hapax: s.hapax },
    };
  });
  return {
    headline: `Type-token statistics for ${plural(registry.length, "witness", "witnesses")} in the batch (STTR per 1,000 tokens).`,
    params: { witnesses: registry.length },
    messageKey: "registry",
    count: registry.length,
    breakdown,
    rows: [],
  };
}

/** `stats.top_lemmas`: most frequent lemmas without function words. */
export function topLemmas(ctx: RecipeContext, top = 50): RecipeResult {
  const stop = stopwordsFor(witnessLanguageOf(ctx));
  const counts = new Map<string, number>();
  for (const w of bodyWords(ctx.parsed)) {
    const lemma = lemmaOf(w.key);
    if (lemma.length < 2 || stop.has(lemma) || stop.has(w.key)) continue;
    counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  const lemmatized = isLemmaDictionaryReady();
  return {
    headline: `Top ${ranked.length} ${lemmatized ? "lemmas" : "word forms (lemma dictionary still loading)"} excluding function words.`,
    params: { top: ranked.length },
    messageKey: lemmatized ? undefined : "surfaceForms",
    count: ranked.length,
    breakdown: ranked.map(([label, value]) => ({ label, value })),
    rows: [],
  };
}

/** `stats.variant_share`: spelling variants of a lemma (fazer / facer / façer) with shares. */
export function variantShare(ctx: RecipeContext, lemma: string | undefined): RecipeResult {
  const target = readingKey(lemma ?? "");
  if (!target) {
    return { headline: "Which lemma? Put it in quotes, e.g. \"fazer\".", params: {}, messageKey: "needWord", count: 0, rows: [] };
  }
  const skel = spellingSkeleton(target);
  const forms = new Map<string, { n: number; line?: ReturnType<typeof getLineIndex>[number]; diplomatic: string }>();
  for (const line of getLineIndex(ctx.parsed)) {
    for (const w of line.words) {
      const k = readingKey(w.reading);
      if (!k) continue;
      const matches = lemmaOf(k) === target || spellingSkeleton(w.diplomatic) === skel || spellingSkeleton(k) === skel;
      if (!matches) continue;
      const key = w.diplomatic
        .toLowerCase()
        .replace(/<[^>]*>/g, "")
        .replace(/^[^\p{L}]+|[^\p{L}~'@^#`]+$/gu, "");
      const e = forms.get(key) ?? { n: 0, line, diplomatic: w.diplomatic };
      e.n++;
      forms.set(key, e);
    }
  }
  const total = [...forms.values()].reduce((n, e) => n + e.n, 0);
  const ranked = [...forms.entries()].sort((a, b) => b[1].n - a[1].n);
  return {
    headline: `${plural(total, "occurrence")} of “${lemma}” in ${plural(ranked.length, "spelling")}: ${ranked.slice(0, 6).map(([f, e]) => `${f} ${((e.n / Math.max(1, total)) * 100).toFixed(1)}%`).join(", ")}.`,
    params: { total, lemma: lemma ?? "", spellings: ranked.length },
    count: total,
    breakdown: ranked.map(([f, e]) => ({ label: `${f} (${((e.n / Math.max(1, total)) * 100).toFixed(1)}%)`, value: e.n })),
    rows: ranked.slice(0, ROW_LIMIT).flatMap(([f, e]) => (e.line ? [lineRow(e.line, f, e.diplomatic)] : [])),
  };
}

/** `stats.zipf`: rank–frequency slope (log-log) over the top 200 types. */
export function zipf(ctx: RecipeContext): RecipeResult {
  const counts = new Map<string, number>();
  for (const w of bodyWords(ctx.parsed)) counts.set(w.key, (counts.get(w.key) ?? 0) + 1);
  const { slope, points } = zipfSlope([...counts.values()]);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  return {
    headline: `Zipf slope ${slope.toFixed(2)} over the top ${points.length} types (≈ −1 is typical of natural text).`,
    params: { slope: slope.toFixed(2), points: points.length },
    count: points.length,
    breakdown: ranked.map(([label, value], i) => ({ label: `${i + 1}. ${label}`, value })),
    rows: [],
  };
}

/** `colloc.window`: collocates of a word within ±window (PMI, t-score, G²; min co-occurrence 3). */
export function collocations(ctx: RecipeContext, word: string | undefined, window = 5, minFrequency = 3): RecipeResult {
  const node = readingKey(word ?? "");
  if (!node) {
    return { headline: "Which word? Put it in quotes, e.g. \"rey\".", params: {}, messageKey: "needWord", count: 0, rows: [] };
  }
  const nodeLemma = lemmaOf(node);
  const tokens = bodyWords(ctx.parsed).map((w) => w.key);
  const stop = stopwordsFor(witnessLanguageOf(ctx));
  const scores = collocates(tokens, (w) => w === node || lemmaOf(w) === nodeLemma, {
    window,
    minFrequency,
    exclude: stop,
  }).slice(0, 25);
  const breakdown: BreakdownEntry[] = scores.map((s) => ({
    label: `${s.word}: n=${s.observed} · PMI ${s.pmi.toFixed(2)} · t ${s.tScore.toFixed(2)} · G² ${s.logLikelihood.toFixed(1)}`,
    value: s.observed,
    key: "collocate",
    labelParams: { word: s.word, n: s.observed, pmi: s.pmi.toFixed(2), t: s.tScore.toFixed(2), g2: s.logLikelihood.toFixed(1) },
  }));
  // KWIC examples for the node.
  const rows: EvidenceRow[] = [];
  for (const line of getLineIndex(ctx.parsed)) {
    const words = line.words.map((w) => readingKey(w.reading));
    words.forEach((w, i) => {
      if ((w === node || lemmaOf(w) === nodeLemma) && rows.length < ROW_LIMIT) rows.push(lineRow(line, w, kwic(words, i, window)));
    });
  }
  return {
    headline: `${plural(scores.length, "collocate")} of “${word}” within ±${window} words (ranked by log-likelihood; pairs seen fewer than ${minFrequency} times are dropped because PMI overrates rare pairs).`,
    params: { collocates: scores.length, word: word ?? "", window, min: minFrequency },
    count: scores.length,
    breakdown,
    rows,
  };
}

/** `ngrams.top`: most frequent n-grams that do not cross folio boundaries. */
export function ngrams(ctx: RecipeContext, n = 3, top = 50): RecipeResult {
  const stop = stopwordsFor(witnessLanguageOf(ctx));
  const byFolio = new Map<number, string[]>();
  for (const w of bodyWords(ctx.parsed)) {
    const list = byFolio.get(w.folioIndex) ?? [];
    list.push(w.key);
    byFolio.set(w.folioIndex, list);
  }
  const grams = topNgrams([...byFolio.values()], n, top, (g) => g.every((w) => stop.has(w)));
  return {
    headline: `Top ${grams.length} recurring ${n}-grams (sequences made only of function words skipped; none cross a folio break).`,
    params: { count: grams.length, n },
    count: grams.length,
    breakdown: grams.map((g) => ({ label: g.gram, value: g.count })),
    rows: [],
  };
}

/** `compare.diachronic` / `compare.genre`: a metric across batch witnesses grouped by date or genre. */
export function compareRegistry(ctx: RecipeContext, by: "decade" | "century" | "genre"): RecipeResult {
  const registry = ctx.registry ?? [];
  const usable = registry.filter((w) => (by === "genre" ? w.genre : w.year));
  if (usable.length < 2) {
    return {
      headline:
        by === "genre"
          ? "Needs at least two batch witnesses with a genre. Load a batch, or use server processing for the full corpus."
          : "Needs at least two batch witnesses with dates. Load a batch, or use server processing for the full corpus.",
      params: { witnesses: usable.length },
      messageKey: by === "genre" ? "needGenre" : "needDates",
      needsServer: "Cross-corpus comparison over the full OSTA corpus runs on the server.",
      count: 0,
      rows: [],
    };
  }
  const groups = new Map<string, { tokens: number; types: Set<string>; nTilde: number; nn: number }>();
  for (const w of usable) {
    const key = by === "genre" ? w.genre! : by === "century" ? `${Math.floor((w.year! - 1) / 100) + 1}th c.` : `${Math.floor(w.year! / 10) * 10}s`;
    const g = groups.get(key) ?? { tokens: 0, types: new Set<string>(), nTilde: 0, nn: 0 };
    for (const line of getLineIndex(w.parsed)) {
      if (!isBodyLine(line)) continue;
      for (const word of line.words) {
        const k = readingKey(word.reading);
        if (!k) continue;
        g.tokens++;
        g.types.add(k);
        const d = word.diplomatic.toLowerCase();
        if (/n~|ñ/.test(d)) g.nTilde++;
        if (/nn/.test(d)) g.nn++;
      }
    }
    groups.set(key, g);
  }
  const breakdown: BreakdownEntry[] = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, g]) => ({
      label: `${key}: ${g.tokens} tokens · lexical density ${(g.types.size / Math.max(1, g.tokens)).toFixed(3)} · nn/(nn+n~) ${(g.nn / Math.max(1, g.nn + g.nTilde)).toFixed(2)}`,
      value: g.tokens,
      key: "group_metric",
      labelParams: { group: key, tokens: g.tokens, density: (g.types.size / Math.max(1, g.tokens)).toFixed(3), nnRatio: (g.nn / Math.max(1, g.nn + g.nTilde)).toFixed(2) },
    }));
  return {
    headline: `${plural(usable.length, "witness", "witnesses")} grouped by ${by}: lexical density and nn vs n~ ratio per group.`,
    params: { witnesses: usable.length, by },
    count: usable.length,
    breakdown,
    rows: [],
  };
}
