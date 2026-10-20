/**
 * Additional exact (Tier A) recipes: counted from HSMS token and block types
 * (SPEC-COPILOT §9.1–9.3).
 */
import type { Token } from "../../../constants/manuscript";
import {
  expandHistoricalVariants,
  historicalVariantMatchKeys,
  variantMatchKey,
} from "../../modernizedText";
import { chiSquare1PValue, logLikelihood2x2, minExpected2x2 } from "../corpusStats";
import { getLineIndex, isBodyLine, type LineRecord } from "../lineIndex";
import { inferQuires } from "../quires";
import { SPEECH_VERBS } from "../graphPatterns";
import type { BreakdownEntry, EvidenceRow, RecipeContext, RecipeResult } from "../types";
import { countWordOccurrences } from "../stats";
import { ROW_LIMIT, kwic, lineRow, plural, readingKey, snippet, witnessLanguageOf } from "./common";

/** `abbr.expansion_by_quire`: abbreviated (expansion) vs written-out forms, early vs late quires. */
export function expansionByQuire(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const quires = inferQuires(ctx.parsed, ctx.collation);
  // Reading forms that are abbreviated at least once in the witness.
  const abbreviated = new Map<string, { abbr: number[]; full: number[] }>();
  const nq = Math.max(1, quires.count);
  const bump = (form: string, kind: "abbr" | "full", q: number) => {
    let e = abbreviated.get(form);
    if (!e) {
      e = { abbr: new Array(nq + 1).fill(0), full: new Array(nq + 1).fill(0) };
      abbreviated.set(form, e);
    }
    e[kind][q]++;
  };
  const rows: EvidenceRow[] = [];
  for (const line of lines) {
    const q = quires.quireOfFolio[line.folioIndex] ?? 1;
    for (const w of line.words) {
      if (w.hasExpansion) {
        bump(readingKey(w.reading), "abbr", q);
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `Q${q} · ${w.diplomatic}`, w.reading));
      }
    }
  }
  for (const line of lines) {
    const q = quires.quireOfFolio[line.folioIndex] ?? 1;
    for (const w of line.words) {
      if (w.hasExpansion) continue;
      const key = readingKey(w.reading);
      if (abbreviated.has(key)) bump(key, "full", q);
    }
  }
  const half = Math.max(1, Math.ceil(nq / 2));
  const sum = (arr: number[], from: number, to: number) => arr.slice(from, to + 1).reduce((a, b) => a + b, 0);
  const forms = [...abbreviated.entries()]
    .map(([form, e]) => ({
      form,
      earlyAbbr: sum(e.abbr, 1, half),
      earlyFull: sum(e.full, 1, half),
      lateAbbr: sum(e.abbr, half + 1, nq),
      lateFull: sum(e.full, half + 1, nq),
      total: sum(e.abbr, 1, nq) + sum(e.full, 1, nq),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
  const breakdown: BreakdownEntry[] = forms.map((f) => ({
    label: `${f.form}: abbr ${f.earlyAbbr}→${f.lateAbbr}, full ${f.earlyFull}→${f.lateFull}`,
    value: f.earlyAbbr + f.lateAbbr,
    key: "expansion_quire",
    labelParams: { form: f.form, earlyAbbr: f.earlyAbbr, lateAbbr: f.lateAbbr, earlyFull: f.earlyFull, lateFull: f.lateFull },
  }));
  const totalAbbr = forms.reduce((n, f) => n + f.earlyAbbr + f.lateAbbr, 0);
  return {
    headline: `${plural(abbreviated.size, "abbreviated form")} compared across ${plural(nq, "quire")} (quires from ${quires.source}).`,
    params: { forms: abbreviated.size, quires: nq, source: quires.source },
    count: totalAbbr,
    breakdown,
    rows,
  };
}

/**
 * `layout.hyphen_boundaries`: words divided across column or folio boundaries.
 * Per manual §3.12 a column must close on a complete word: the remainder is brought back
 * after a hyphen ("pala-bra}"). A column whose last line ends in a bare hyphen is flagged.
 */
export function hyphenBoundaries(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  let joined = 0;
  let violations = 0;
  let lineInternal = 0;
  for (const line of lines) {
    if (!isBodyLine(line)) continue;
    const closes = line.closesColumn || line.closesFolio;
    const lastWord = line.words[line.words.length - 1];
    if (closes && lastWord && /\p{L}-\p{L}/u.test(lastWord.diplomatic)) {
      joined++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, line.closesFolio ? "folio break · joined" : "column break · joined", lastWord.diplomatic));
    } else if (closes && line.endsWithHyphen) {
      violations++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, line.closesFolio ? "folio break · hyphen" : "column break · hyphen"));
    } else if (line.endsWithHyphen) {
      lineInternal++;
    }
  }
  return {
    headline: `${plural(joined, "divided word")} joined across a column or folio boundary as §3.12 prescribes; ${plural(violations, "column")} ending on a line-end hyphen (word continues in the next column); ${lineInternal} line-end hyphens inside columns.`,
    params: { joined, violations, lineInternal },
    count: joined + violations,
    breakdown: [
      { label: "joined across boundary", value: joined, key: "boundary_joined" },
      { label: "column ends on a hyphen", value: violations, key: "boundary_violation" },
      { label: "line-end hyphen inside column", value: lineInternal, key: "line_hyphen" },
    ],
    rows,
  };
}

