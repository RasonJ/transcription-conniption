import fs from "fs";
import path from "path";
import { compileManuscriptTree } from "../utils/compiler";
import { renderNormalizedText } from "../utils/normalizedText";

/**
 * Legacy reference:
 *   ../PedroNunes-TRS/text-TRS.txt
 *   ../PedroNunes-TRS/text-TRS.txt_cc-test.htm
 */
const PEDRO_NUNES_TRS_PATH =
  process.env.PEDRO_NUNES_TRS_PATH ??
  path.resolve(__dirname, "../../PedroNunes-TRS/text-TRS.txt");

const trsAvailable = fs.existsSync(PEDRO_NUNES_TRS_PATH);

function folio(ast: ReturnType<typeof compileManuscriptTree>, id: string) {
  return ast.folios.find((f) => f.id === id);
}

describe("Pedro Nunes TRS corpus parity", () => {
  if (!trsAvailable) {
    it.skip("text-TRS.txt not found beside repo (set PEDRO_NUNES_TRS_PATH)", () => {});
    return;
  }

  const raw = fs.readFileSync(PEDRO_NUNES_TRS_PATH, "utf8");
  const ast = compileManuscriptTree(raw);

  it("compiles full TRS without throwing", () => {
    expect(ast.folios.length).toBeGreaterThan(10);
    expect(ast.stats.totalWords).toBeGreaterThan(5000);
  });

  it("normalizes RMK title diacritics like legacy HTML", () => {
    expect(ast.metadata.title).toMatch(/anotaç/i);
    expect(ast.metadata.title).not.toMatch(/c'o~/);
  });

  it("folio 3r: inline IN5 drop cap on prologue line", () => {
    const f3 = folio(ast, "3r");
    expect(f3).toBeDefined();
    const prologue = f3!.blocks.find(
      (b) => b.type === "prose" && b.tokens[0]?.type === "drop_initial" && b.tokens[0]?.value === "O",
    );
    expect(prologue?.tokens[0]?.initialDepth).toBe(5);
    expect(renderNormalizedText(prologue!.tokens)).toMatch(/Tratado da sphera/i);
  });

  it("folio 3r: MIN line keeps IN3 S drop cap inline with SPhera", () => {
    const f3 = folio(ast, "3r");
    const withMin = f3!.blocks.find((b) =>
      b.tokens.some((t) => t.type === "figure_anchor" && t.figureType === "MIN"),
    );
    expect(withMin).toBeDefined();
    const dropS = withMin!.tokens.find((t) => t.type === "drop_initial" && t.value === "S");
    expect(dropS?.initialDepth).toBe(3);
    const body = renderNormalizedText(withMin!.tokens);
    expect(body).toMatch(/Phera segundo Euclides/i);
    expect(body).not.toMatch(/c'o~/);
  });

  it("folio 3r: IN2 D drop cap on DUas diuisões line", () => {
    const f3 = folio(ast, "3r");
    const duas = f3!.blocks.find(
      (b) => b.type === "prose" && b.tokens[0]?.type === "drop_initial" && b.tokens[0]?.value === "D",
    );
    expect(duas?.tokens[0]?.initialDepth).toBe(2);
    expect(renderNormalizedText(duas!.tokens)).toMatch(/diuis/i);
  });

  it("folio 1r: title page opens with ILL block and IN4 drop cap T", () => {
    const f1 = folio(ast, "1r");
    expect(f1).toBeDefined();
    const titleLine = f1!.blocks.find((b) =>
      b.tokens.some((t) => t.type === "figure_anchor" && t.figureType === "ILL"),
    );
    expect(titleLine).toBeDefined();
    const dropT = titleLine!.tokens.find((t) => t.type === "drop_initial");
    expect(dropT?.value).toBe("T");
    expect(dropT?.initialDepth).toBe(4);
  });
});
