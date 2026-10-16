import type { PrecompiledFacets, PrecompiledFacetHit } from "@/utils/corpusPrecompute";
import { eagerRecipes, getRecipe } from "./catalog";
import type { OverviewEntry } from "./precompute";
import type { BreakdownEntry, EvidenceRow, RecipeResult } from "./types";

function plural(n: number, one: string, other: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : other}`;
}

function tok(pre: PrecompiledFacets, type: string): number {
  return pre.facets.tokenCounts[type] ?? 0;
}

function blk(pre: PrecompiledFacets, type: string): number {
  return pre.facets.blockCounts[type] ?? 0;
}

function hitRows(hits: PrecompiledFacetHit[], label: string | ((h: PrecompiledFacetHit) => string)): EvidenceRow[] {
  return hits.slice(0, 50).map((h) => ({
    folioId: h.folioId,
    lineNumber: h.line,
    label: typeof label === "function" ? label(h) : label,
    detail: h.text,
  }));
}

/**
 * Answer an eager Tier-A recipe from a precompiled facets sidecar — no AST walk.
 * Returns null when the recipe needs live token refs we do not store in the sidecar.
 */
export function runEagerFromPrecompiled(
  recipeId: string,
  pre: PrecompiledFacets,
): RecipeResult | null {
  switch (recipeId) {
    case "corr.deletions_scribal_vs_editorial": {
      const scribal = tok(pre, "scribal_deletion");
      const editorial = tok(pre, "editorial_deletion");
      return {
        headline: `${plural(scribal, "scribal deletion")} and ${plural(editorial, "editorial deletion")} (precompiled).`,
        params: { scribal, editorial },
        count: scribal + editorial,
        breakdown: [
          { label: "scribal (^…)", value: scribal, key: "scribal_deletion" },
          { label: "editorial (…)", value: editorial, key: "editorial_deletion" },
        ],
        rows: [],
      };
    }
    case "corr.non_original_hands": {
      const hands = pre.facets.hands.filter((h) => {
        const n = Number.parseInt(h.hand, 10);
        return Number.isFinite(n) && n >= 2;
      });
      const total = hands.reduce((s, h) => s + h.count, 0);
      const breakdown: BreakdownEntry[] = hands.map((h) => ({
        label: `hand ${h.hand}`,
        value: h.count,
        key: "hand",
        labelParams: { hand: h.hand },
      }));
      return {
        headline:
          total === 0
            ? "No tokens attributed to a non-original hand."
            : `${plural(total, "token")} by ${plural(hands.length, "non-original hand")} (precompiled).`,
        params: { total, hands: hands.length },
        messageKey: total === 0 ? "none" : undefined,
        count: total,
        breakdown,
        rows: [],
      };
    }
    case "abbr.superscripts": {
      const sup = tok(pre, "superscript");
      const ins = tok(pre, "scribal_insertion");
      return {
        headline: `${plural(sup, "superscript abbreviation")} and ${plural(ins, "scribal insertion")} (precompiled).`,
        params: { superscripts: sup, insertions: ins },
        count: sup + ins,
        breakdown: [
          { label: "superscript <<…>>", value: sup, key: "superscript" },
          { label: "scribal insertion [^…]", value: ins, key: "scribal_insertion" },
        ],
        rows: [],
      };
    }
    case "illum.initial_hierarchy": {
      const byDepth = new Map<number, number>();
      for (const d of pre.facets.dropInitials) {
        const depth = d.depth ?? 1;
        byDepth.set(depth, (byDepth.get(depth) ?? 0) + 1);
      }
      // Prefer tokenCounts when excerpts were truncated.
      const total = Math.max(tok(pre, "drop_initial"), pre.facets.dropInitials.length);
      const depths = [...byDepth.keys()].sort((a, b) => a - b);
      const breakdown: BreakdownEntry[] =
        depths.length > 0
          ? depths.map((d) => ({ label: `IN${d}`, value: byDepth.get(d) ?? 0 }))
          : total > 0
            ? [{ label: "IN?", value: total }]
            : [];
      return {
        headline:
          total === 0
            ? "No illuminated initials ({INn.}) found."
            : `${plural(total, "initial")} (precompiled)${breakdown.length ? `: ${breakdown.map((b) => `${b.label} ×${b.value}`).join(", ")}` : ""}.`,
        params: { total, levels: depths.length },
        messageKey: total === 0 ? "none" : undefined,
        count: total,
        breakdown,
        rows: hitRows(pre.facets.dropInitials, (h) => `IN${h.depth ?? 1}`),
      };
    }
    case "marg.gloss_vs_addenda": {
      const glosses = Math.max(blk(pre, "gloss"), pre.facets.glosses.filter((g) => g.type !== "addendum").length);
      const addenda = Math.max(
        blk(pre, "addendum"),
        pre.facets.glosses.filter((g) => g.type === "addendum").length,
      );
      return {
        headline: `${plural(glosses, "gloss", "glosses")} and ${plural(addenda, "addendum", "addenda")} (precompiled).`,
        params: { glosses, addenda },
        count: glosses + addenda,
        breakdown: [
          { label: "gloss {GL.}", value: glosses, key: "gloss" },
          { label: "addendum {AD.}", value: addenda, key: "addendum" },
        ],
        rows: hitRows(pre.facets.glosses, (h) => h.type ?? "gloss"),
      };
    }
    case "damage.illegible": {
      const illegible = tok(pre, "illegible_text");
      const missing = tok(pre, "missing_fragment");
      return {
        headline: `${plural(illegible, "illegible passage")} and ${plural(missing, "missing fragment")} (precompiled).`,
        params: { illegible, missing },
        count: illegible + missing,
        breakdown: [
          { label: "illegible_text", value: illegible, key: "illegible" },
          { label: "missing_fragment", value: missing, key: "missing_fragment" },
        ],
        rows: [],
      };
    }
    case "damage.reconstructions_by_hand": {
      const total = tok(pre, "reconstructed_text");
      return {
        headline: `${plural(total, "reconstruction")} (precompiled).`,
        params: { total },
        messageKey: "precompiled",
        count: total,
        breakdown: [{ label: "reconstructed_text", value: total }],
        rows: [],
      };
    }
    case "layout.wrapback": {
      const two = tok(pre, "calderon_two");
      const three = tok(pre, "calderon_three");
      return {
        headline: `${plural(two, "%2 mark")} and ${plural(three, "%3 mark")} (precompiled).`,
        params: { two, three },
        messageKey: "precompiled",
        count: two + three,
        breakdown: [
          { label: "%2", value: two },
          { label: "%3", value: three },
        ],
        rows: [],
      };
    }
    case "lex.code_switching": {
      const entries = [...pre.facets.codeSwitching].sort(
        (a, b) => b.spans - a.spans || a.lang.localeCompare(b.lang),
      );
      const spanTotal = entries.reduce((n, e) => n + e.spans, 0);
      return {
        headline:
          spanTotal === 0
            ? "No language spans ({LAT.}, {ARG.}, …) found."
            : `${plural(spanTotal, "language span")} in ${plural(entries.length, "language")} (precompiled): ${entries.map((e) => `${e.lang} ${e.spans}`).join(", ")}.`,
        params: { spans: spanTotal, languages: entries.length },
        messageKey: spanTotal === 0 ? "none" : undefined,
        count: spanTotal,
        breakdown: entries.map((e) => ({ label: e.lang, value: e.spans, key: "lang", labelParams: { code: e.lang } })),
        rows: entries.map((e) => ({
          folioId: "—",
          label: e.lang,
          detail: `${e.spans} spans · ${e.words} words · ${e.tokens} tokens`,
        })),
      };
    }
    case "ml.foreign_ratio": {
      const foreign = pre.facets.codeSwitching.reduce((s, e) => s + e.words, 0);
      const total = pre.wordCount || 1;
      const pct = (foreign / total) * 100;
      return {
        headline: `${pct.toFixed(1)}% of words (${foreign} of ${pre.wordCount}) fall inside language spans (precompiled).`,
        params: { pct: pct.toFixed(1), foreign, total: pre.wordCount },
        count: foreign,
        breakdown: pre.facets.codeSwitching
          .slice()
          .sort((a, b) => b.words - a.words)
          .map((e) => ({ label: e.lang, value: e.words, key: "lang", labelParams: { code: e.lang } })),
        rows: [],
      };
    }
    default:
      return null;
  }
}

/** Overview chips from a facets sidecar (no FacetIndex / AST walk). */
export function overviewFromPrecompiled(pre: PrecompiledFacets): OverviewEntry[] {
  return eagerRecipes()
    .map((recipe) => {
      const result = runEagerFromPrecompiled(recipe.id, pre);
      if (!result) return null;
      return {
        recipeId: recipe.id,
        category: recipe.category,
        chipLabel: recipe.present.chipLabel,
        count: result.count,
        headline: result.headline,
      };
    })
    .filter((e): e is OverviewEntry => e !== null && e.count > 0)
    .sort((a, b) => a.chipLabel.localeCompare(b.chipLabel));
}

const EAGER_SIDECAR_RECIPES = new Set([
  "corr.deletions_scribal_vs_editorial",
  "corr.non_original_hands",
  "abbr.superscripts",
  "illum.initial_hierarchy",
  "marg.gloss_vs_addenda",
  "damage.illegible",
  "damage.reconstructions_by_hand",
  "layout.wrapback",
  "lex.code_switching",
  "ml.foreign_ratio",
]);

/** True when an eager recipe can be served entirely from the sidecar. */
export function canServeEagerFromPrecompiled(recipeId: string): boolean {
  return EAGER_SIDECAR_RECIPES.has(recipeId);
}

export function recipeChipLabel(recipeId: string): string {
  return getRecipe(recipeId)?.present.chipLabel ?? recipeId;
}
