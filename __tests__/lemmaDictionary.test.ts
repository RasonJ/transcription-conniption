import { readFileSync } from "fs";
import { join } from "path";
import {
  ensureLemmaDictionary,
  getLemmaDictionaryState,
  lemmaDictionaryGeneration,
  loadLemmaDictionarySync,
  lookupHsmsLemma,
  resetLemmaDictionaryForTests,
  subscribeLemmaDictionary,
} from "../utils/hsmsDictionary";
import { decodeLemmaEntries, encodeLemmaEntries } from "../utils/lemmaDictionaryCodec";
import { buildConcordance, getConcordanceForManuscript } from "../utils/concordance";
import { parseHsMsText } from "../utils/manuscriptParser";

const JSON_PATH = join(__dirname, "..", "utils", "generated", "hsmsLemmaIndex.json");
const TSV_PATH = join(__dirname, "..", "public", "dic", "hsmsLemmaIndex.v2.tsv");

describe("lemma dictionary codec (SPEC-LIGHTWEIGHT §4.2)", () => {
  it("round-trips small tables including identity lemmas and shared prefixes", () => {
    const table = { fazer: "fazer", fizo: "fazer", fiziera: "fazer", ome: "omne", omes: "omne", "d'el": "de" };
    const decoded = decodeLemmaEntries(encodeLemmaEntries(table));
    expect(Object.fromEntries(decoded)).toEqual(table);
  });

  it("the generated web asset decodes to exactly the JSON index", () => {
    const json = JSON.parse(readFileSync(JSON_PATH, "utf8")) as Record<string, string>;
    const decoded = decodeLemmaEntries(readFileSync(TSV_PATH, "utf8"));
    expect(decoded.size).toBe(Object.keys(json).length);
    for (const [surface, lemma] of Object.entries(json)) {
      if (decoded.get(surface) !== lemma) throw new Error(`mismatch for ${surface}`);
    }
  });

  it("the web asset is smaller than the JSON it replaces", () => {
    const jsonBytes = readFileSync(JSON_PATH).length;
    const tsvBytes = readFileSync(TSV_PATH).length;
    expect(tsvBytes).toBeLessThan(jsonBytes * 0.5);
  });
});

describe("lazy lemma dictionary", () => {
  afterAll(() => {
    loadLemmaDictionarySync();
  });

  it("returns undefined until loaded, then resolves lemmas and notifies subscribers", async () => {
    resetLemmaDictionaryForTests();
    expect(getLemmaDictionaryState()).toBe("idle");
    const json = JSON.parse(readFileSync(JSON_PATH, "utf8")) as Record<string, string>;
    const [surface, lemma] = Object.entries(json).find(([s, l]) => s !== l && /^[a-z]+$/.test(s))!;
    expect(lookupHsmsLemma(surface)).toBeUndefined();

    const notified = jest.fn();
    const unsubscribe = subscribeLemmaDictionary(notified);
    const before = lemmaDictionaryGeneration();
    await ensureLemmaDictionary();
    unsubscribe();

    expect(getLemmaDictionaryState()).toBe("ready");
    expect(notified).toHaveBeenCalledTimes(1);
    expect(lemmaDictionaryGeneration()).toBeGreaterThan(before);
    expect(lookupHsmsLemma(surface)).toBe(lemma);
  });

  it("concordance falls back to surface forms, then rebuilds with lemmas", async () => {
    const json = JSON.parse(readFileSync(JSON_PATH, "utf8")) as Record<string, string>;
    const [surface, lemma] = Object.entries(json).find(
      ([s, l]) => s !== l && /^[a-z]{5,}$/.test(s) && /^[a-z]{5,}$/.test(l),
    )!;
    const source = `[fol. 1r]\n{CB1.\n1 ${surface} ${surface}\n}`;
    const ast = parseHsMsText(source);

    resetLemmaDictionaryForTests();
    const before = getConcordanceForManuscript(ast, source);
    expect(Object.keys(before)).toContain(surface);

    await ensureLemmaDictionary();
    const after = getConcordanceForManuscript(ast, source);
    expect(after).not.toBe(before);
    expect(Object.keys(after)).toContain(lemma);
    expect(after).toEqual(buildConcordance(ast));
  });
});
