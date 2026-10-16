/**
 * Tier D recipes need server processing (SPEC-COPILOT §4, §13). With the backend off they
 * still answer the part that can be approximated locally and say what needs the server.
 */
import type { RecipeContext, RecipeResult } from "../types";
import { enclisis } from "./tierB";
import { symbSpans } from "./tierAExtra";

/** `syntax.clitic_position`: local approximation = enclitic vs proclitic counts (Tier B). */
export function cliticPosition(ctx: RecipeContext): RecipeResult {
  const local = enclisis(ctx);
  return {
    ...local,
    needsServer:
      "Splitting enclitic vs proclitic placement by main vs subordinate clause needs POS tagging and clause parsing (server). Shown: the local Tier B approximation for the whole witness.",
  };
}

/** `ml.aljamiado_density`: local approximation = {SYMB.} span inventory. */
export function aljamiadoDensity(ctx: RecipeContext): RecipeResult {
  const local = symbSpans(ctx);
  return {
    ...local,
    needsServer:
      "Separating Romance vocabulary from Arabic or Hebrew loanwords inside transliterated spans needs the Aljamiado lexicon (server). Shown: the spans found locally.",
  };
}
