/**
 * Routing accuracy on held-out paraphrases (SPEC-COPILOT §12). Used by the unit test and
 * by `scripts/compile-copilot.ts` to fail CI when accuracy drops below the recorded floor.
 */
import { OUT_OF_SCOPE_ID, buildRouterIndex, rankRecipes, type RouterIndex } from "./router";
import type { CopilotLocale } from "./types";

export interface RoutingScore {
  locale: CopilotLocale;
  total: number;
  top1: number;
  top3: number;
  misses: Array<{ query: string; expected: string; got: string; score: number }>;
}

export function evaluateRouting(
  paraphrases: Record<string, Partial<Record<CopilotLocale, string[]>>>,
  locales: CopilotLocale[],
  routerFor: (locale: CopilotLocale) => RouterIndex = (l) => buildRouterIndex(undefined, l === "en" ? ["en"] : [l, "en"]),
  /** Recipes that answer the same question (e.g. two TTR recipes); a hit on either counts. */
  equivalents: Record<string, string[]> = {},
): RoutingScore[] {
  const ok = (expected: string, got: string | undefined) =>
    got === expected || (got !== undefined && (equivalents[expected] ?? []).includes(got));
  return locales.map((locale) => {
    const router = routerFor(locale);
    let total = 0, top1 = 0, top3 = 0;
    const misses: RoutingScore["misses"] = [];
    for (const [expected, byLocale] of Object.entries(paraphrases)) {
      for (const query of byLocale[locale] ?? []) {
        total++;
        const ranked = rankRecipes(query, router);
        if (ok(expected, ranked[0]?.recipeId)) top1++;
        else misses.push({ query, expected, got: ranked[0]?.recipeId ?? "-", score: ranked[0]?.score ?? 0 });
        if (ranked.slice(0, 3).some((r) => ok(expected, r.recipeId))) top3++;
      }
    }
    return { locale, total, top1, top3, misses };
  });
}

/** Share of out-of-scope questions whose best score stays below the confidence threshold. */
export function negativeRejectionRate(negatives: string[], router: RouterIndex): number {
  if (!negatives.length) return 1;
  const rejected = negatives.filter((q) => {
    const top = rankRecipes(q, router)[0];
    return !top || top.recipeId === OUT_OF_SCOPE_ID || top.score < router.threshold;
  }).length;
  return rejected / negatives.length;
}