function isOstaNonSequiturLine(line: LineRecord): boolean {
  const meaningful = line.tokens.filter((t) => !(t.type === "text" && !t.value.trim()));
  return meaningful.length === 1 && meaningful[0].type === "editorial_insertion" && /^\.{3}$/.test(meaningful[0].value.trim());
}

/** `codex.nonsequitur_after_cw`: `[—]` (and OSTA's standalone `[...]`) after a catchword. */
export function nonSequiturAfterCatchword(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  let afterCw = 0;
  let elsewhere = 0;
  let ostaStyle = 0;
  for (const line of lines) {
    const folio = ctx.parsed.folios[line.folioIndex];
    const hasMarker = line.tokens.some((t) => t.type === "non_sequitur");
    const osta = isOstaNonSequiturLine(line);
    if (!hasMarker && !osta) continue;
    const atFoot = line.blockIndex >= folio.blocks.length - 2;
    if (osta) ostaStyle++;
    if (folio.catchword && atFoot) {
      afterCw++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, osta ? "after {CW.} · [...]" : "after {CW.} · [—]", `{CW. ${folio.catchword}}`));
    } else {
      elsewhere++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, osta ? "[...]" : "[—]"));
    }
  }
  return {
    headline: `${plural(afterCw, "non-sequitur")} after a catchword (probable lost folios) and ${plural(elsewhere, "other non-sequitur")}.`,
    params: { afterCw, elsewhere, ostaStyle },
    count: afterCw + elsewhere,
    breakdown: [
      { label: "after {CW.}", value: afterCw, key: "after_catchword" },
      { label: "elsewhere", value: elsewhere, key: "elsewhere" },
      { label: "OSTA-style [...] line", value: ostaStyle, key: "osta_ellipsis" },
    ],
    rows,
  };
}

const ACCENT_MARKS: Array<{ key: string; label: string; re: RegExp }> = [
  { key: "acute", label: "acute @'", re: /@'/g },
  { key: "grave", label: "grave @`", re: /@`/g },
  { key: "circumflex", label: "circumflex @^", re: /@\^/g },
  { key: "dieresis", label: "dieresis @#", re: /@#/g },
];

/** `chars.accents`: orthographic accent marks by mark and language section. */
export function accents(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const counts = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    for (const w of line.words) {
      for (const mark of ACCENT_MARKS) {
        mark.re.lastIndex = 0;
        const hits = w.diplomatic.match(mark.re)?.length ?? 0;
        if (!hits) continue;
        const section = w.lang ?? "base";
        const k = `${mark.key}|${section}`;
        counts.set(k, (counts.get(k) ?? 0) + hits);
        total += hits;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${mark.label} · ${section}`, w.diplomatic));
      }
    }
  }
  const breakdown: BreakdownEntry[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, value]) => {
      const [mark, section] = k.split("|");
      return { label: `${mark} · ${section}`, value, key: "accent_section", labelParams: { mark, section } };
    });
  return {
    headline: `${plural(total, "orthographic accent mark")} across ${plural(new Set([...counts.keys()].map((k) => k.split("|")[1])).size, "language section")}.`,
    params: { total, sections: new Set([...counts.keys()].map((k) => k.split("|")[1])).size },
    count: total,
    breakdown,
    rows,
  };
}

