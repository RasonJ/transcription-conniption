import {
  compareConcordanceEntries,
  formatRelativeImportance,
  nextTranslationLang,
  relativeImportance,
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

describe("translation language", () => {
  it("uses the locale base and cycles the supported set", () => {
    expect(translationLangForLocale("pt-BR")).toBe("pt");
    expect(translationLangForLocale("qu")).toBe("en");
    expect(nextTranslationLang("eu")).toBe("en");
    expect(nextTranslationLang("en")).toBe("es");
  });
});
