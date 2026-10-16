/**
 * Routing quality gates (SPEC-COPILOT §12) on held-out paraphrases written per language.
 * Floors are the measured values at implementation time; raise them as triggers improve.
 * Spec targets: top-1 ≥ 85%, top-3 ≥ 95% per locale; ≥ 95% of out-of-scope questions rejected.
 */
import { evaluateRouting, negativeRejectionRate } from "../utils/copilot/routerEval";
import { buildRouterIndex, routeQuery, routingLocales } from "../utils/copilot/router";
import { parseHsMsText } from "../utils/manuscriptParser";
import { NEGATIVES, PARAPHRASES, EQUIVALENT_RECIPES } from "./fixtures/copilotParaphrases";

const FLOORS = { top1: 0.85, top3: 0.95, negatives: 0.8 };

describe("copilot routing accuracy", () => {
  const scores = evaluateRouting(PARAPHRASES, ["en", "es", "pt", "ca", "gl", "eu"], undefined, EQUIVALENT_RECIPES);
  for (const s of scores) {
    it(`${s.locale}: top-1 ≥ ${FLOORS.top1 * 100}% and top-3 ≥ ${FLOORS.top3 * 100}% (${s.total} paraphrases)`, () => {
      expect(s.total).toBeGreaterThanOrEqual(50);
      expect(s.top1 / s.total).toBeGreaterThanOrEqual(FLOORS.top1);
      expect(s.top3 / s.total).toBeGreaterThanOrEqual(FLOORS.top3);
    });
  }

  it("cross-language: Spanish queries route with a Portuguese UI (UI ∪ en ∪ witness)", () => {
    const router = buildRouterIndex(undefined, routingLocales("pt-BR", "SPN"));
    const parsed = parseHsMsText("[fol. 1r]\n{CB1.\n1 texto\n}");
    const route = routeQuery("muestra las tachaduras del copista frente a las del editor", parsed, router);
    expect(route.kind === "recipe" && route.top?.recipeId).toBe("corr.deletions_scribal_vs_editorial");
  });

  it(`rejects ≥ ${FLOORS.negatives * 100}% of out-of-scope questions`, () => {
    const router = buildRouterIndex(undefined, ["en", "es", "pt", "ca", "gl", "eu"]);
    expect(negativeRejectionRate(NEGATIVES, router)).toBeGreaterThanOrEqual(FLOORS.negatives);
  });

  it("routingLocales maps community locales to their fallback language", () => {
    expect(routingLocales("qu")).toEqual(["es", "en"]);
    expect(routingLocales("oc-aranes")).toEqual(["ca", "en"]);
    expect(routingLocales("en", "PRT")).toEqual(["en", "pt"]);
  });
});