/** `figure.interior_text`: {MIN.}/{DIAG.}/{ILL.} anchors and diagram blocks carrying text. */
export function figureInteriorText(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const byType = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    for (const t of line.tokens) {
      if (t.type !== "figure_anchor") continue;
      const text = t.value.trim();
      if (!text) continue;
      const type = t.figureType ?? "FIG";
      byType.set(type, (byType.get(type) ?? 0) + 1);
      total++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `{${type}.}`, text));
    }
    if (line.type === "diagram") {
      const text = line.words.map((w) => w.reading).join(" ").trim();
      if (text) {
        byType.set("DIAG", (byType.get("DIAG") ?? 0) + 1);
        total++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "{DIAG.} block", text));
      }
    }
  }
  return {
    headline: `${plural(total, "figure")} with interior text (${[...byType.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "none"}).`,
    params: { total },
    count: total,
    breakdown: [...byType.entries()].map(([k, v]) => ({ label: `{${k}.}`, value: v })),
    rows,
  };
}

/** `morph.prefix_separation` and `morph.prefix_productivity` (counts by prefix). */
export function prefixSeparation(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const byPrefix = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    for (const w of line.words) {
      if (!w.hasPrefixSeparator) continue;
      const prefix = w.diplomatic.split("[+]")[0].toLowerCase();
      byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
      total++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, `${prefix}[+]`, w.diplomatic));
    }
  }
  const breakdown = [...byPrefix.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, value]) => ({ label: `${p}-`, value }));
  return {
    headline: `${plural(total, "prefixed compound")} marked with [+], ${plural(byPrefix.size, "distinct prefix", "distinct prefixes")}.`,
    params: { total, prefixes: byPrefix.size },
    count: total,
    breakdown,
    rows,
  };
}

/** `morph.prefix_linebreak`: a `[+]` prefix left at line end before a hyphen (`de[+]-`). */
export function prefixLinebreak(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    const toks = line.tokens.filter((t) => !(t.type === "text" && !t.value.trim()));
    const n = toks.length;
    if (n >= 2 && toks[n - 1].type === "hyphen" && toks[n - 2].type === "prefix_separator") {
      total++;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "[+]-"));
    }
  }
  return {
    headline: `${plural(total, "line")} ending with a prefix separated from its root ([+]-).`,
    params: { total },
    count: total,
    rows,
  };
}

const PUNCT_RE = /[.:;,/¶]|\$;|\$\./g;

/** `syntax.punctuation`: marks by line position (final vs internal), with scribal $; $. */
export function punctuation(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const counts = new Map<string, { final: number; internal: number }>();
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    if (!isBodyLine(line)) continue;
    const toks = line.tokens.filter((t) => !(t.type === "text" && !t.value.trim()));
    toks.forEach((t, i) => {
      const isFinal = i === toks.length - 1 || (i === toks.length - 2 && toks[toks.length - 1].type === "hyphen");
      const marks: string[] =
        t.type === "scribal_punctuation"
          ? [t.value]
          : t.type === "text"
            ? (t.raw.match(PUNCT_RE) ?? []).filter((m) => !/\.[ivxlcdm]+\./i.test(t.raw))
            : [];
      for (const m of marks) {
        const e = counts.get(m) ?? { final: 0, internal: 0 };
        if (isFinal) e.final++;
        else e.internal++;
        counts.set(m, e);
        total++;
      }
      if (marks.length && rows.length < ROW_LIMIT && t.type === "scribal_punctuation") rows.push(lineRow(line, t.value));
    });
  }
  const breakdown: BreakdownEntry[] = [...counts.entries()]
    .sort((a, b) => b[1].final + b[1].internal - (a[1].final + a[1].internal))
    .map(([mark, e]) => ({
      label: `${mark}  line-final ${e.final} · internal ${e.internal}`,
      value: e.final + e.internal,
      key: "punct_position",
      labelParams: { mark, final: e.final, internal: e.internal },
    }));
  return {
    headline: `${plural(total, "punctuation mark")} of ${plural(counts.size, "kind")}, split by line position.`,
    params: { total, kinds: counts.size },
    needsServer: "Aligning marks with clause boundaries needs syntactic parsing (server).",
    count: total,
    breakdown,
    rows,
  };
}

