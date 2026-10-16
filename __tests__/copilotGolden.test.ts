/**
 * Golden expectations for exact (Tier A) recipes on OSTA witnesses from the library
 * (SPEC-COPILOT §12). Skipped when the library entries are not present.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getRecipe } from "../utils/copilot/catalog";
import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { parseHsMsText } from "../utils/manuscriptParser";

const ENTRIES = join(__dirname, "..", "public", "library", "entries");

function load(baseName: string) {
  const path = join(ENTRIES, `${baseName}.json`);
  if (!existsSync(path)) return null;
  const { transcriptionText } = JSON.parse(readFileSync(path, "utf8")) as { transcriptionText: string };
  const parsed = parseHsMsText(transcriptionText);
  return { parsed, facets: buildFacetIndex(parsed) };
}

function count(w: NonNullable<ReturnType<typeof load>>, id: string): number {
  const recipe = getRecipe(id);
  if (!recipe) throw new Error(`missing recipe ${id}`);
  return recipe.run({ parsed: w.parsed, facets: w.facets }, {}).count;
}

const GOLDEN: Record<string, Record<string, number>> = {
  "TEXT.CDP": {
    "corr.deletions_scribal_vs_editorial": 323,
    "abbr.superscripts": 752,
    "illum.initial_hierarchy": 391,
    "lex.code_switching": 2,
    "damage.illegible": 1,
    "codex.nonsequitur_after_cw": 0,
  },
  "TEXT.GRM": {
    "corr.deletions_scribal_vs_editorial": 39,
    "corr.non_original_hands": 3,
    "abbr.superscripts": 69,
    "lex.code_switching": 161,
    "dial.tagged_spans": 1,
  },
  "TEXT.PER": {
    "corr.deletions_scribal_vs_editorial": 517,
    "corr.non_original_hands": 897,
    "illum.initial_hierarchy": 180,
    "marg.gloss_vs_addenda": 3651,
    "damage.reconstructions_by_hand": 13,
    "lex.code_switching": 1404,
  },
};

describe("copilot golden Tier A counts on OSTA witnesses", () => {
  for (const [baseName, expected] of Object.entries(GOLDEN)) {
    const witness = load(baseName);
    (witness ? it : it.skip)(`${baseName}`, () => {
      for (const [id, n] of Object.entries(expected)) {
        expect([id, count(witness!, id)]).toEqual([id, n]);
      }
    });
  }

  it("is deterministic: the same recipe twice gives identical results", () => {
    const w = load("TEXT.GRM");
    if (!w) return;
    for (const id of ["abbr.expansion_by_quire", "morph.contractions", "stats.ttr_hapax", "ngrams.top"]) {
      const r = getRecipe(id)!;
      expect(JSON.stringify(r.run({ parsed: w.parsed, facets: w.facets }, {}))).toBe(
        JSON.stringify(r.run({ parsed: w.parsed, facets: w.facets }, {})),
      );
    }
  });
});

describe("askCopilot end to end (slots, expressions, ranges)", () => {
  const w = load("TEXT.CDP");
  const maybe = w ? it : it.skip;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { askCopilot } = require("../utils/copilot/ask") as typeof import("../utils/copilot/ask");
  maybe("routes a collocation question and carries its slots into the expression", () => {
    const a = askCopilot('collocates of "rey" within 3 words', w!.parsed, { facets: w!.facets });
    expect(a.recipeId).toBe("colloc.window");
    expect(a.usedParams).toMatchObject({ word: "rey", window: 3 });
    expect(a.dsl).toBe("recipe colloc.window window=3 word=rey");
    const again = askCopilot(a.dsl!, w!.parsed, { facets: w!.facets });
    expect(again.recipeId).toBe("colloc.window");
    expect(again.rows).toEqual(a.rows);
  });
  maybe("narrows an eager recipe to a folio range", () => {
    const first = w!.parsed.folios[0].id;
    const third = w!.parsed.folios[Math.min(2, w!.parsed.folios.length - 1)].id;
    const whole = askCopilot("recipe abbr.superscripts", w!.parsed, { facets: w!.facets });
    const part = askCopilot(`recipe abbr.superscripts range=${first}-${third}`, w!.parsed, { facets: w!.facets });
    expect(part.usedParams?.range).toBe(`${first}-${third}`);
    expect(Number(part.params?.superscripts)).toBeLessThan(Number(whole.params?.superscripts));
    const asked = askCopilot(`how many superscript abbreviations in fols. ${first}-${third}`, w!.parsed, { facets: w!.facets });
    expect(asked.recipeId).toBe("abbr.superscripts");
    expect(asked.params?.superscripts).toBe(part.params?.superscripts);
  });
});
