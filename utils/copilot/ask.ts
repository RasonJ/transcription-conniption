import type { ParsedManuscript } from "../../constants/manuscript";
import type { PrecompiledFacets } from "../corpusPrecompute";
import type { HsmsFacsSidecar } from "../ingest/types";
import type { ManuscriptVectorIndex } from "../manuscriptVectorIndex";
import type { WitnessLanguage } from "../witnessLanguage";
import { RECIPES, getRecipe } from "./catalog";
import { DSL_VERSION, executeDsl, formatDsl, parseDsl } from "./dsl";
import { formatRecipeExpression, parseRecipeExpression } from "./dslRecipes";
import { buildFacetIndex, type FacetIndex } from "./facetIndex";
import { runCached } from "./precompute";
import { routeQuery, type RouterIndex } from "./router";
import { canServeEagerFromPrecompiled, runEagerFromPrecompiled } from "./sidecarRecipes";
import { extractSlots, missingSlots } from "./slots";
import type { CopilotAnswer, Recipe, RecipeContext, RecipeParams, RecipeResult, RegistryWitness } from "./types";

export interface AskOptions {
  facets?: FacetIndex;
  /** When set, eager recipes prefer the batch sidecar (no AST facet rebuild). */
  precompiledFacets?: PrecompiledFacets;
  vectorIndex?: ManuscriptVectorIndex;
  router?: RouterIndex;
  /** Lazy live FacetIndex builder — called only when sidecar cannot answer. */
  resolveFacets?: () => FacetIndex;
  /** Witness base language (stopwords, contraction lists); detected when absent. */
  witnessLanguage?: WitnessLanguage;
  /** Collation formula overriding catchword-inferred quires. */
  collation?: string;
  /** Batch-compiled witnesses for corpus-scope recipes. */
  registry?: RegistryWitness[];
  /** Ingest sidecar for machine-transcribed witnesses. */
  sidecar?: HsmsFacsSidecar;
}

const FALLBACK_ID = "search.passages";
const KNOWN_IDS = new Set(RECIPES.map((r) => r.id));

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Parameters other than the raw query (they change the result, so they bypass the cache). */
function explicitParams(params: RecipeParams): RecipeParams {
  const out: RecipeParams = {};
  for (const [k, v] of Object.entries(params)) if (k !== "query" && v !== undefined) out[k] = v;
  return out;
}

function toAnswer(
  recipe: Pick<Recipe, "id" | "version" | "tier" | "method" | "dsl">,
  result: RecipeResult,
  t0: number,
  extra?: Partial<CopilotAnswer>,
  used: RecipeParams = {},
): CopilotAnswer {
  const usedParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(explicitParams(used))) {
    if (v && typeof v === "object") {
      const r = v as unknown as { from: string; to: string };
      usedParams[k] = `${r.from}-${r.to}`;
    } else usedParams[k] = v as string | number;
  }
  const hasParams = Object.keys(usedParams).length > 0;
  return {
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    tier: recipe.tier,
    headline: result.headline,
    params: result.params,
    messageKey: result.messageKey,
    needsServer: result.needsServer,
    breakdown: result.breakdown,
    rows: result.rows,
    method: recipe.method,
    dsl: hasParams || !recipe.dsl ? formatRecipeExpression(recipe.id, explicitParams(used)) : recipe.dsl,
    usedParams: hasParams ? usedParams : undefined,
    elapsedMs: now() - t0,
    navigate: result.navigate,
    ...extra,
  };
}

function resolveLiveFacets(parsed: ParsedManuscript, options: AskOptions): FacetIndex {
  if (options.facets) return options.facets;
  if (options.resolveFacets) return options.resolveFacets();
  return buildFacetIndex(parsed);
}

function contextFor(parsed: ParsedManuscript, options: AskOptions, facets: FacetIndex): RecipeContext {
  return {
    parsed,
    facets,
    vectorIndex: options.vectorIndex,
    witnessLanguage: options.witnessLanguage,
    collation: options.collation,
    registry: options.registry,
    sidecar: options.sidecar,
  };
}

/** Narrow the witness to a folio range (`fol. 3r–10v`) before a recipe runs. */
function narrowToRange(parsed: ParsedManuscript, range: RecipeParams["range"]): ParsedManuscript | null {
  if (!range) return null;
  const ids = parsed.folios.map((f) => f.id.toLowerCase());
  const from = ids.indexOf(range.from.toLowerCase());
  const to = ids.indexOf(range.to.toLowerCase());
  if (from < 0 || to < 0) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { ...parsed, folios: parsed.folios.slice(a, b + 1), concordance: undefined };
}