/** `discourse.calderones`: %, %2, %3 with the following words; speech-verb heuristic (Tier B part). */
export function calderones(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const lang = witnessLanguageOf(ctx);
  const speech = new Set(SPEECH_VERBS[lang]);
  const counts = { calderon: 0, calderon_two: 0, calderon_three: 0 };
  let nearSpeech = 0;
  const rows: EvidenceRow[] = [];
  // Flatten words with line refs to look ahead across lines.
  const flat: Array<{ word: string; line: LineRecord }> = [];
  const markAt: Array<{ idx: number; type: keyof typeof counts; line: LineRecord }> = [];
  for (const line of lines) {
    for (const t of line.tokens) {
      if (t.type === "calderon" || t.type === "calderon_two" || t.type === "calderon_three") {
        counts[t.type]++;
        markAt.push({ idx: flat.length, type: t.type, line });
      }
    }
    for (const w of line.words) flat.push({ word: readingKey(w.reading), line });
  }
  for (const m of markAt) {
    const next = flat.slice(m.idx, m.idx + 6).map((f) => f.word);
    const isSpeech = next.some((w) => speech.has(w));
    if (isSpeech) nearSpeech++;
    if (rows.length < ROW_LIMIT) {
      rows.push(lineRow(m.line, `${m.type === "calderon" ? "%" : m.type === "calderon_two" ? "%2" : "%3"}${isSpeech ? " · speech" : ""}`, next.join(" ")));
    }
  }
  const total = counts.calderon + counts.calderon_two + counts.calderon_three;
  return {
    headline: `${plural(total, "calderón")} (% ${counts.calderon}, %2 ${counts.calderon_two}, %3 ${counts.calderon_three}); ${nearSpeech} introduce reported speech within six words.`,
    params: { total, single: counts.calderon, two: counts.calderon_two, three: counts.calderon_three, nearSpeech },
    count: total,
    breakdown: [
      { label: "%", value: counts.calderon },
      { label: "%2", value: counts.calderon_two },
      { label: "%3", value: counts.calderon_three },
      { label: "followed by a speech verb (heuristic)", value: nearSpeech, key: "near_speech" },
    ],
    rows,
  };
}

const IBERIAN_CODES = new Set(["ARG", "CAT", "GAL", "PRT", "BAS", "SPN", "PRV"]);

/** `dial.tagged_spans`: editor-tagged Iberian dialect/language spans ({ARG.} etc.). */
export function dialectSpans(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const byCode = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  for (const line of lines) {
    const seen = new Set<string>();
    for (const w of line.words) {
      if (w.lang && IBERIAN_CODES.has(w.lang) && !seen.has(w.lang)) {
        seen.add(w.lang);
        byCode.set(w.lang, (byCode.get(w.lang) ?? 0) + 1);
        if (rows.length < ROW_LIMIT) {
          rows.push(lineRow(line, `{${w.lang}.}`, line.words.filter((x) => x.lang === w.lang).map((x) => x.reading).join(" ")));
        }
      }
    }
  }
  const total = [...byCode.values()].reduce((a, b) => a + b, 0);
  return {
    headline: `${plural(total, "line")} with tagged Iberian dialect or language spans (${[...byCode.entries()].map(([c, n]) => `${c} ${n}`).join(", ") || "none"}).`,
    params: { total, codes: byCode.size },
    needsServer: "Detecting untagged dialect features (e.g. Aragonese or Leonese traits in a Castilian base) needs a feature classifier (server).",
    count: total,
    breakdown: [...byCode.entries()].map(([code, value]) => ({ label: code, value, key: "lang", labelParams: { code } })),
    rows,
  };
}

/** `aljamiado.symb_spans`: transliterated {SYMB: …} material with its Romance context. */
export function symbSpans(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  let total = 0;
  let words = 0;
  for (const line of lines) {
    for (const t of line.tokens) {
      if (t.type !== "figure_anchor" || t.figureType !== "SYMB") continue;
      total++;
      words += t.value.trim() ? t.value.trim().split(/\s+/).length : 0;
      if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "{SYMB.}", `${t.value} · ${snippet(line.words.map((w) => w.reading).join(" "), 48)}`));
    }
  }
  return {
    headline: `${plural(total, "{SYMB.} span")} (${plural(words, "transliterated word")}).`,
    params: { total, words },
    needsServer: "Mapping Romance phonemes onto Arabic or Hebrew characters needs the transliteration model (server).",
    count: total,
    rows,
  };
}

