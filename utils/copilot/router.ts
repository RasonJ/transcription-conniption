import type { ParsedManuscript } from "../../constants/manuscript";
import {
  INTENT_THRESHOLD,
  buildProtoVectors,
  classifyIntent,
  type ProtoVectors,
} from "../embeddings/intentClassifier";
import { resolveFolioJump } from "../manuscriptSearch";
import { RECIPES } from "./catalog";
import type { CopilotLocale, Recipe } from "./types";

const DEFAULT_LOCALES: CopilotLocale[] = ["en", "es"];
/** Alternatives below this score are not worth offering. */
export const ALTERNATIVE_FLOOR = 0.25;
const MAX_ALTERNATIVES = 3;
const KEY_SEP = "#";

const RE_MARKS = /[\u0300-\u036f]/g;
const RE_SPLIT_CHARS = /[,;]/g;
const RE_WS = /\s+/g;

/** NFD, strip combining marks, lowercase, collapse whitespace. */
export function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    .replace(RE_MARKS, "")
    .toLowerCase()
    .replace(RE_SPLIT_CHARS, " ")
    .replace(RE_WS, " ")
    .trim();
}

export interface RouterIndex {
  protos: ProtoVectors;
  threshold: number;
}

export interface RouteMatch {
  recipeId: string;
  score: number;
}

export type RouteResult =
  | { kind: "folio"; folioJump: { folioId: string; lineNumber?: string } }
  | {
      kind: "recipe";
      /** Best recipe at or above the threshold, else null. */
      top: RouteMatch | null;
      /** Next-best recipes below the threshold ("Did you mean…"). */
      alternatives: RouteMatch[];
      /** Best score regardless of threshold. */
      bestScore: number;
    };

const routerCache = new Map<string, RouterIndex>();

/**
 * One prototype per trigger phrase, so scores are max-pooled per recipe across phrases
 * and locales (no centroid dilution).
 */
export function buildRouterIndex(
  recipes: readonly Pick<Recipe, "id" | "triggers">[] = RECIPES,
  locales: CopilotLocale[] = DEFAULT_LOCALES,
  threshold: number = INTENT_THRESHOLD,
): RouterIndex {
  const prototypes: Record<string, string> = {};
  for (const recipe of recipes) {
    let n = 0;
    for (const locale of locales) {
      for (const phrase of recipe.triggers[locale] ?? []) {
        const normalized = normalizeQuery(phrase);
        if (normalized) prototypes[`${recipe.id}${KEY_SEP}${n++}`] = normalized;
      }
    }
  }
  return { protos: buildProtoVectors(prototypes), threshold };
}

export function defaultRouterIndex(locales: CopilotLocale[] = DEFAULT_LOCALES): RouterIndex {
  const key = locales.join(",");
  let index = routerCache.get(key);
  if (!index) {
    index = buildRouterIndex(RECIPES, locales);
    routerCache.set(key, index);
  }
  return index;
}

/** Rank recipes for a query by their best-matching trigger phrase. */
export function rankRecipes(query: string, router: RouterIndex = defaultRouterIndex()): RouteMatch[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const best = new Map<string, number>();
  for (const { intent, score } of classifyIntent(normalized, router.protos)) {
    const id = intent.slice(0, intent.lastIndexOf(KEY_SEP));
    if (!best.has(id)) best.set(id, score);
  }
  return [...best.entries()]
    .map(([recipeId, score]) => ({ recipeId, score }))
    .sort((a, b) => b.score - a.score);
}

/** Folio fast path first, then cosine routing against recipe triggers. */
export function routeQuery(
  query: string,
  parsed: ParsedManuscript,
  router: RouterIndex = defaultRouterIndex(),
): RouteResult {
  const folioJump = resolveFolioJump(query, parsed);
  if (folioJump) return { kind: "folio", folioJump };

  const ranked = rankRecipes(query, router);
  const top = ranked[0] && ranked[0].score >= router.threshold ? ranked[0] : null;
  const rest = ranked.slice(top ? 1 : 0, (top ? 1 : 0) + MAX_ALTERNATIVES);
  return {
    kind: "recipe",
    top,
    alternatives: rest.filter((m) => m.score >= ALTERNATIVE_FLOOR),
    bestScore: ranked[0]?.score ?? 0,
  };
}