function runEagerRecipe(recipe: Recipe, parsed: ParsedManuscript, options: AskOptions): RecipeResult {
  if (options.precompiledFacets && canServeEagerFromPrecompiled(recipe.id)) {
    const fromSidecar = runEagerFromPrecompiled(recipe.id, options.precompiledFacets);
    if (fromSidecar) return fromSidecar;
  }
  const facets = resolveLiveFacets(parsed, options);
  if (options.witnessLanguage || options.collation || options.registry || options.sidecar) {
    // Context-dependent answers are not shared through the per-witness cache.
    return recipe.run(contextFor(parsed, options, facets), {});
  }
  return runCached(recipe, parsed, facets);
}

/** Run a recipe with parameters (slots, ranges); eager recipes without parameters use the cache. */
function runRecipe(recipe: Recipe, parsed: ParsedManuscript, options: AskOptions, params: RecipeParams): RecipeResult {
  const narrowed = narrowToRange(parsed, params.range);
  const explicit = explicitParams(params);
  if (recipe.precompute === "eager" && !narrowed && Object.keys(explicit).length === 0) {
    return runEagerRecipe(recipe, parsed, options);
  }
  const target = narrowed ?? parsed;
  const facets = narrowed ? buildFacetIndex(narrowed) : resolveLiveFacets(parsed, options);
  return recipe.run(contextFor(target, options, facets), params);
}

/** Answer one catalog recipe directly (Overview chips, "Did you mean…" chips, DSL). */
export function runRecipeById(
  recipeId: string,
  parsed: ParsedManuscript,
  options: AskOptions & { query?: string; params?: RecipeParams } = {},
): CopilotAnswer | null {
  const t0 = now();
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;
  const params: RecipeParams = { ...(options.params ?? {}), query: options.query ?? options.params?.query };
  const result = runRecipe(recipe, parsed, options, params);
  return toAnswer(recipe, result, t0, undefined, params);
}

/**
 * Local copilot: DSL / recipe expression → folio jump → recipe routing (+ slots) →
 * passage-search fallback.
 */
export function askCopilot(query: string, parsed: ParsedManuscript, options: AskOptions = {}): CopilotAnswer {
  const t0 = now();
  const q = query.trim();
  if (!q) {
    return {
      recipeId: "none",
      recipeVersion: 0,
      tier: "A",
      headline: "Ask a question or pick one of the ready answers.",
      messageKey: "empty",
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

  const expression = parseRecipeExpression(q, KNOWN_IDS);
  if (expression) {
    const recipe = getRecipe(expression.recipeId);
    if (recipe) {
      const result = runRecipe(recipe, parsed, options, expression.params);
      return toAnswer(recipe, result, t0, { confidence: 1 }, expression.params);
    }
  }

  const route = routeQuery(q, parsed, options.router);

  if (route.kind === "folio") {
    const recipe = getRecipe("nav.folio");
    if (recipe) {
      const facets = resolveLiveFacets(parsed, options);
      const result = recipe.run(contextFor(parsed, options, facets), { query: q });
      return toAnswer(recipe, result, t0, {
        navigate: result.navigate ?? route.folioJump,
        confidence: 1,
      });
    }
  }

  if (route.kind === "recipe" && route.top) {
    const recipe = getRecipe(route.top.recipeId);
    if (recipe) {
      const params = extractSlots(q, recipe);
      const missing = missingSlots(recipe, params);
      const result = runRecipe(recipe, parsed, options, params);
      return toAnswer(
        recipe,
        result,
        t0,
        { confidence: route.top.score, slotPrompt: missing[0] },
        params,
      );
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
      messageKey: "noMatch",
      rows: [],
      method: "",
      elapsedMs: now() - t0,
      alternatives,
    };
  }
  const result = fallback.run(contextFor(parsed, options, resolveLiveFacets(parsed, options)), { query: q });
  return toAnswer(fallback, result, t0, {
    alternatives,
    confidence: route.kind === "recipe" ? route.bestScore : undefined,
    headline: `No confident recipe match. ${result.headline}`,
    lowConfidence: true,
  });
}
