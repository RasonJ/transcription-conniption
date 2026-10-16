/**
 * Heuristic (Tier B) recipes: pattern matching over diplomatic surfaces and closed word
 * lists (SPEC-COPILOT §4). Precision varies by witness, so every answer leads with examples.
 */
import { getLineIndex, isBodyLine, type LineRecord } from "../lineIndex";
import { inferQuires } from "../quires";
import {
  CLITICS_STANDALONE,
  CONTRACTIONS,
  ELIDED_CLITICS,
  ENCLITICS,
  GRAPH_SETS,
  GREEK_FORMULAS,
  LATINATE_DOUBLETS,
  ROMAN_NUMERAL_RE,
  SUBORDINATORS,
} from "../graphPatterns";
import type { BreakdownEntry, EvidenceRow, RecipeContext, RecipeResult } from "../types";
import { stopwordsFor } from "../../witnessLanguage";
import { ROW_LIMIT, kwic, lineRow, lowerDiplomatic, plural, readingKey, witnessLanguageOf } from "./common";

/** Graph-set distribution, optionally grouped by quire (`group = quire`). */
export function graphSet(ctx: RecipeContext, setId: string, options: { byQuire?: boolean } = {}): RecipeResult {
  const set = GRAPH_SETS[setId];
  if (!set) return { headline: `Unknown graph set ${setId}.`, count: 0, rows: [] };
  const lines = getLineIndex(ctx.parsed);
  const quires = options.byQuire ? inferQuires(ctx.parsed, ctx.collation) : null;
  const totals = new Map<string, number>();
  const perQuire = new Map<string, number>();
  const rowsByVariant = new Map<string, EvidenceRow[]>();
  for (const line of lines) {
    if (!isBodyLine(line)) continue;
    for (const w of line.words) {
      if (w.lang && w.lang !== "SPN" && w.lang !== "PRT" && w.lang !== "GAL" && w.lang !== "CAT") continue;
      const d = lowerDiplomatic(w.diplomatic);
      for (const v of set.variants) {
        if (!v.pattern.test(d)) continue;
        totals.set(v.key, (totals.get(v.key) ?? 0) + 1);
        if (quires) {
          const k = `${v.key}|${quires.quireOfFolio[line.folioIndex] ?? 1}`;
          perQuire.set(k, (perQuire.get(k) ?? 0) + 1);
        }
        const list = rowsByVariant.get(v.key) ?? [];
        if (list.length < 12) list.push(lineRow(line, v.label, w.diplomatic));
        rowsByVariant.set(v.key, list);
      }
    }
  }
  // Interleave examples so every variant is visible before scrolling.
  const rows: EvidenceRow[] = [];
  for (let i = 0; rows.length < ROW_LIMIT && i < 12; i++) {
    for (const v of set.variants) {
      const r = rowsByVariant.get(v.key)?.[i];
      if (r && rows.length < ROW_LIMIT) rows.push(r);
    }
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const breakdown: BreakdownEntry[] = set.variants
    .filter((v) => totals.get(v.key))
    .map((v) => ({ label: v.label, value: totals.get(v.key) ?? 0 }));
  if (quires && quires.count > 1) {
    for (let q = 1; q <= quires.count; q++) {
      for (const v of set.variants) {
        const n = perQuire.get(`${v.key}|${q}`);
        if (n) breakdown.push({ label: `Q${q} · ${v.label}`, value: n, key: "quire_variant", labelParams: { quire: q, variant: v.label } });
      }
    }
  }
  const parts = set.variants.filter((v) => totals.get(v.key)).map((v) => `${v.label} ${totals.get(v.key)}`);
  return {
    headline: `${plural(total, "word")} match graph set ${setId}: ${parts.join(", ") || "none"}.`,
    params: { total, set: setId, summary: parts.join(", ") || "—", quireSource: quires?.source ?? "" },
    count: total,
    breakdown,
    rows,
  };
}

function wordTypes(ctx: RecipeContext): Map<string, { count: number; line: LineRecord; diplomatic: string }> {
  const types = new Map<string, { count: number; line: LineRecord; diplomatic: string }>();
  for (const line of getLineIndex(ctx.parsed)) {
    if (!isBodyLine(line)) continue;
    for (const w of line.words) {
      if (w.lang && w.lang !== "SPN" && w.lang !== "PRT" && w.lang !== "GAL" && w.lang !== "CAT") continue;
      const k = readingKey(w.reading);
      if (!k) continue;
      const e = types.get(k);
      if (e) e.count++;
      else types.set(k, { count: 1, line, diplomatic: w.diplomatic });
    }
  }
  return types;
}

/** `phon.apocope`: stems attested both with and without final -e (noche / noch). */
export function apocope(ctx: RecipeContext): RecipeResult {
  const types = wordTypes(ctx);
  const stop = stopwordsFor(witnessLanguageOf(ctx));
  const pairs: Array<{ full: string; apocopated: string; nFull: number; nApoc: number; line: LineRecord }> = [];
  types.forEach((e, w) => {
    if (w.length < 5 || !w.endsWith("e")) return;
    const short = w.slice(0, -1);
    const s = types.get(short);
    // Not apocope: future subjunctive (declarare ← declarar) or an attached clitic (quele, puedese).
    if (/[aei]r$/.test(short)) return;
    if (/(se|le|me|te|ne)$/.test(w) && types.has(w.slice(0, -2))) return;
    // Both forms attested at least twice, and the short form is not a function word (del/dele, con/cone).
    if (s && s.count >= 2 && e.count >= 2 && !stop.has(short) && !stop.has(w)) {
      pairs.push({ full: w, apocopated: short, nFull: e.count, nApoc: s.count, line: s.line });
    }
  });
  pairs.sort((a, b) => b.nApoc + b.nFull - (a.nApoc + a.nFull));
  const nApoc = pairs.reduce((n, p) => n + p.nApoc, 0);
  const nFull = pairs.reduce((n, p) => n + p.nFull, 0);
  return {
    headline: `${plural(pairs.length, "stem")} attested both with and without final -e: ${nApoc} apocopated vs ${nFull} full forms.`,
    params: { pairs: pairs.length, apocopated: nApoc, full: nFull },
    count: pairs.length,
    breakdown: pairs.slice(0, 20).map((p) => ({ label: `${p.apocopated} / ${p.full}`, value: p.nApoc })),
    rows: pairs.slice(0, ROW_LIMIT).map((p) => lineRow(p.line, `${p.apocopated} (${p.nApoc}) / ${p.full} (${p.nFull})`)),
  };
}

/**
 * `morph.enclisis`: verb + enclitic written as one word (dixol, llamol), detected when the
 * bare stem also occurs on its own in the witness. Proclitic = clitic word + that stem.
 */
export function enclisis(ctx: RecipeContext): RecipeResult {
  const lang = witnessLanguageOf(ctx);
  const enclitics = [...ENCLITICS[lang]].sort((a, b) => b.length - a.length);
  const standalone = new Set(CLITICS_STANDALONE[lang]);
  const types = wordTypes(ctx);
  const stop = stopwordsFor(lang);
  const merged = new Set(CONTRACTIONS[lang].map(([m]) => m));
  const stems = new Map<string, string>(); // word → stem
  types.forEach((entry, w) => {
    if (stop.has(w) || merged.has(w) || NON_VERB_ENDINGS.test(w)) return;
    for (const cl of enclitics) {
      if (!w.endsWith(cl)) continue;
      const stem = w.slice(0, -cl.length);
      // A finite-verb stem: ≥ 4 letters, vowel-final, attested on its own at least twice.
      if (stem.length < 4 || !/[aeiouáéíóú]$/.test(stem)) continue;
      // Bare -l only after -o/-e (dixol, fizol, diol), not -a (moral, qual).
      if (cl === "l" && !/[oe]$/.test(stem)) continue;
      // -se after -a/-e is usually the imperfect subjunctive (tomase, fuese), not a clitic.
      if (cl === "se" && /[ae]$/.test(stem)) continue;
      const stemEntry = types.get(stem);
      if (!stemEntry || stemEntry.count < 2 || standalone.has(w) || stop.has(stem)) continue;
      // Enclitic forms are rarer than the bare verb; plural nouns (romanos, capitulos) are not.
      if (entry.count > stemEntry.count) continue;
      stems.set(w, stem);
      break;
    }
  });
  let enclitic = 0;
  let proclitic = 0;
  const rows: EvidenceRow[] = [];
  const stemSet = new Set(stems.values());
  for (const line of getLineIndex(ctx.parsed)) {
    if (!isBodyLine(line)) continue;
    const words = line.words.map((w) => readingKey(w.reading));
    words.forEach((w, i) => {
      if (stems.has(w)) {
        enclitic++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `enclitic · ${stems.get(w)}+${w.slice(stems.get(w)!.length)}`, kwic(words, i, 4)));
      } else if (i > 0 && standalone.has(words[i - 1]) && stemSet.has(w)) {
        proclitic++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `proclitic · ${words[i - 1]} ${w}`, kwic(words, i, 4)));
      }
    });
  }
  return {
    headline: `${plural(enclitic, "enclitic form")} (verb+pronoun as one word) vs ${plural(proclitic, "proclitic form")} for the same verbs.`,
    params: { enclitic, proclitic, verbs: stemSet.size },
    needsServer: "Splitting main from subordinate clauses needs syntactic parsing (server).",
    count: enclitic + proclitic,
    breakdown: [
      { label: "enclitic", value: enclitic, key: "enclitic" },
      { label: "proclitic", value: proclitic, key: "proclitic" },
    ],
    rows,
  };
}

