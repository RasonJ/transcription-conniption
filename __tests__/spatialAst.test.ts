import fs from "fs";
import path from "path";
import { compileManuscriptTree } from "../utils/compiler";
import {
  buildSpatialFolio,
  lineToAstNodes,
  zipColumnBlockRows,
} from "../utils/spatialAst";

const PEDRO_NUNES_TRS_PATH =
  process.env.PEDRO_NUNES_TRS_PATH ??
  path.resolve(__dirname, "../../PedroNunes-TRS/text-TRS.txt");

describe("spatialAst", () => {
  it("folio 1v alvará: single column block with IN5 drop cap line", () => {
  const demo = `[fol. 1v]
{CB1.
{IN5.} EU el Rey fac'o saber a quantos este meu aluara vi-
rem que eu ey por bem & me praz que ho Doutor
Pero nunez meu Cosmografo possa ma~dar empri-
mir todas as obras que tem feytas: assi em Latim
como em Lingoagem das sciencias Mathemati-
cas & Cosmografia.}`;

    const ast = compileManuscriptTree(demo);
    const spatial = buildSpatialFolio(ast.folios[0]);

    expect(spatial.columnBlocks).toHaveLength(1);
    expect(spatial.columnBlocks[0].layout).toBe(1);
    expect(spatial.columnBlocks[0].lines.length).toBeGreaterThanOrEqual(5);

    const first = spatial.columnBlocks[0].lines[0];
    expect(first.block.tokens[0]?.type).toBe("drop_initial");
    expect(first.block.tokens[0]?.initialDepth).toBe(5);
    expect(lineToAstNodes(first.block).some((n) => n.type === "DropCap")).toBe(true);

    const second = spatial.columnBlocks[0].lines[1];
    expect(second.block.lineNumber).toBeUndefined();
    expect(second.block.tokens.some((t) => /rem/i.test(t.value))).toBe(true);
  });

  it("segments {CB2.} runs into isolated column blocks", () => {
    const demo = `[fol. 2r]
{CB1.
line one
line two}
{CB2.
left a
right gloss line}
{CB1.
back to one col}`;

    const ast = compileManuscriptTree(demo);
    const spatial = buildSpatialFolio(ast.folios[0]);

    expect(spatial.columnBlocks.map((c) => c.layout)).toEqual([1, 2, 1]);
    expect(spatial.columnBlocks[1].lines.some((l) => l.track === "left")).toBe(true);
    expect(spatial.columnBlocks[1].lines.some((l) => l.track === "right")).toBe(true);
  });

  it("zipColumnBlockRows pairs left/right at equal row index", () => {
    const demo = `[fol. 2r]
{CB2.
{RUB. left rubric}
{GLR. marginal gloss}
main left
gloss cont}`;

    const ast = compileManuscriptTree(demo);
    const cb2 = buildSpatialFolio(ast.folios[0]).columnBlocks[0];
    const rows = zipColumnBlockRows(cb2);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].left?.block.type).toBe("rubric");
    expect(rows[0].right?.block.type).toBe("gloss");
  });

  it("applyWrapBackLinesInPlace moves %2 suffix to previous line and trims carrier", () => {
    const demo = `[fol. 1r]
{CB1.
En os quaes se decrarão todas as principaes
%2 mouimento do sol: & sua}`;

    const ast = compileManuscriptTree(demo);
    const spatial = buildSpatialFolio(ast.folios[0]);
    const lines = spatial.columnBlocks[0].lines;

    expect(lines[0].wrapBackSuffix).toBe(" mouimento do sol: & sua");
    expect(lines[1].block.tokens.some((t) => t.type === "calderon_two")).toBe(true);
    expect(lines[1].block.tokens.some((t) => t.value?.includes("mouimento"))).toBe(false);
  });

  if (fs.existsSync(PEDRO_NUNES_TRS_PATH)) {
    it("Pedro Nunes TRS: every printable folio has at least one column block", () => {
      const raw = fs.readFileSync(PEDRO_NUNES_TRS_PATH, "utf8");
      const ast = compileManuscriptTree(raw);
      for (const folio of ast.folios) {
        const spatial = buildSpatialFolio(folio);
        expect(spatial.columnBlocks.length).toBeGreaterThan(0);
        const lineCount = spatial.columnBlocks.reduce((n, cb) => n + cb.lines.length, 0);
        expect(lineCount).toBeGreaterThan(0);
      }
    });
  }
});
