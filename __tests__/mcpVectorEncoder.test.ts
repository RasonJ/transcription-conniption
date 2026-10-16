import { compileManuscriptTree } from "../utils/compiler";
import {
  MCP_FLAG,
  encodeMcpBlock,
  featureFlagsForBlock,
  flagsMatchQuery,
  semanticHashDistance,
} from "../utils/copilot/mcpVectorEncoder";

describe("mcpVectorEncoder", () => {
  it("sets rubric and gloss feature flags", () => {
    const parsed = compileManuscriptTree(`[fol. 1r]
{CB1.
1 {RUB. % Capitulo}
2 {GLR. % nota marginal}}`);
    const folio = parsed.folios[0];
    const rubric = folio.blocks.find((b) => b.type === "rubric");
    const gloss = folio.blocks.find((b) => b.type === "gloss");
    expect(rubric).toBeDefined();
    expect(gloss).toBeDefined();
    expect(featureFlagsForBlock(rubric!) & MCP_FLAG.RUBRIC).toBeTruthy();
    expect(featureFlagsForBlock(gloss!) & MCP_FLAG.GLOSS).toBeTruthy();
  });

  it("encodes a hybrid MCP block vector", () => {
    const parsed = compileManuscriptTree(`[fol. 1r]
{CB1.
1 En el nonbre de Dios}`);
    const block = parsed.folios[0].blocks[0];
    const vec = encodeMcpBlock(block, "1r", 0, 0.1);
    expect(vec.blockId).toContain("1r");
    expect(vec.semanticHash).toHaveLength(32);
    expect(vec.codicology.folioProgress).toBeCloseTo(0.1);
    expect(vec.codicology.charCount).toBeGreaterThan(0);
  });

  it("compares semantic hashes and flag queries", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 9]);
    expect(semanticHashDistance(a, a)).toBe(0);
    expect(semanticHashDistance(a, b)).toBe(6);
    expect(flagsMatchQuery(MCP_FLAG.RUBRIC | MCP_FLAG.GLOSS, MCP_FLAG.RUBRIC)).toBe(true);
    expect(flagsMatchQuery(MCP_FLAG.RUBRIC, MCP_FLAG.GLOSS)).toBe(false);
  });
});
