import type { ParsedManuscript } from "../../constants/manuscript";
import { eagerRecipes } from "./catalog";
import { buildFacetIndex, type FacetIndex } from "./facetIndex";
import type { Recipe, RecipeCategory, RecipeResult } from "./types";

const cache = new Map<string, RecipeResult>();

function cacheKey(witnessHash: string, recipe: Pick<Recipe, "id" | "version">): string {
  return `${witnessHash}:${recipe.id}@${recipe.version}`;
}

export function clearPrecomputeCache(): void {
  cache.clear();
}

export function getPrecomputed(
  witnessHash: string,
  recipe: Pick<Recipe, "id" | "version">,
): RecipeResult | undefined {
  return cache.get(cacheKey(witnessHash, recipe));
}

/** Run a zero-param recipe, memoized by witness hash + recipe id + version. */
export function runCached(
  recipe: Recipe<Record<string, unknown>>,
  parsed: ParsedManuscript,
  facets: FacetIndex,
): RecipeResult {
  const key = cacheKey(facets.witnessHash, recipe);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = recipe.run({ parsed, facets }, {});
  cache.set(key, result);
  return result;
}

export interface OverviewEntry {
  recipeId: string;
  category: RecipeCategory;
  chipLabel: string;
  count: number;
  headline: string;
}

/** Run every eager recipe and return chip data (cached per witness). */
export function precomputeEager(
  parsed: ParsedManuscript,
  facets: FacetIndex = buildFacetIndex(parsed),
): OverviewEntry[] {
  return eagerRecipes().map((recipe) => {
    const result = runCached(recipe, parsed, facets);
    return {
      recipeId: recipe.id,
      category: recipe.category,
      chipLabel: recipe.present.chipLabel,
      count: result.count,
      headline: result.headline,
    };
  });
}
