import {
  buildConcordance,
  clearConcordanceCache,
  getConcordanceForManuscript,
  PARSER_VERSION,
} from "../utils/concordance";
import { computeManuscriptStats } from "../utils/analyzeManuscript";
import { parseHsMsText } from "../utils/manuscriptParser";

const SOURCE = "[fol. 1r]\n{CB1.\n1 adela-\n2 ntar al pueblo adelantar\n}";

describe("lazy concordance", () => {
  beforeEach(() => {
    clearConcordanceCache();
  });

  it("enrichParsedManuscript leaves concordance undefined but keeps validation", () => {
    const ast = parseHsMsText(SOURCE);
    expect(ast.concordance).toBeUndefined();
    expect(ast.validationErrors).toBeDefined();
  });

  it("getConcordanceForManuscript builds on demand and matches buildConcordance", () => {
    const ast = parseHsMsText(SOURCE);
    const index = getConcordanceForManuscript(ast, SOURCE);
    expect(index.adelantar?.count).toBe(2);
    expect(Object.keys(index)).toEqual(Object.keys(buildConcordance(ast)));
  });

  it("memoizes by parsed reference", () => {
    const ast = parseHsMsText(SOURCE);
    expect(getConcordanceForManuscript(ast)).toBe(getConcordanceForManuscript(ast));
  });

  it("memoizes by source identity across re-parses", () => {
    const first = getConcordanceForManuscript(parseHsMsText(SOURCE), SOURCE);
    const second = getConcordanceForManuscript(parseHsMsText(SOURCE), `${SOURCE}\n`);
    expect(second).toBe(first);
  });

  it("rebuilds for different source text", () => {
    const first = getConcordanceForManuscript(parseHsMsText(SOURCE), SOURCE);
    const otherSource = "[fol. 1r]\n{CB1.\n1 palabra distinta\n}";
    const second = getConcordanceForManuscript(parseHsMsText(otherSource), otherSource);
    expect(second).not.toBe(first);
    expect(second.palabra).toBeDefined();
  });

  it("exposes a numeric parser version", () => {
    expect(typeof PARSER_VERSION).toBe("number");
  });

  it("computeManuscriptStats builds lazily or accepts an index", () => {
    const ast = parseHsMsText(SOURCE);
    const lazy = computeManuscriptStats(ast);
    const explicit = computeManuscriptStats(ast, { only: { count: 1, occurrences: [] } });
    expect(lazy.uniqueWords).toBeGreaterThan(1);
    expect(explicit.uniqueWords).toBe(1);
  });
});