/** `codex.catchword_hyphen_bias`: hyphenation on folio-final lines vs internal lines (G² test). */
export function catchwordHyphenBias(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed).filter(isBodyLine);
  let finalHyph = 0, finalPlain = 0, innerHyph = 0, innerPlain = 0;
  const rows: EvidenceRow[] = [];
  for (const line of lines) {
    const folio = ctx.parsed.folios[line.folioIndex];
    const isFoot = line.closesFolio && Boolean(folio.catchword);
    if (isFoot) {
      if (line.endsWithHyphen) {
        finalHyph++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "quire foot · hyphen"));
      } else finalPlain++;
    } else if (line.endsWithHyphen) innerHyph++;
    else innerPlain++;
  }
  const g2 = logLikelihood2x2(finalHyph, finalPlain, innerHyph, innerPlain);
  const p = chiSquare1PValue(g2);
  const minE = minExpected2x2(finalHyph, finalPlain, innerHyph, innerPlain);
  const footRate = finalHyph + finalPlain ? finalHyph / (finalHyph + finalPlain) : 0;
  const innerRate = innerHyph + innerPlain ? innerHyph / (innerHyph + innerPlain) : 0;
  return {
    headline: `Hyphenated at quire feet ${(footRate * 100).toFixed(1)}% (${finalHyph}/${finalHyph + finalPlain}) vs internal lines ${(innerRate * 100).toFixed(1)}% (${innerHyph}/${innerHyph + innerPlain}); G² = ${g2.toFixed(2)}, p = ${p.toPrecision(2)}${minE < 5 ? " (expected counts < 5: treat with caution)" : ""}.`,
    params: {
      footRate: (footRate * 100).toFixed(1),
      innerRate: (innerRate * 100).toFixed(1),
      footHyph: finalHyph,
      footTotal: finalHyph + finalPlain,
      innerHyph,
      innerTotal: innerHyph + innerPlain,
      g2: g2.toFixed(2),
      p: p.toPrecision(2),
      lowExpected: minE < 5 ? 1 : 0,
    },
    count: finalHyph,
    breakdown: [
      { label: "quire-foot lines hyphenated", value: finalHyph, key: "foot_hyphen" },
      { label: "quire-foot lines not hyphenated", value: finalPlain, key: "foot_plain" },
      { label: "internal lines hyphenated", value: innerHyph, key: "inner_hyphen" },
      { label: "internal lines not hyphenated", value: innerPlain, key: "inner_plain" },
    ],
    rows,
  };
}

/** `marg.vocab_ratio`: vocabulary introduced in glosses vs the column body. */
export function glossVocabulary(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const body = new Set<string>();
  const gloss = new Map<string, LineRecord>();
  for (const line of lines) {
    for (const w of line.words) {
      const k = readingKey(w.reading);
      if (k.length < 2) continue;
      if (line.type === "gloss") {
        if (!gloss.has(k)) gloss.set(k, line);
      } else if (isBodyLine(line)) body.add(k);
    }
  }
  const glossOnly = [...gloss.keys()].filter((k) => !body.has(k));
  const shared = gloss.size - glossOnly.length;
  const union = new Set([...body, ...gloss.keys()]).size;
  const jaccard = union ? shared / union : 0;
  return {
    headline: `${plural(gloss.size, "word type")} in glosses, ${glossOnly.length} not found in the body (${gloss.size ? ((glossOnly.length / gloss.size) * 100).toFixed(1) : "0.0"}%); Jaccard overlap ${jaccard.toFixed(3)}.`,
    params: {
      glossTypes: gloss.size,
      glossOnly: glossOnly.length,
      pct: gloss.size ? ((glossOnly.length / gloss.size) * 100).toFixed(1) : "0.0",
      jaccard: jaccard.toFixed(3),
    },
    count: glossOnly.length,
    breakdown: [
      { label: "gloss-only types", value: glossOnly.length, key: "gloss_only" },
      { label: "shared with body", value: shared, key: "shared_body" },
      { label: "body types", value: body.size, key: "body_types" },
    ],
    rows: glossOnly.slice(0, ROW_LIMIT).map((k) => lineRow(gloss.get(k)!, k)),
  };
}

/** `corr.editorial_overrides`: a scribal deletion followed on the same line by an editorial insertion. */
export function editorialOverrides(ctx: RecipeContext): RecipeResult {
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  let total = 0;
  for (const line of lines) {
    const toks = line.tokens.filter((t: Token) => !(t.type === "text" && !t.value.trim()));
    for (let i = 0; i + 1 < toks.length; i++) {
      if (toks[i].type === "scribal_deletion" && toks[i + 1].type === "editorial_insertion") {
        total++;
        if (rows.length < ROW_LIMIT) rows.push(lineRow(line, "(^…) → […]", `${toks[i].raw} ${toks[i + 1].raw}`));
      }
    }
  }
  return {
    headline: `${plural(total, "place")} where an editorial insertion immediately follows a scribal deletion.`,
    params: { total },
    count: total,
    rows,
  };
}

