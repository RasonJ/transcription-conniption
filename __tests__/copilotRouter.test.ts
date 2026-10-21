import {
  EMBED_DIRECT_THRESHOLD,
  EMBED_SUGGEST_THRESHOLD,
  buildRouterIndex,
  embeddingBand,
  normalizeQuery,
  rankRecipes,
  resolveEmbeddingIntent,
  routeQuery,
} from "../utils/copilot/router";
import { askCopilot } from "../utils/copilot/ask";
import { parseCopilotSample } from "./copilotFixture";

describe("copilot router", () => {
  const parsed = parseCopilotSample();

  it("normalizes: NFD, strip marks, lowercase, collapse spaces", () => {
    expect(normalizeQuery("  Dónde   expungió, el ESCRIBA ")).toBe("donde expungio el escriba");
  });

  it("routes an English deletion query to corr.deletions_scribal_vs_editorial", () => {
    const route = routeQuery("show scribal deletions versus editorial deletions", parsed);
    expect(route.kind).toBe("recipe");
    if (route.kind === "recipe") {
      expect(route.top?.recipeId).toBe("corr.deletions_scribal_vs_editorial");
    }
  });

  it("routes a paraphrase", () => {
    const [best] = rankRecipes("list the scribal deletions and editorial deletions please");
    expect(best.recipeId).toBe("corr.deletions_scribal_vs_editorial");
  });

  it("routes Spanish triggers regardless of accents", () => {
    const route = routeQuery("correcciones del escriba", parsed);
    expect(route.kind === "recipe" && route.top?.recipeId).toBe("corr.deletions_scribal_vs_editorial");
    const accentless = rankRecipes("distribucion de las iniciales iluminadas")[0];
    expect(accentless.recipeId).toBe("illum.initial_hierarchy");
  });

  it("takes the folio fast path before classification", () => {
    const route = routeQuery("go to fol. 1v", parsed);
    expect(route).toEqual({ kind: "folio", folioJump: { folioId: "1v" } });
  });

  it("returns no top match and alternatives below the threshold for unrelated queries", () => {
    const route = routeQuery("translate this into french", parsed);
    expect(route.kind).toBe("recipe");
    if (route.kind === "recipe") {
      expect(route.top).toBeNull();
      expect(route.alternatives.length).toBeLessThanOrEqual(3);
    }
  });

  it("honors a custom router index and threshold", () => {
    const router = buildRouterIndex(
      [{ id: "x.only", triggers: { en: ["alpha beta gamma"] } }],
      ["en"],
      0.9,
    );
    const hit = routeQuery("alpha beta gamma", parsed, router);
    expect(hit.kind === "recipe" && hit.top?.recipeId).toBe("x.only");
    const miss = routeQuery("alpha delta", parsed, router);
    expect(miss.kind === "recipe" && miss.top).toBeNull();
  });

  it("splits hash-embedding cosine into execute, suggest, and fallback", () => {
    expect(embeddingBand(EMBED_DIRECT_THRESHOLD)).toBe("execute");
    expect(embeddingBand(0.75)).toBe("suggest");
    expect(embeddingBand(EMBED_SUGGEST_THRESHOLD - 0.001)).toBe("fallback");
  });

  it("dispatches an exact catalog trigger from the embedding index", () => {
    const hit = resolveEmbeddingIntent("show scribal deletions versus editorial deletions", "en");
    expect(hit.type).toBe("execute");
    if (hit.type === "execute") {
      expect(hit.recipeId).toBe("corr.deletions_scribal_vs_editorial");
      expect(hit.confidence).toBeGreaterThanOrEqual(EMBED_DIRECT_THRESHOLD);
    }
  });

  it("runs the embedding match when the sparse router stays below its threshold", () => {
    const router = buildRouterIndex(
      [{ id: "x.only", triggers: { en: ["alpha beta gamma"] } }],
      ["en"],
      0.99,
    );
    const answer = askCopilot("show scribal deletions versus editorial deletions", parsed, { router });
    expect(answer.recipeId).toBe("corr.deletions_scribal_vs_editorial");
    expect(answer.confidence).toBeGreaterThanOrEqual(EMBED_DIRECT_THRESHOLD);
  });
});