/** Adjectives, relatives and nouns that end like enclitics (qual, tales, cielos, moral). */
const NON_VERB_ENDINGS = /^(qual|quales|cual|cuales|tales|aquel|aquella|aquellos|aquellas|del|al|enel|nel|moral|natural|general|real|mortal|cielos|suelos)$|(mente|ales|eles|iles)$/;

/** Merged-vs-separate pair counting shared by contractions, elision and subordinators. */
function pairCounts(ctx: RecipeContext, pairs: ReadonlyArray<[string, string]>, label: string): RecipeResult {
  const merged = new Map<string, number>();
  const separate = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  const mergedForms = new Map(pairs.filter(([m, s]) => m !== s).map(([m, s]) => [m, s]));
  const separateForms = new Map(pairs.map(([m, s]) => [s, m]));
  for (const line of getLineIndex(ctx.parsed)) {
    if (!isBodyLine(line)) continue;
    const words = line.words.map((w) => readingKey(w.reading));
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (mergedForms.has(w)) {
        merged.set(w, (merged.get(w) ?? 0) + 1);
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${w} (merged)`, kwic(words, i, 4)));
      }
      if (i + 1 < words.length) {
        const two = `${w} ${words[i + 1]}`;
        const m = separateForms.get(two);
        if (m !== undefined) {
          separate.set(m, (separate.get(m) ?? 0) + 1);
          if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${two} (separate)`, kwic(words, i, 4)));
        }
      }
    }
  }
  const totalMerged = [...merged.values()].reduce((a, b) => a + b, 0);
  const totalSeparate = [...separate.values()].reduce((a, b) => a + b, 0);
  const breakdown: BreakdownEntry[] = pairs
    .filter(([m]) => merged.get(m) || separate.get(m))
    .map(([m, s]) => ({
      label: `${m} ${merged.get(m) ?? 0} · ${s} ${separate.get(m) ?? 0}`,
      value: (merged.get(m) ?? 0) + (separate.get(m) ?? 0),
    }))
    .sort((a, b) => b.value - a.value);
  return {
    headline: `${plural(totalMerged, `merged ${label}`)} vs ${plural(totalSeparate, `separate ${label}`)}.`,
    params: { merged: totalMerged, separate: totalSeparate },
    count: totalMerged + totalSeparate,
    breakdown: [
      { label: "merged (one unit)", value: totalMerged, key: "merged" },
      { label: "separate", value: totalSeparate, key: "separate" },
      ...breakdown,
    ],
    rows,
  };
}

