import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Use jest/ts-jest path via dynamic import of compiled? Prefer registering tsx.
async function main() {
  const { evaluateRouting, negativeRejectionRate } = await import("../utils/copilot/routerEval.ts");
  const { buildRouterIndex } = await import("../utils/copilot/router.ts");
  const { NEGATIVES, PARAPHRASES, EQUIVALENT_RECIPES } = await import(
    "../__tests__/fixtures/copilotParaphrases.ts"
  );

  const scores = evaluateRouting(
    PARAPHRASES,
    ["en", "es", "pt", "ca", "gl", "eu"],
    undefined,
    EQUIVALENT_RECIPES,
  );
  for (const s of scores) {
    console.log(
      s.locale,
      "top1",
      (s.top1 / s.total).toFixed(4),
      `${s.top1}/${s.total}`,
      "top3",
      (s.top3 / s.total).toFixed(4),
      "misses",
      s.misses.length,
    );
    for (const m of s.misses) {
      console.log("  MISS", JSON.stringify(m));
    }
  }
  const router = buildRouterIndex(undefined, ["en", "es", "pt", "ca", "gl", "eu"]);
  console.log("neg", negativeRejectionRate(NEGATIVES, router));
  for (const q of NEGATIVES) {
    const { rankRecipes, OUT_OF_SCOPE_ID } = await import("../utils/copilot/router.ts");
    const top = rankRecipes(q, router)[0];
    const rejected =
      !top || top.recipeId === OUT_OF_SCOPE_ID || top.score < router.threshold;
    if (!rejected) console.log("  ACCEPTED NEG", q, "→", top?.recipeId, top?.score);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