/** `search.kwic`: every occurrence of a word (modern→diplomatic variants) with ±window context. */
export function kwicSearch(
  ctx: RecipeContext,
  word: string | undefined,
  windowSize: number = 5,
): RecipeResult {
  const needle = readingKey(word ?? "");
  if (!needle) {
    return { headline: "Which word? Put it in quotes, e.g. \"rey\".", params: {}, messageKey: "needWord", count: 0, rows: [] };
  }
  const variants = expandHistoricalVariants(word ?? "");
  const needles = historicalVariantMatchKeys(word ?? "");
  const radius = Math.min(10, Math.max(1, Math.floor(windowSize) || 5));
  const lines = getLineIndex(ctx.parsed);
  const rows: EvidenceRow[] = [];
  const byFolio = new Map<string, number>();
  const hitForms = new Set<string>();
  let total = 0;
  for (const line of lines) {
    const words = line.words.map((w) => w.reading);
    words.forEach((w, i) => {
      if (!needles.has(variantMatchKey(w))) return;
      total++;
      hitForms.add(line.words[i].diplomatic || w);
      byFolio.set(line.folioId, (byFolio.get(line.folioId) ?? 0) + 1);
      if (rows.length < ROW_LIMIT) {
        const diplomatic = line.words[i].diplomatic || w;
        rows.push(
          lineRow(
            line,
            `[fol. ${line.folioId}] · line ${line.lineNumber ?? "?"} (${diplomatic})`,
            kwic(words, i, radius),
          ),
        );
      }
    });
  }
  const variantNote =
    variants.length > 1 ? ` (variants: ${variants.slice(0, 8).join(", ")})` : "";
  const formsNote = hitForms.size ? `; attested: ${[...hitForms].slice(0, 6).join(", ")}` : "";
  return {
    headline: `${plural(total, "occurrence")} of “${word}”${variantNote}${formsNote}.`,
    params: {
      total,
      word: word ?? "",
      folios: byFolio.size,
      window: radius,
      variants: variants.join(","),
    },
    count: total,
    breakdown: [...byFolio.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folio, value]) => ({
        label: `fol. ${folio}`,
        value,
        key: "folioHit",
        labelParams: { folio },
      })),
    rows,
  };
}

/** `stats.term_frequency`: count a single surface form with per-folio breakdown. */
export function termFrequencyCount(ctx: RecipeContext, word: string | undefined): RecipeResult {
  const needle = readingKey(word ?? "");
  if (!needle) {
    return {
      headline: "Which word? Put it in quotes, e.g. \"muito\".",
      params: {},
      messageKey: "needWord",
      count: 0,
      rows: [],
    };
  }
  const occ = countWordOccurrences(ctx.parsed, word ?? "");
  const breakdown = Object.entries(occ.byFolio)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([folio, value]) => ({
      label: `fol. ${folio}`,
      value,
      key: "folioHit",
      labelParams: { folio },
    }));
  const rows: EvidenceRow[] = breakdown.map((b) => ({
    folioId: String(b.labelParams!.folio),
    label: String(b.value),
    detail: `${b.value}× on fol. ${b.labelParams!.folio}`,
  }));
  return {
    headline:
      occ.count === 0
        ? `No occurrences of “${word}”.`
        : `Occurrences of “${word}”: ${occ.count} across ${plural(occ.folioCount, "folio")}.`,
    params: {
      total: occ.count,
      word: word ?? "",
      folios: occ.folioCount,
    },
    messageKey: occ.count === 0 ? "none" : undefined,
    count: occ.count,
    breakdown,
    rows,
  };
}