/** `morph.contractions`: enel, delos, sobrel… vs en el, de los, sobre el. */
export function contractions(ctx: RecipeContext): RecipeResult {
  return pairCounts(ctx, CONTRACTIONS[witnessLanguageOf(ctx)], "form");
}

/** `morph.clitic_elision`: yl recibio vs y le recibio. */
export function cliticElision(ctx: RecipeContext): RecipeResult {
  return pairCounts(ctx, ELIDED_CLITICS[witnessLanguageOf(ctx)], "form");
}

/** `morph.subordinators`: porque / paraque / anteque written as one unit vs split. */
export function subordinators(ctx: RecipeContext): RecipeResult {
  return pairCounts(ctx, SUBORDINATORS[witnessLanguageOf(ctx)], "subordinator");
}

/** `colloc.prep_article`: en + article (merged or separate) vs en + no article. */
export function prepArticle(ctx: RecipeContext): RecipeResult {
  const lang = witnessLanguageOf(ctx);
  const prep = lang === "CAT" ? "en" : lang === "PRT" ? "em" : "en";
  const articles = new Set(lang === "PRT" || lang === "GAL" ? ["o", "a", "os", "as"] : ["el", "la", "los", "las", "lo"]);
  const mergedSet = new Set(CONTRACTIONS[lang].filter(([, s]) => s.startsWith(`${prep} `)).map(([m]) => m));
  let merged = 0, separate = 0, zero = 0;
  const rows: EvidenceRow[] = [];
  for (const line of getLineIndex(ctx.parsed)) {
    if (!isBodyLine(line)) continue;
    const words = line.words.map((w) => readingKey(w.reading));
    words.forEach((w, i) => {
      if (mergedSet.has(w)) {
        merged++;
        if (rows.length < 20) rows.push(lineRow(line, `${w} (merged)`, kwic(words, i, 4)));
      } else if (w === prep && i + 1 < words.length) {
        if (articles.has(words[i + 1])) {
          separate++;
          if (rows.length < 35) rows.push(lineRow(line, `${prep} ${words[i + 1]}`, kwic(words, i, 4)));
        } else {
          zero++;
          if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${prep} Ø`, kwic(words, i, 4)));
        }
      }
    });
  }
  return {
    headline: `"${prep}" + article: ${merged} merged, ${separate} separate; ${zero} with no article.`,
    params: { prep, merged, separate, zero },
    count: merged + separate + zero,
    breakdown: [
      { label: "merged (enel, enla…)", value: merged, key: "merged" },
      { label: "separate (en el…)", value: separate, key: "separate" },
      { label: "zero article", value: zero, key: "zero_article" },
    ],
    rows,
  };
}

/** `lex.latinate_doublets`: learned vs vernacular spellings of the same word. */
export function latinateDoublets(ctx: RecipeContext): RecipeResult {
  const types = wordTypes(ctx);
  let learned = 0, vernacular = 0;
  const breakdown: BreakdownEntry[] = [];
  const rows: EvidenceRow[] = [];
  for (const [l, v] of LATINATE_DOUBLETS) {
    const nl = types.get(l)?.count ?? 0;
    const nv = types.get(v)?.count ?? 0;
    if (!nl && !nv) continue;
    learned += nl;
    vernacular += nv;
    breakdown.push({ label: `${l} ${nl} · ${v} ${nv}`, value: nl + nv });
    const e = types.get(l) ?? types.get(v);
    if (e && rows.length < ROW_LIMIT) rows.push(lineRow(e.line, `${l} / ${v}`, e.diplomatic));
  }
  // Abbreviated learned spellings expanded by the editor (fcta → fecha) count as learned evidence.
  let expandedLearned = 0;
  for (const line of getLineIndex(ctx.parsed)) {
    for (const w of line.words) {
      if (w.hasExpansion && /ct|pt|mn|gn/.test(lowerDiplomatic(w.diplomatic).replace(/<[^>]*>/g, ""))) {
        expandedLearned++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "abbreviated learned spelling", w.diplomatic));
      }
    }
  }
  return {
    headline: `${plural(learned, "learned (Latinate) spelling")} vs ${plural(vernacular, "vernacular spelling")} across ${plural(breakdown.length, "doublet")}; ${expandedLearned} abbreviated learned forms.`,
    params: { learned, vernacular, doublets: breakdown.length, expanded: expandedLearned },
    count: learned + vernacular,
    breakdown: breakdown.sort((a, b) => b.value - a.value),
    rows,
  };
}

/** `lex.greek_formulas`: xp-, ih- nomina sacra with their Romance surroundings. */
export function greekFormulas(ctx: RecipeContext): RecipeResult {
  const counts = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  for (const line of getLineIndex(ctx.parsed)) {
    const words = line.words.map((w) => w.reading);
    line.words.forEach((w, i) => {
      const d = lowerDiplomatic(w.diplomatic).replace(/<[^>]*>/g, "");
      for (const f of GREEK_FORMULAS) {
        if (!f.pattern.test(d)) continue;
        counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${f.label} · ${w.diplomatic}`, kwic(words, i, 5)));
        break;
      }
    });
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    headline: `${plural(total, "Greek-letter formula")} (xp-/ih-) with ±5 words of context.`,
    params: { total },
    count: total,
    breakdown: GREEK_FORMULAS.filter((f) => counts.get(f.key)).map((f) => ({ label: f.label, value: counts.get(f.key)! })),
    rows,
  };
}

