import type { BlockType, ParsedManuscript, Token, TokenType } from "../../../constants/manuscript";
import { renderNormalizedBlock } from "../../normalizedText";
import type { BlockRef, FacetIndex, TokenRef } from "../facetIndex";
import { tokenHand } from "../facetIndex";
import type { BreakdownEntry, EvidenceRow, RecipeResult } from "../types";

export const ROW_LIMIT = 50;

const SNIPPET_MAX = 60;

function plural(n: number, one: string, other: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : other}`;
}

function tokenAt(parsed: ParsedManuscript, ref: TokenRef): Token | undefined {
  return parsed.folios[ref.folioIndex]?.blocks[ref.blockIndex]?.tokens[ref.tokenIndex];
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
}

function compareRefs(a: TokenRef, b: TokenRef): number {
  return (
    a.folioIndex - b.folioIndex || a.blockIndex - b.blockIndex || a.tokenIndex - b.tokenIndex
  );
}

function countOf(facets: FacetIndex, type: TokenType): number {
  return facets.tokenTypeCounts.get(type)?.total ?? 0;
}

function foliosWith(facets: FacetIndex, types: TokenType[]): number {
  const seen = new Set<string>();
  for (const type of types) {
    facets.tokenTypeCounts.get(type)?.byFolio.forEach((_, id) => seen.add(id));
  }
  return seen.size;
}

function tokenRow(
  parsed: ParsedManuscript,
  ref: TokenRef,
  prefix: string,
  textOf: (t: Token) => string = (t) => t.value,
): EvidenceRow {
  const token = tokenAt(parsed, ref);
  return {
    folioId: ref.folioId,
    lineNumber: ref.lineNumber,
    label: prefix,
    detail: token ? snippet(textOf(token)) : undefined,
  };
}

/** Merge ref lists in document order, labelled per source list, capped to `ROW_LIMIT`. */
function mergedRows(
  parsed: ParsedManuscript,
  sources: Array<{ refs: TokenRef[]; label: string; textOf?: (t: Token) => string }>,
): EvidenceRow[] {
  const tagged: Array<{ ref: TokenRef; label: string; textOf?: (t: Token) => string }> = [];
  for (const s of sources) {
    const limit = Math.min(s.refs.length, ROW_LIMIT);
    for (let i = 0; i < limit; i++) tagged.push({ ref: s.refs[i], label: s.label, textOf: s.textOf });
  }
  tagged.sort((a, b) => compareRefs(a.ref, b.ref));
  return tagged
    .slice(0, ROW_LIMIT)
    .map((t) => tokenRow(parsed, t.ref, t.label, t.textOf));
}

function refsOf(facets: FacetIndex, type: TokenType): TokenRef[] {
  return facets.tokenRefs.get(type) ?? [];
}

/** `corr.deletions_scribal_vs_editorial` */
export function deletionsScribalVsEditorial(
  facets: FacetIndex,
  parsed: ParsedManuscript,
): RecipeResult {
  const scribal = countOf(facets, "scribal_deletion");
  const editorial = countOf(facets, "editorial_deletion");
  const folios = foliosWith(facets, ["scribal_deletion", "editorial_deletion"]);
  return {
    headline: `${plural(scribal, "scribal deletion")} and ${plural(editorial, "editorial deletion")} across ${plural(folios, "folio")}.`,
    params: { scribal, editorial, folios },
    count: scribal + editorial,
    breakdown: [
      { label: "scribal (^…)", value: scribal, key: "scribal_deletion" },
      { label: "editorial (…)", value: editorial, key: "editorial_deletion" },
    ],
    rows: mergedRows(parsed, [
      { refs: refsOf(facets, "scribal_deletion"), label: "scribal" },
      { refs: refsOf(facets, "editorial_deletion"), label: "editorial" },
    ]),
  };
}

/** `corr.non_original_hands`: tokens with hand ≥ 2, grouped by hand and type. */
export function nonOriginalHands(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const groups = new Map<string, number>();
  const refs: TokenRef[] = [];
  let total = 0;

  facets.handRefs.forEach((list, hand) => {
    const n = parseInt(hand, 10);
    if (!Number.isFinite(n) || n < 2) return;
    for (const ref of list) {
      total++;
      refs.push(ref);
      const type = tokenAt(parsed, ref)?.type ?? "text";
      const key = `hand ${hand} · ${type}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  });
  refs.sort(compareRefs);

  const breakdown = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => {
      const [, hand, type] = label.match(/^hand (\S+) · (.+)$/) ?? [];
      return { label, value, key: "hand_type", labelParams: { hand: hand ?? "?", type: type ?? "" } };
    });
  const handCount = new Set(breakdown.map((b) => b.label.split(" · ")[0])).size;

  return {
    headline:
      total === 0
        ? "No tokens attributed to a non-original hand."
        : `${plural(total, "token")} by ${plural(handCount, "non-original hand")}.`,
    params: { total, hands: handCount },
    messageKey: total === 0 ? "none" : undefined,
    count: total,
    breakdown,
    rows: refs.slice(0, ROW_LIMIT).map((ref) => {
      const token = tokenAt(parsed, ref);
      return {
        folioId: ref.folioId,
        lineNumber: ref.lineNumber,
        label: `hand ${token ? tokenHand(token) : "?"} · ${token?.type ?? ""}`,
        detail: token ? snippet(token.value.replace(/^\^?\d+#/, "")) : undefined,
      };
    }),
  };
}

/** `abbr.superscripts`: superscript letters vs interlinear scribal insertions. */
export function superscripts(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const sup = countOf(facets, "superscript");
  const ins = countOf(facets, "scribal_insertion");
  return {
    headline: `${plural(sup, "superscript abbreviation")} and ${plural(ins, "scribal insertion")}.`,
    params: { superscripts: sup, insertions: ins },
    count: sup + ins,
    breakdown: [
      { label: "superscript <<…>>", value: sup, key: "superscript" },
      { label: "scribal insertion [^…]", value: ins, key: "scribal_insertion" },
    ],
    rows: mergedRows(parsed, [
      { refs: refsOf(facets, "superscript"), label: "superscript" },
      { refs: refsOf(facets, "scribal_insertion"), label: "insertion" },
    ]),
  };
}

/** `illum.initial_hierarchy`: distribution of `{INn.}` depths. */
export function initialHierarchy(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const depths = [...facets.initialDepth.keys()].sort((a, b) => a - b);
  const breakdown: BreakdownEntry[] = depths.map((d) => ({
    label: `IN${d}`,
    value: facets.initialDepth.get(d)?.length ?? 0,
  }));
  const refs: TokenRef[] = [];
  facets.initialDepth.forEach((list) => refs.push(...list));
  refs.sort(compareRefs);
  const total = refs.length;

  return {
    headline:
      total === 0
        ? "No illuminated initials ({INn.}) found."
        : `${plural(total, "initial")} across ${plural(depths.length, "depth level")}: ${breakdown.map((b) => `${b.label} ×${b.value}`).join(", ")}.`,
    params: { total, levels: depths.length },
    messageKey: total === 0 ? "none" : undefined,
    count: total,
    breakdown,
    rows: refs.slice(0, ROW_LIMIT).map((ref) => {
      const token = tokenAt(parsed, ref);
      return {
        folioId: ref.folioId,
        lineNumber: ref.lineNumber,
        label: `IN${token?.initialDepth ?? 1}`,
        detail: token?.value,
      };
    }),
  };
}

function blockRows(
  parsed: ParsedManuscript,
  sources: Array<{ refs: BlockRef[]; label: string }>,
): EvidenceRow[] {
  const tagged: Array<{ ref: BlockRef; label: string }> = [];
  for (const s of sources) {
    for (const ref of s.refs.slice(0, ROW_LIMIT)) tagged.push({ ref, label: s.label });
  }
  tagged.sort((a, b) => a.ref.folioIndex - b.ref.folioIndex || a.ref.blockIndex - b.ref.blockIndex);
  return tagged.slice(0, ROW_LIMIT).map(({ ref, label }) => {
    const block = parsed.folios[ref.folioIndex]?.blocks[ref.blockIndex];
    return {
      folioId: ref.folioId,
      lineNumber: ref.lineNumber,
      label,
      detail: block ? snippet(renderNormalizedBlock(block)) : undefined,
    };
  });
}

/** `marg.gloss_vs_addenda` */
export function glossVsAddenda(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const blockCount = (t: BlockType) => facets.blockTypeCounts.get(t) ?? 0;
  const glosses = blockCount("gloss");
  const addenda = blockCount("addendum");
  return {
    headline: `${plural(glosses, "gloss", "glosses")} and ${plural(addenda, "addendum", "addenda")}.`,
    params: { glosses, addenda },
    count: glosses + addenda,
    breakdown: [
      { label: "gloss {GL.}", value: glosses, key: "gloss" },
      { label: "addendum {AD.}", value: addenda, key: "addendum" },
    ],
    rows: blockRows(parsed, [
      { refs: facets.blockRefs.get("gloss") ?? [], label: "gloss" },
      { refs: facets.blockRefs.get("addendum") ?? [], label: "addendum" },
    ]),
  };
}

/** `damage.illegible`: `[??]` / `[???]` and bare missing fragments. */
export function damageIllegible(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const illegible = refsOf(facets, "illegible_text");
  const missing = countOf(facets, "missing_fragment");
  const short = illegible.filter((r) => tokenAt(parsed, r)?.value.length === 2).length;
  const long = illegible.length - short;
  return {
    headline: `${plural(illegible.length, "illegible passage")} and ${plural(missing, "missing fragment")}.`,
    params: { illegible: illegible.length, missing },
    count: illegible.length + missing,
    breakdown: [
      { label: "[??]", value: short },
      { label: "[???]", value: long },
      { label: "missing ??", value: missing, key: "missing_fragment" },
    ],
    rows: mergedRows(parsed, [
      { refs: illegible, label: "illegible", textOf: (t) => t.raw },
      { refs: refsOf(facets, "missing_fragment"), label: "missing", textOf: (t) => t.raw },
    ]),
  };
}

/** `damage.reconstructions_by_hand` */
export function reconstructionsByHand(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const refs = refsOf(facets, "reconstructed_text");
  const groups = new Map<string, number>();
  for (const ref of refs) {
    const token = tokenAt(parsed, ref);
    const hand = token ? tokenHand(token) : undefined;
    const key = hand ? `hand ${hand}` : "unmarked hand";
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const breakdown = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => {
      const hand = label.match(/^hand (\S+)$/)?.[1];
      return hand
        ? { label, value, key: "hand", labelParams: { hand } }
        : { label, value, key: "unmarked_hand" };
    });

  return {
    headline: `${plural(refs.length, "reconstruction")} across ${plural(groups.size, "hand")}.`,
    params: { total: refs.length, hands: groups.size },
    count: refs.length,
    breakdown,
    rows: refs.slice(0, ROW_LIMIT).map((ref) => {
      const token = tokenAt(parsed, ref);
      const hand = token ? tokenHand(token) : undefined;
      return {
        folioId: ref.folioId,
        lineNumber: ref.lineNumber,
        label: hand ? `hand ${hand}` : "unmarked",
        detail: token ? snippet(token.value.replace(/^\^?\d+#/, "")) : undefined,
      };
    }),
  };
}

/** `layout.wrapback`: `%2` / `%3` calderón marks. */
export function layoutWrapback(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const two = countOf(facets, "calderon_two");
  const three = countOf(facets, "calderon_three");
  const folios = foliosWith(facets, ["calderon_two", "calderon_three"]);
  return {
    headline: `${plural(two, "%2 mark")} and ${plural(three, "%3 mark")} across ${plural(folios, "folio")}.`,
    params: { two, three, folios },
    count: two + three,
    breakdown: [
      { label: "%2", value: two },
      { label: "%3", value: three },
    ],
    rows: mergedRows(parsed, [
      { refs: refsOf(facets, "calderon_two"), label: "%2", textOf: (t) => t.raw },
      { refs: refsOf(facets, "calderon_three"), label: "%3", textOf: (t) => t.raw },
    ]),
  };
}

function languageRows(facets: FacetIndex, parsed: ParsedManuscript): EvidenceRow[] {
  const tagged: Array<{ ref: TokenRef; code: string }> = [];
  facets.languageSpans.forEach((facet, code) => {
    for (const ref of facet.spans.slice(0, ROW_LIMIT)) tagged.push({ ref, code });
  });
  tagged.sort((a, b) => compareRefs(a.ref, b.ref));
  return tagged.slice(0, ROW_LIMIT).map(({ ref, code }) => {
    const block = parsed.folios[ref.folioIndex]?.blocks[ref.blockIndex];
    return {
      folioId: ref.folioId,
      lineNumber: ref.lineNumber,
      label: code,
      detail: block ? snippet(renderNormalizedBlock(block)) : undefined,
    };
  });
}

/** `lex.code_switching`: language spans by HSMS code. */
export function codeSwitching(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  const entries = [...facets.languageSpans.entries()].sort(
    (a, b) => b[1].spans.length - a[1].spans.length || a[0].localeCompare(b[0]),
  );
  const spanTotal = entries.reduce((n, [, f]) => n + f.spans.length, 0);
  return {
    headline:
      spanTotal === 0
        ? "No language spans ({LAT.}, {ARG.}, …) found."
        : `${plural(spanTotal, "language span")} in ${plural(entries.length, "language")}: ${entries.map(([c, f]) => `${c} ${f.spans.length} (${plural(f.words, "word")})`).join(", ")}.`,
    params: { spans: spanTotal, languages: entries.length },
    messageKey: spanTotal === 0 ? "none" : undefined,
    count: spanTotal,
    breakdown: entries.map(([code, f]) => ({ label: code, value: f.spans.length, key: "lang", labelParams: { code } })),
    rows: languageRows(facets, parsed),
  };
}

/** `ml.foreign_ratio`: words inside language spans vs all words. */
export function foreignRatio(facets: FacetIndex, parsed: ParsedManuscript): RecipeResult {
  let foreign = 0;
  facets.languageSpans.forEach((f) => {
    foreign += f.words;
  });
  const total = facets.walkedWords;
  const pct = total === 0 ? 0 : (foreign / total) * 100;
  const breakdown = [...facets.languageSpans.entries()]
    .sort((a, b) => b[1].words - a[1].words || a[0].localeCompare(b[0]))
    .map(([code, f]) => ({ label: code, value: f.words, key: "lang", labelParams: { code } }));

  return {
    headline: `${pct.toFixed(1)}% of words (${foreign} of ${total}) fall inside language spans.`,
    params: { pct: pct.toFixed(1), foreign, total },
    count: foreign,
    breakdown,
    rows: languageRows(facets, parsed),
  };
}
