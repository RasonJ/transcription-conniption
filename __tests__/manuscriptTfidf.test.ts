import {
  concordanceIndexTfidf,
  indexLangForWitness,
  oovIdf,
  scoreTermCounts,
  sublinearTf,
} from "../utils/manuscriptTfidf";

describe("upload TF-IDF", () => {
  const table = { "es:ciencia": 2.5, fazer: 1.25 };

  it("maps witness codes onto index language prefixes", () => {
    expect(indexLangForWitness("SPN")).toBe("es");
    expect(indexLangForWitness("PRT")).toBe("pt");
    expect(indexLangForWitness("LAT")).toBe("la");
    expect(indexLangForWitness("en")).toBe("en");
  });

  it("scores with sublinear tf and a lang-scoped idf", () => {
    const scores = scoreTermCounts(new Map([["ciencia", 4], ["fazer", 1]]), table, "es", 100);
    expect(scores[0].term).toBe("ciencia");
    expect(scores[0].idf).toBe(2.5);
    expect(scores[0].tfidf).toBeCloseTo(sublinearTf(4) * 2.5);
    expect(scores[1].idf).toBe(1.25);
  });

  it("uses the smooth out-of-vocabulary idf when the term is unlisted", () => {
    const scores = scoreTermCounts(new Map([["zzzz", 2]]), table, "es", 739);
    expect(scores[0].idf).toBeCloseTo(oovIdf(739));
    expect(oovIdf(739)).toBeCloseTo(Math.log((739 + 1) / 2) + 1);
  });

  it("prefers the surface form's scoped idf for a concordance row", () => {
    const score = concordanceIndexTfidf(3, "ciencia", "sciencia", { "es:sciencia": 4 }, "es", 10);
    expect(score).toBeCloseTo(sublinearTf(3) * 4);
  });
});