/** `chars.numerals_symbols`: Roman numerals bounded by periods, {SYMB.} anchors, xp/ih formulas. */
export function numeralsSymbols(ctx: RecipeContext): RecipeResult {
  let roman = 0, symb = 0, formulas = 0;
  const rows: EvidenceRow[] = [];
  for (const line of getLineIndex(ctx.parsed)) {
    for (const t of line.tokens) {
      if (t.type === "figure_anchor" && t.figureType === "SYMB") {
        symb++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "{SYMB.}", t.value));
      }
    }
    for (const w of line.words) {
      const d = lowerDiplomatic(w.diplomatic).replace(/<[^>]*>/g, "");
      if (ROMAN_NUMERAL_RE.test(d)) {
        roman++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "roman numeral", w.diplomatic));
      } else if (GREEK_FORMULAS.some((f) => f.pattern.test(d))) {
        formulas++;
      }
    }
  }
  return {
    headline: `${plural(roman, "Roman numeral")} bounded by periods, ${plural(symb, "{SYMB.} symbol")} and ${plural(formulas, "Greek-letter formula")}.`,
    params: { roman, symb, formulas },
    count: roman + symb + formulas,
    breakdown: [
      { label: "roman .xij.", value: roman, key: "roman" },
      { label: "{SYMB.}", value: symb },
      { label: "xp / ih", value: formulas, key: "greek_formula" },
    ],
    rows,
  };
}
