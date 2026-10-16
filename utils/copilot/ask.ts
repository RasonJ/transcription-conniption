import type { ParsedManuscript } from "../../constants/manuscript";
import type { PrecompiledFacets } from "../corpusPrecompute";
import type { ManuscriptVectorIndex } from "../manuscriptVectorIndex";
import { getRecipe } from "./catalog";
import { DSL_VERSION, executeDsl, formatDsl, parseDsl } from "./dsl";
import { buildFacetIndex, type FacetIndex } from "./facetIndex";
import { runCached } from "./precompute";
import { routeQuery, type RouterIndex } from "./router";
import { canServeEagerFromPrecompiled, runEagerFromPrecompiled } from "./sidecarRecipes";
import type { CopilotAnswer, Recipe, RecipeResult } from "./types";

export interface AskOptions {
  facets?: FacetIndex;
  /** When set, eager recipes prefer the batch sidecar (no AST facet rebuild). */
  precompiledFacets?: PrecompiledFacets;
  vectorIndex?: ManuscriptVectorIndex;
  router?: RouterIndex;
  /** Lazy live FacetIndex builder — called only when sidecar cannot answer. */
  resolveFacets?: () => FacetIndex;
}

const FALLBACK_ID = "search.passages";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function toAnswer(
  recipe: Pick<Recipe, "id" | "version" | "tier" | "method" | "dsl">,
  result: RecipeResult,
  t0: number,
  extra?: Partial<CopilotAnswer>,
): CopilotAnswer {
  return {
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    tier: recipe.tier,
    headline: result.headline,
    breakdown: result.breakdown,
    rows: result.rows,
    method: recipe.method,
    dsl: recipe.dsl,
    elapsedMs: now() - t0,
    navigate: result.navigate,
    ...extra,
  };
}

function resolveLiveFacets(
  parsed: ParsedManuscript,
  options: AskOptions,
): FacetIndex {
  if (options.facets) return options.facets;
  if (options.resolveFacets) return options.resolveFacets();
  return buildFacetIndex(parsed);
}

function runEagerRecipe(
  recipe: Recipe,
  parsed: ParsedManuscript,
  options: AskOptions,
): RecipeResult {
  if (options.precompiledFacets && canServeEagerFromPrecompiled(recipe.id)) {
    const fromSidecar = runEagerFromPrecompiled(recipe.id, options.precompiledFacets);
    if (fromSidecar) return fromSidecar;
  }
  const facets = resolveLiveFacets(parsed, options);
  return runCached(recipe, parsed, facets);
}

/** Answer one catalog recipe directly (Overview chips, "Did you mean…" chips). */
export function runRecipeById(
  recipeId: string,
  parsed: ParsedManuscript,
  options: AskOptions & { query?: string } = {},
): CopilotAnswer | null {
  const t0 = now();
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;
  const result =
    recipe.precompute === "eager"
      ? runEagerRecipe(recipe, parsed, options)
      : recipe.run(
          {
            parsed,
            facets: resolveLiveFacets(parsed, options),
            vectorIndex: options.vectorIndex,
          },
          { query: options.query },
        );
  return toAnswer(recipe, result, t0);
}

/**
 * Local copilot: DSL expression → folio jump → recipe routing → passage-search fallback.
 */
export function askCopilot(
  query: string,
  parsed: ParsedManuscript,
  options: AskOptions = {},
): CopilotAnswer {
  const t0 = now();
  const q = query.trim();
  if (!q) {
    return {
      recipeId: "none",
      recipeVersion: 0,
      tier: "A",
      headline: "Ask a question or pick one of the ready answers.",
      rows: [],
      method: "",
      elapsedMs: 0,
    };
  }

  const dsl = parseDsl(q);
  if (dsl) {
    const facets = resolveLiveFacets(parsed, options);
    const result = executeDsl(dsl, facets, parsed);
    return {
      recipeId: "dsl.count",
      recipeVersion: DSL_VERSION,
      tier: "A",
      headline: result.headline,
      breakdown: result.breakdown,
      rows: result.rows,
      method: "Evaluated a query expression directly over the parsed token stream.",
      dsl: formatDsl(dsl),
      elapsedMs: now() - t0,
    };
  }

  const route = routeQuery(q, parsed, options.router);

  if (route.kind === "folio") {
    const recipe = getRecipe("nav.folio");
    if (recipe) {
      const facets = resolveLiveFacets(parsed, options);
      const result = recipe.run({ parsed, facets }, { query: q });
      return toAnswer(recipe, result, t0, {
        navigate: result.navigate ?? route.folioJump,
        confidence: 1,
      });
    }
  }

  if (route.kind === "recipe" && route.top) {
    const recipe = getRecipe(route.top.recipeId);
    if (recipe) {
      const result =
        recipe.precompute === "eager"
          ? runEagerRecipe(recipe, parsed, options)
          : recipe.run(
              {
                parsed,
                facets: resolveLiveFacets(parsed, options),
                vectorIndex: options.vectorIndex,
              },
              { query: q },
            );
      return toAnswer(recipe, result, t0, { confidence: route.top.score });
    }
  }

  const fallback = getRecipe(FALLBACK_ID);
  const alternatives =
    route.kind === "recipe"
      ? route.alternatives.flatMap((m) => {
          const r = getRecipe(m.recipeId);
          return r ? [{ recipeId: r.id, score: m.score, chipLabel: r.present.chipLabel }] : [];
        })
      : [];
  if (!fallback) {
    return {
      recipeId: "none",
      recipeVersion: 0,
      tier: "A",
      headline: "No matching recipe.",
      rows: [],
      method: "",
      elapsedMs: now() - t0,
      alternatives,
    };
  }
  const result = fallback.run(
    {
      parsed,
      facets: resolveLiveFacets(parsed, options),
      vectorIndex: options.vectorIndex,
    },
    { query: q },
  );
  return toAnswer(fallback, result, t0, {
    alternatives,
    confidence: route.kind === "recipe" ? route.bestScore : undefined,
    headline: `No confident recipe match. ${result.headline}`,
  });
}
