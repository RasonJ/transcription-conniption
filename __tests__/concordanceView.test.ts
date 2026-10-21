import { createMockOccurrence } from "./fixtures/occurrenceFactory";
import { hashEmbed } from "../utils/embeddings/hashEmbed";
import * as hsmsDict from "@/utils/hsmsDictionary";
import {
  compareConcordanceEntries,
  contextDistanceWeight,
  contextTokenSalient,
  exactMatchTier,
  formatRelativeImportance,
  getMostCommonForm,
  getSortedOccurrences,
  getSortedOccurrencesHybrid,
  morphologyMultiplier,
  nextTranslationLang,
  relativeImportance,
  scoreHybridOccurrence,
  scoreMultiSignalOccurrence,
  scoreOccurrenceContext,
  translationLangForLocale,
  type RankableConcordanceEntry,
} from "../utils/concordanceView";
import { documentTermShare, smoothUnlistedIdf } from "../utils/corpusTfidfScore";

function entry(partial: Partial<RankableConcordanceEntry> & Pick<RankableConcordanceEntry, "lemma" | "count">): RankableConcordanceEntry {
  return {
    mostCommonForm: partial.lemma,
    translation: partial.lemma,
    tfidf: partial.tfidf ?? relativeImportance(partial.count, 1000),
    ...partial,
  };
}

describe("relative importance", () => {
  const corpus = {
    totalDocuments: 739,
    idf: { ciencia: 1.886799 },
    df: { ciencia: 120 },
  };

  it("is the term's share of the manuscript times the catalog IDF", () => {
    expect(documentTermShare(10, 1000)).toBeCloseTo(0.01, 10);
    expect(relativeImportance(10, 1000, corpus, "ciencia")).toBeCloseTo(0.01 * 1.886799, 10);
    expect(formatRelativeImportance(0.01423)).toBe("0.0142");
  });

  it("uses the smooth IDF when the catalog does not list the term", () => {
    const idf = smoothUnlistedIdf(739, 0);
    expect(idf).toBeCloseTo(Math.log((739 + 1) / 1) + 1, 10);
    expect(relativeImportance(10, 1000, corpus, "zzzz")).toBeCloseTo(0.01 * idf, 10);
  });

  it("prefers the language slice when that slice lists the surface form", () => {
    const sliced = {
      totalDocuments: 739,
      idf: { ciencia: 1.5 },
      df: { ciencia: 10 },
      byLanguage: {
        PRT: { totalDocuments: 40, idf: { sciencia: 3.2 }, df: { sciencia: 2 } },
      },
    };
    expect(relativeImportance(4, 200, sliced, "ciencia", "sciencia", "PRT")).toBeCloseTo((4 / 200) * 3.2, 10);
  });
});

describe("hybrid concordance sort", () => {
  const locale = "en";

  it("ranks count >= 3 by importance before rarer terms ranked by count", () => {
    const frequentLow = entry({ lemma: "zorro", count: 3, tfidf: 0.01 });
    const frequentHigh = entry({ lemma: "ciencia", count: 8, tfidf: 0.04 });
    const rare = entry({ lemma: "alfa", count: 2, tfidf: 0.9 });
    const rarer = entry({ lemma: "beta", count: 1, tfidf: 0.8 });
    const sorted = [rare, frequentLow, rarer, frequentHigh].sort((a, b) =>
      compareConcordanceEntries(a, b, "default", "desc", locale),
    );
    expect(sorted.map((row) => row.lemma)).toEqual(["ciencia", "zorro", "alfa", "beta"]);
  });

  it("breaks importance ties by lemma", () => {
    const b = entry({ lemma: "beta", count: 4, tfidf: 0.02 });
    const a = entry({ lemma: "alfa", count: 5, tfidf: 0.02 });
    expect(compareConcordanceEntries(a, b, "default", "desc", locale)).toBeLessThan(0);
  });

  it("sorts an explicit translation column alphabetically", () => {
    const a = entry({ lemma: "b", count: 4, translation: "apple" });
    const b = entry({ lemma: "a", count: 4, translation: "zebra" });
    expect(compareConcordanceEntries(a, b, "translation", "asc", locale)).toBeLessThan(0);
    expect(compareConcordanceEntries(a, b, "translation", "desc", locale)).toBeGreaterThan(0);
  });
});

describe("KWIC context salience", () => {
  const idf = { "es:reyno": 8, "es:castilla": 7, "es:la": 0.4, "es:de": 0.3, "es:del": 0.35 };

  function occ(pre: string, post: string, folioId = "1r") {
    return createMockOccurrence({ folioId, preContext: pre, postContext: post, keyword: "ley" });
  }

  it("weights the first two neighbors fully, the third by half, and the rest by a quarter", () => {
    expect(contextDistanceWeight(1)).toBe(1);
    expect(contextDistanceWeight(2)).toBe(1);
    expect(contextDistanceWeight(3)).toBe(0.5);
    expect(contextDistanceWeight(6)).toBe(0.25);
  });

  it("ranks a distinctive context above a function-word context", () => {
    const distinctive = occ("ley del reyno de", "castilla");
    const common = occ("la ley de la", "casa");
    expect(scoreOccurrenceContext(distinctive, idf, "es")).toBeGreaterThan(
      scoreOccurrenceContext(common, idf, "es"),
    );
    const sorted = getSortedOccurrences([common, distinctive], idf, "es");
    expect(sorted[0]).toBe(distinctive);
  });

  it("counts the nearest word on the left as distance 1", () => {
    const near = occ("reyno", "");
    const far = occ("reyno y la otra", "");
    expect(scoreOccurrenceContext(near, idf, "es")).toBeCloseTo(8);
    expect(scoreOccurrenceContext(far, idf, "es")).toBeLessThan(scoreOccurrenceContext(near, idf, "es"));
  });
});

