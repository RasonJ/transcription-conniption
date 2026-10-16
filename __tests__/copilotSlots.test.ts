import { extractSlots, extractWord } from "../utils/copilot/slots";
import { formatRecipeExpression, parseRecipeExpression } from "../utils/copilot/dslRecipes";
import { getRecipe } from "../utils/copilot/catalog";

describe("copilot slots", () => {
  it("extracts quoted and introduced words in several languages", () => {
    expect(extractWord('collocates of "rey"')).toBe("rey");
    expect(extractWord("colocaciones de dios")).toBe("dios");
    expect(extractWord("show every occurrence of senor")).toBe("senor");
  });
  it("extracts window, n and folio range", () => {
    const colloc = getRecipe("colloc.window")!;
    expect(extractSlots('collocates of "rey" within 3 words', colloc).window).toBe(3);
    const ngrams = getRecipe("ngrams.top")!;
    expect(extractSlots("top trigrams", ngrams).n).toBe(3);
    expect(extractSlots("bigramas más frecuentes", ngrams).n).toBe(2);
    const ttr = getRecipe("stats.ttr_hapax")!;
    expect(extractSlots("type-token ratio fol. 3r-10v", ttr).range).toEqual({ from: "3r", to: "10v" });
  });
});

describe("recipe expressions", () => {
  it("round-trips through the generic form", () => {
    const expr = formatRecipeExpression("colloc.window", { word: "rey", window: 5 });
    expect(expr).toBe("recipe colloc.window window=5 word=rey");
    expect(parseRecipeExpression(expr)).toEqual({ recipeId: "colloc.window", params: { word: "rey", window: 5 } });
  });
  it("parses shorthand forms", () => {
    expect(parseRecipeExpression("stats zipf")?.recipeId).toBe("stats.zipf");
    expect(parseRecipeExpression("ngrams n=2 top=10")).toEqual({ recipeId: "ngrams.top", params: { n: 2, top: 10 } });
    expect(parseRecipeExpression('kwic "dios"')).toEqual({ recipeId: "search.kwic", params: { word: "dios" } });
    expect(parseRecipeExpression("count graphs set=palatal_nasal group by quire")?.recipeId).toBe("abbr.nasal_tilde_vs_geminate");
    expect(parseRecipeExpression("recipe no.such", new Set(["stats.zipf"]))).toBeNull();
  });
});