/** `ingest.low_confidence`: lines whose recognition confidence is below 0.8 (sidecar). */
export function ingestLowConfidence(ctx: RecipeContext): RecipeResult {
  const sidecar = ctx.sidecar;
  if (!sidecar) {
    return { headline: "This witness has no ingest sidecar (it was not machine-transcribed).", params: {}, messageKey: "noSidecar", count: 0, rows: [] };
  }
  const rows: EvidenceRow[] = [];
  let total = 0;
  let lineCount = 0;
  for (const [folioId, folio] of Object.entries(sidecar.folios)) {
    for (const l of folio.lines) {
      if (l.confidence === undefined) continue;
      lineCount++;
      if (l.confidence < 0.8) {
        total++;
        if (rows.length < ROW_LIMIT) rows.push({ folioId, label: `${(l.confidence * 100).toFixed(0)}%`, detail: `line ${l.sourceLine + 1}` });
      }
    }
  }
  if (lineCount === 0) {
    return {
      headline: "This machine transcription has no per-line recognition confidence.",
      params: {},
      messageKey: "noConfidence",
      count: 0,
      rows: [],
    };
  }
  return {
    headline: `${plural(total, "line")} below 80% recognition confidence (of ${lineCount}).`,
    params: { total, lines: lineCount },
    count: total,
    rows,
  };
}

/** `ingest.unreviewed`: folios not yet marked reviewed (sidecar). */
export function ingestUnreviewed(ctx: RecipeContext): RecipeResult {
  const sidecar = ctx.sidecar;
  if (!sidecar) {
    return { headline: "This witness has no ingest sidecar (it was not machine-transcribed).", params: {}, messageKey: "noSidecar", count: 0, rows: [] };
  }
  const byState = new Map<string, number>();
  const rows: EvidenceRow[] = [];
  for (const [folioId, folio] of Object.entries(sidecar.folios)) {
    byState.set(folio.review, (byState.get(folio.review) ?? 0) + 1);
    if (folio.review !== "reviewed" && rows.length < ROW_LIMIT) rows.push({ folioId, label: folio.review });
  }
  const total = [...byState.entries()].filter(([s]) => s !== "reviewed").reduce((n, [, v]) => n + v, 0);
  return {
    headline: `${plural(total, "folio side")} not yet reviewed.`,
    params: { total },
    count: total,
    breakdown: [...byState.entries()].map(([state, value]) => ({ label: state, value, key: `review_${state}` })),
    rows,
  };
}

/** `meta.witness`: author / title / imprint / shelfmark from parsed metadata. */
export function witnessMetadata(ctx: RecipeContext, query?: string): RecipeResult {
  const m = ctx.parsed.metadata;
  const fields: Array<{ key: string; label: string; value: string }> = [
    { key: "author", label: "Author", value: (m.author ?? "").trim() },
    { key: "title", label: "Title", value: (m.title ?? "").trim() },
    { key: "date", label: "Date", value: (m.imprint?.date ?? "").trim() },
    { key: "city", label: "Imprint city", value: (m.imprint?.city ?? "").trim() },
    { key: "printer", label: "Printer", value: (m.imprint?.printer ?? "").trim() },
    { key: "library", label: "Library", value: (m.witness?.library ?? "").trim() },
    { key: "shelfmark", label: "Shelfmark", value: (m.witness?.shelfmark ?? "").trim() },
    { key: "witnessCity", label: "Witness city", value: (m.witness?.city ?? "").trim() },
  ].filter((f) => f.value);

  if (!fields.length) {
    return {
      headline: "This witness has no {RMK:} / imprint metadata yet.",
      params: {},
      messageKey: "none",
      count: 0,
      rows: [],
    };
  }

  const q = (query ?? "").toLowerCase();
  const want =
    /\bshelfmark|signatura|cota\b/.test(q) ? "shelfmark"
    : /\blibrary|biblioteca|holds|holding\b/.test(q) ? "library"
    : /\byear|date|printed|copied|año|ano|data\b/.test(q) ? "date"
    : /\bauthor|autor|scribe|escriba\b/.test(q) ? "author"
    : /\btitle|título|titulo\b/.test(q) ? "title"
    : /\bprinter|impresor|impressor\b/.test(q) ? "printer"
    : /\bdedicatee|dedicat|dedicado|principe|príncipe\b/.test(q) ? "author"
    : null;

  const picked = want ? fields.find((f) => f.key === want) : undefined;
  if (picked) {
    return {
      headline: `${picked.label}: ${picked.value}.`,
      params: { field: picked.key, value: picked.value },
      count: 1,
      breakdown: fields.map((f) => ({ label: f.label, value: 1, key: f.key, labelParams: { value: f.value } })),
      rows: [{ folioId: ctx.parsed.folios[0]?.id ?? "1r", label: picked.label, detail: picked.value }],
    };
  }

  const summary = fields.map((f) => `${f.label}: ${f.value}`).join(" · ");
  return {
    headline: summary,
    params: {
      author: m.author || "",
      title: m.title || "",
      date: m.imprint?.date || "",
      library: m.witness?.library || "",
      shelfmark: m.witness?.shelfmark || "",
    },
    count: fields.length,
    breakdown: fields.map((f) => ({ label: `${f.label}: ${f.value}`, value: 1, key: f.key })),
    rows: fields.map((f) => ({
      folioId: ctx.parsed.folios[0]?.id ?? "1r",
      label: f.label,
      detail: f.value,
    })),
  };
}