describe("hybrid and morphological KWIC ranking", () => {
  beforeEach(() => {
    jest.spyOn(hsmsDict, "lookupHsmsLemma").mockImplementation((surface) => {
      const key = surface.toLowerCase();
      if (key === "reyna" || key === "reina") return "reina";
      if (key === "vino" || key === "pena") return key;
      return undefined;
    });
    jest.spyOn(hsmsDict, "lookupHsmsPos").mockImplementation((surface) => {
      const key = surface.toLowerCase();
      if (key === "vino" || key === "pena") return "NCMS000";
      if (key === "reigns") return "VMIP3S0";
      return undefined;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function occ(keyword: string, pre: string, post: string) {
    return createMockOccurrence({ keyword, preContext: pre, postContext: post });
  }

  it("scales context TF-IDF by embedding alignment and falls back when there is no query", () => {
    const medical = occ("ley", "jarabe maceracion", "botica");
    const plain = occ("ley", "la casa", "grande");
    const queryVec = hashEmbed("botica jarabe");
    const blended = scoreHybridOccurrence(medical, queryVec, null, "es");
    expect(blended).toBeGreaterThan(scoreHybridOccurrence(plain, queryVec, null, "es"));
    expect(scoreHybridOccurrence(medical, null, null, "es")).toBeCloseTo(
      scoreOccurrenceContext(medical, null, "es"),
    );
    const sorted = getSortedOccurrencesHybrid([plain, medical], "botica jarabe", null, "es");
    expect(sorted[0]).toBe(medical);
  });

  it("boosts a shared lemma, a shared POS category, and a scribal variant", () => {
    expect(morphologyMultiplier("reyna", "reina", "reina")).toBeCloseTo(1.35);
    expect(morphologyMultiplier("reyna", "reyna", "reina")).toBeCloseTo(1.85);
    expect(morphologyMultiplier("vino", "pena", null)).toBeCloseTo(1.25);
    expect(morphologyMultiplier("reigns", "pena", null)).toBe(1);
    expect(morphologyMultiplier("liuro", "livro", null)).toBeCloseTo(1.2);

    const queen = occ("reyna", "del", "castilla");
    const other = occ("casa", "del", "castilla");
    expect(scoreMultiSignalOccurrence(queen, "reina", "reina", null, null, "es")).toBeGreaterThan(
      scoreMultiSignalOccurrence(other, "reina", "reina", null, null, "es"),
    );
    const ranked = getSortedOccurrences([other, queen], null, "es", "reina");
    expect(ranked[0].keyword).toBe("reyna");
  });

  it("puts the folded diplomatic spelling above a richer variant", () => {
    expect(exactMatchTier("Réyna", "reyna")).toBe(2);
    expect(exactMatchTier("reina", "reyna", "reina")).toBe(1);
    expect(exactMatchTier("casa", "reyna", "reina")).toBe(0);

    const idf = { "es:reyno": 8, "es:castilla": 7, "es:la": 0.4, "es:de": 0.3 };
    const exact = occ("reyna", "la", "de");
    const variant = occ("reina", "reyno", "castilla");
    const sorted = getSortedOccurrences([variant, exact], idf, "es", "reyna");
    expect(sorted.map((row) => row.keyword)).toEqual(["reyna", "reina"]);

    const thin = occ("reyna", "la", "de");
    const rich = occ("Reyna", "reyno", "castilla");
    expect(getSortedOccurrences([thin, rich], idf, "es", "reyna")[0]).toBe(rich);
  });

  it("bolds an exact query token and a high-IDF neighbor", () => {
    expect(contextTokenSalient("Réyna", "reyna", null, "es")).toBe(true);
    expect(contextTokenSalient("reyno", "ley", { "es:reyno": 8, "es:la": 0.4 }, "es")).toBe(true);
    expect(contextTokenSalient("la", "ley", { "es:reyno": 8, "es:la": 0.4 }, "es")).toBe(false);
  });

  it("picks the most frequent diplomatic form", () => {
    expect(
      getMostCommonForm({
        variants: { reina: 2, reyna: 5, reyne: 5 },
        occurrences: [createMockOccurrence({ keyword: "reina" })],
      }),
    ).toBe("reyna");
    expect(getMostCommonForm({ occurrences: [createMockOccurrence({ keyword: "fazer" })] })).toBe("fazer");
  });

  it("lifts an exact lemma or form to the top of the default list sort", () => {
    const exact = entry({ lemma: "reyna", count: 3, mostCommonForm: "reyna", tfidf: 0.01 });
    const popular = entry({ lemma: "reynado", count: 40, mostCommonForm: "reynado", tfidf: 9 });
    expect(compareConcordanceEntries(exact, popular, "default", "desc", "en", "reyna")).toBeLessThan(0);
    expect(compareConcordanceEntries(exact, popular, "default", "desc", "en")).toBeGreaterThan(0);
  });
});

describe("translation language", () => {
  it("uses the locale base and cycles the supported set", () => {
    expect(translationLangForLocale("pt-BR")).toBe("pt");
    expect(translationLangForLocale("qu")).toBe("en");
    expect(nextTranslationLang("eu")).toBe("en");
    expect(nextTranslationLang("en")).toBe("es");
  });
});
