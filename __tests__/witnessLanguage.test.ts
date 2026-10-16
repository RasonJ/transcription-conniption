import { buildConcordance, getConcordanceEntriesSorted } from "../utils/concordance";
import { parseHsMsText } from "../utils/manuscriptParser";
import {
  bcp47ForHsmsCode,
  detectWitnessLanguage,
  foldForSearch,
  stopwordsFor,
  witnessCollator,
} from "../utils/witnessLanguage";
import { isLanguageCode } from "../utils/environmentBlocks";

const witness = (body: string) => parseHsMsText(`[fol. 1r]\n{CB1.\n${body}\n}`);

describe("witness language (SPEC-I18N §8)", () => {
  it("detects Castilian, Portuguese, Catalan and Latin from function words", () => {
    expect(detectWitnessLanguage(witness("1 el rey dixo a los omnes del regno y con ellos fue muy alegre")).language).toBe("SPN");
    expect(detectWitnessLanguage(witness("1 o doutor foy ao paaço do rey com os seus e porem nom quis")).language).toBe("PRT");
    expect(detectWitnessLanguage(witness("1 lo rey dels catalans ab molt gran honor hi fo perque axi")).language).toBe("CAT");
    expect(detectWitnessLanguage(witness("1 et dixit eis quod non est ad cum sunt enim autem")).language).toBe("LAT");
  });

  it("selects stopwords by witness language", () => {
    expect(stopwordsFor("LAT").has("et")).toBe(true);
    expect(stopwordsFor("CAT").has("dels")).toBe(true);
    expect(stopwordsFor("SPN").has("dels")).toBe(false);
  });

  it("concordance drops the detected language's function words", () => {
    const index = buildConcordance(witness("1 et dixit eis quod non est ad regem et populum"));
    expect(index.et).toBeUndefined();
    expect(index.quod).toBeUndefined();
  });

  it("folds accents for search", () => {
    expect(foldForSearch("Rúbricas")).toBe("rubricas");
    expect(foldForSearch("CORAÇÃO")).toBe("coracao");
  });

  it("collates lemmas in the witness language", () => {
    const compare = witnessCollator("SPN");
    expect(["zorra", "ábaco", "nube"].sort(compare)).toEqual(["ábaco", "nube", "zorra"]);
    const entries = getConcordanceEntriesSorted(
      { zeta: { count: 1, occurrences: [] }, árbol: { count: 1, occurrences: [] } },
      "SPN",
    );
    expect(entries.map((e) => e.lemma)).toEqual(["árbol", "zeta"]);
  });

  it("recognizes corpus language codes ARG, CAL and GRK", () => {
    expect(isLanguageCode("ARG")).toBe(true);
    expect(isLanguageCode("GRK")).toBe(true);
    expect(isLanguageCode("CAL")).toBe(true);
    expect(bcp47ForHsmsCode("LAT")).toBe("la");
    expect(bcp47ForHsmsCode("ARG")).toBe("an");
  });
});