/** `codex.catchwords`: every `{CW.}` at folio feet. */
export function listCatchwords(ctx: RecipeContext): RecipeResult {
  const rows: EvidenceRow[] = [];
  for (const folio of ctx.parsed.folios) {
    if (!folio.catchword) continue;
    rows.push({
      folioId: folio.id,
      label: folio.catchword,
      detail: `{CW. ${folio.catchword}}`,
    });
  }
  return {
    headline:
      rows.length === 0
        ? "No catchwords ({CW.}) in this witness."
        : `${plural(rows.length, "catchword")} at folio feet.`,
    params: { total: rows.length },
    messageKey: rows.length === 0 ? "none" : undefined,
    count: rows.length,
    breakdown: rows.map((r) => ({
      label: `fol. ${r.folioId}`,
      value: 1,
      key: "folioHit",
      labelParams: { folio: r.folioId },
    })),
    rows: rows.slice(0, ROW_LIMIT),
  };
}

/** `ui.control`: local toolbar / export hints (no Azure). */
export function uiControlHint(ctx: RecipeContext, query?: string): RecipeResult {
  const q = (query ?? "").toLowerCase();
  const hints: Array<{ re: RegExp; key: string; headline: string }> = [
    {
      re: /orthograph|modern spelling|ortograf|grafia moderna/,
      key: "orthography",
      headline: "Use the modern-orthography toggle in the facsimile toolbar for this page.",
    },
    {
      re: /line number|gutter|números? de l[ií]nea|numeros de linea/,
      key: "lineNumbers",
      headline: "Toggle line numbers in the left gutter from the facsimile display options.",
    },
    {
      re: /marginal|gloss|glosa|hide notes/,
      key: "marginalia",
      headline: "Hide or show marginal notes and glosses with the marginalia visibility control; or ask “glosses versus addenda” for a local count.",
    },
    {
      re: /zoom|illuminat|drop cap|inicial/,
      key: "zoomInitial",
      headline: "Select the illuminated initial on the folio canvas to zoom; or ask “initial hierarchy” for a local inventory.",
    },
    {
      re: /single.?column|una columna|coluna única|coluna unica/,
      key: "singleColumn",
      headline: "Switch to single-column view in the layout / synoptic controls.",
    },
    {
      re: /bounding box|svg overlay|overlay|cajas de dise[nñ]o/,
      key: "overlay",
      headline: "Turn on layout bounding boxes / SVG overlay from the facsimile debug overlay control.",
    },
    {
      re: /tei|export.*xml|xml/,
      key: "exportTei",
      headline: "Open Export and choose TEI-XML for the current view.",
    },
    {
      re: /download.*svg|export.*svg|svg$/,
      key: "exportSvg",
      headline: "Open Export and choose SVG to download the page rendering.",
    },
    {
      re: /clipboard|copy plain|copiar texto|texto plano/,
      key: "copyPlain",
      headline: "Use Copy plain text in the export / share menu to put the diplomatic transcription on the clipboard.",
    },
    {
      re: /macron|tilde|abbreviation.*highlight|resaltar.*abrev/,
      key: "highlightAbbr",
      headline: "Ask “nasal tildes versus geminate nn” or “superscript abbreviations” for a local highlight inventory.",
    },
  ];

  const hit = hints.find((h) => h.re.test(q));
  if (hit) {
    return {
      headline: hit.headline,
      params: { control: hit.key },
      messageKey: hit.key,
      count: 1,
      rows: [],
    };
  }

  void ctx;
  return {
    headline:
      "UI controls available locally: orthography toggle, line-number gutter, marginalia visibility, layout overlay, single-column view, and Export (TEI / SVG / plain text).",
    params: {},
    messageKey: "menu",
    count: 0,
    rows: [],
  };
}
