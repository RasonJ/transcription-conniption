import { parseHsMsText, tokenizeString, extractLinePrefix, isPlausibleMarginLineNumber } from "../utils/manuscriptParser";
import { createFigureIdAllocator } from "../utils/figureAnchors";
import { stripEnvironmentClose } from "../utils/figureAnchors";
import { parseFolioMarker } from "../utils/folioMarkers";
import { assembleStructuralTokens, tokenizeLineStructural } from "../utils/structuralAssembly";
import { buildConcordance } from "../utils/concordance";

describe("HSMS Parser Engine Core Tests", () => {
  it("processes word-internal expansion brackets inside diacritic strings", () => {
    const tokens = tokenizeString("c<r>on@~ica");
    expect(tokens.some((t) => t.type === "expansion" && t.value === "r")).toBe(true);
    expect(tokens.map((t) => t.value).join("")).toMatch(/croñica/i);
    expect(tokens.some((t) => t.raw.includes("on@~"))).toBe(true);
  });

  it("keeps {INn.} initials inline on the same prose line", () => {
    const ast = parseHsMsText("[fol. 3r]\n{CB1.\n1 {IN4.} SPhera segundo Euclides\n}");
    const prose = ast.folios[0]?.blocks.find((b) => b.type === "prose");
    expect(prose).toBeDefined();
    expect(prose?.tokens[0]?.type).toBe("drop_initial");
    expect(prose?.tokens[0]?.value).toBe("S");
    expect(prose?.tokens[0]?.initialDepth).toBe(4);
    expect(ast.folios[0]?.blocks.some((b) => b.type === "initial_container")).toBe(false);
    expect(prose?.tokens.some((t) => t.value.startsWith("Phera"))).toBe(true);
  });

  it("strips and records complex alphanumeric line numbers", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB1.\n1 {RUB. Test}\n}");
    expect(ast.stats.totalLines).toBe(1);
    const rubricBlock = ast.folios[0]?.blocks.find((b) => b.type === "rubric");
    expect(rubricBlock).toBeDefined();
    expect(rubricBlock?.tokens.some((t) => /test/i.test(t.value))).toBe(true);
  });

  it("does not treat hyphen-wrap prose fragments as margin line numbers", () => {
    expect(extractLinePrefix("rem que eu ey por bem")).toEqual({
      line: "rem que eu ey por bem",
    });
    expect(extractLinePrefix("Pero nunez meu Cosmografo")).toEqual({
      line: "Pero nunez meu Cosmografo",
    });
    expect(isPlausibleMarginLineNumber("rem")).toBe(false);
    expect(isPlausibleMarginLineNumber("Pero")).toBe(false);
    expect(isPlausibleMarginLineNumber("42")).toBe(true);
    expect(isPlausibleMarginLineNumber("cxxxi")).toBe(true);
    expect(extractLinePrefix("1 {IN4.} SPhera")).toEqual({
      lineNumber: "1",
      line: "{IN4.} SPhera",
    });
    expect(extractLinePrefix("1537. Lisboa")).toEqual({ line: "1537. Lisboa" });
    expect(extractLinePrefix("cxxx[ij]. {RUB. test}")).toEqual({
      lineNumber: "cxxx[ij].",
      line: "{RUB. test}",
    });
  });

  it("parses folio 1v alvará without splicing hyphen-wrap words into margin refs", () => {
    const demo = `[fol. 1v]
{CB1.
{IN5.} EU el Rey fac'o saber a quantos este meu aluara vi-
rem que eu ey por bem & me praz que ho Doutor
Pero nunez meu Cosmografo possa ma~dar empri-
mir todas as obras que tem feytas: assi em Latim
como em Lingoagem das sciencias Mathemati-
cas & Cosmografia.}`;

    const ast = parseHsMsText(demo);
    const blocks = ast.folios[0]?.blocks ?? [];
    for (let i = 0; i < blocks.length; i++) {
      const ln = blocks[i].lineNumber;
      if (ln) {
        expect(isPlausibleMarginLineNumber(ln)).toBe(true);
      }
    }
    const second = blocks[1];
    expect(second?.lineNumber).toBeUndefined();
    expect(second?.tokens.some((t) => t.value.startsWith("rem") || t.normalized?.startsWith("rem"))).toBe(
      true,
    );
  });

  it("preserves inline figure closers when stripping environment braces", () => {
    const result = stripEnvironmentClose("9 {ILL. Astrolabe plate.}");
    expect(result.endsBlock).toBe(false);
    expect(result.line).toBe("9 {ILL. Astrolabe plate.}");
  });

  it("assigns stable figure_anchor ids per folio", () => {
    const ast = parseHsMsText(
      "[fol. 3r]\n{CB1.\n4 {ILL. Astrolabe plate.}\n9 {DIAG. Sphere diagram.}\n}",
    );
    const figures = ast.folios[0]?.blocks.flatMap((b) =>
      b.tokens.filter((t) => t.type === "figure_anchor"),
    );
    expect(figures).toHaveLength(2);
    expect(figures?.[0]?.figureId).toMatch(/^3r_fig_001$/);
    expect(figures?.[1]?.figureId).toMatch(/^3r_fig_002$/);
  });

  it("tokenizes inline figure mnemonics with captions", () => {
    const allocator = createFigureIdAllocator("1r");
    const tokens = tokenizeString("{MIN. Marginal miniature of a compass.}", allocator);
    const fig = tokens.find((t) => t.type === "figure_anchor");
    expect(fig?.figureType).toBe("MIN");
    expect(fig?.value).toContain("compass");
  });

  it("counts expansions as single words in stats", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB1.\n1 com<m>o se diz\n}");
    expect(ast.stats.totalWords).toBeGreaterThanOrEqual(3);
  });

  it("keeps nested LAT spans inside rubric blocks on one line", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB1.\n12 {RUB. Capitulo {LAT. Jn Dei nomine} fizo test.}\n}",
    );
    const rubric = ast.folios[0]?.blocks.find((b) => b.type === "rubric");
    expect(rubric).toBeDefined();
    expect(rubric?.tokens.some((t) => t.envLayers?.some((l) => l.code === "LAT"))).toBe(true);
    expect(rubric?.tokens.some((t) => /fizo/i.test(t.value))).toBe(true);
  });

  it("continues language_span blocks across hyphenated lines", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB1.\n12 {LAT. Jn de-\n13 fensio ciuitatis}\n}",
    );
    const langBlock = ast.folios[0]?.blocks.find((b) => b.type === "language_span");
    expect(langBlock).toBeDefined();
    expect(langBlock?.language).toBe("LAT");
  });

  it("continues rubric environments across physical lines without a + marker", () => {
    const ast = parseHsMsText(
      "[fol. 1r]\n{CB1.\n12 {RUB. Capitulo primo\n13 continua rubrica\n14 fin rubrica}\n}",
    );
    const rubricBlocks = ast.folios[0]?.blocks.filter((b) => b.type === "rubric") ?? [];
    expect(rubricBlocks.length).toBeGreaterThanOrEqual(3);
    expect(rubricBlocks.every((b) => b.tokens.some((t) => t.envLayers?.some((l) => l.code === "RUB")))).toBe(
      true,
    );

    const messages = (ast.validationErrors ?? []).map((e) => e.message);
    expect(messages.filter((m) => /unclosed environment/i.test(m))).toHaveLength(0);
    expect(messages.filter((m) => /stray closing brace/i.test(m))).toHaveLength(0);
    expect(messages.filter((m) => /extra structural closing/i.test(m))).toHaveLength(0);
  });

  it("tokenizes scribal punctuation markers", () => {
    const tokens = tokenizeString("rey$. mas");
    expect(tokens.some((t) => t.type === "scribal_punctuation" && t.raw === "$.")).toBe(true);
  });

  it("indexes rey without scribal punctuation suffix in concordance", () => {
    const ast = parseHsMsText("[fol. 1r]\n{CB1.\n1 el rey$. del pueblo\n}");
    const index = buildConcordance(ast);
    expect(index.rey?.count).toBeGreaterThanOrEqual(1);
  });
});

describe("folioMarkers", () => {
  it("parses column track suffix on folio markers", () => {
    expect(parseFolioMarker("[fol. 42rA]")).toEqual({
      id: "42rA",
      initialColumns: 2,
      columnTrack: "A",
    });
    expect(parseFolioMarker("[fol. cxxvib]")).toEqual({
      id: "cxxvib",
      initialColumns: 2,
      columnTrack: "b",
    });
  });

  it("applies initial column count from folio marker", () => {
    const ast = parseHsMsText("[fol. 42rA]\n{CB2.\n1 Una coluna de prova\n}");
    expect(ast.folios[0]?.blocks[0]?.columns).toBe(2);
  });
});

describe("structuralAssembly", () => {
  it("annotates tokens with nested environment layers", () => {
    const structural = tokenizeLineStructural("{RUB. foo {LAT. bar} baz}");
    const assembled = assembleStructuralTokens(structural);
    expect(assembled.lineOuterType).toBe("rubric");
    expect(assembled.fullyClosedLine).toBe(true);
    expect(assembled.contentTokens.some((t) => t.envLayers?.some((l) => l.code === "LAT"))).toBe(
      true,
    );
  });
});
