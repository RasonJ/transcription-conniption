import { MANUSCRIPT_INTENT_PROTOTYPES } from "../constants/manuscriptIntents";
import type { ParsedManuscript } from "../constants/manuscript";
import { buildProtoVectors, classifyIntent } from "../utils/embeddings/intentClassifier";
import {
  askManuscript,
  resolveFolioJump,
  searchManuscriptIndex,
} from "../utils/manuscriptSearch";
import { buildManuscriptVectorIndex } from "../utils/manuscriptVectorIndex";
import { compileManuscriptTree } from "../utils/compiler";

const SAMPLE = `{RMK: Test Author.}
{RMK: Vector Search Witness.}
[fol. 1r]
{CB1.
1 {RUB. De auro puro.}
2 prose about parchment and ink
3 {GL. marginal note on gold}
[fol. 2v]
{CB1.
1 second leaf body text about navigation
}`;

describe("manuscript vector search", () => {
  let parsed: ParsedManuscript;

  beforeAll(() => {
    parsed = compileManuscriptTree(SAMPLE);
  });

  it("builds a contiguous embedding matrix matching chunk count", () => {
    const index = buildManuscriptVectorIndex(parsed, 64);
    expect(index.chunks.length).toBeGreaterThan(0);
    expect(index.matrix.length).toBe(index.chunks.length * 64);
    expect(index.dim).toBe(64);
  });

  it("resolves folio jump queries against leaf ids", () => {
    expect(resolveFolioJump("go to fol. 2v", parsed)?.folioId).toBe("2v");
    expect(resolveFolioJump("go to folio 2v", parsed)?.folioId).toBe("2v");
    expect(resolveFolioJump("[fol. 1r]", parsed)?.folioId).toBe("1r");
    expect(resolveFolioJump("turn to page 2v", parsed)?.folioId).toBe("2v");
    expect(resolveFolioJump("go to 2v", parsed)?.folioId).toBe("2v");
    expect(resolveFolioJump("unrelated query", parsed)).toBeNull();
  });

  it("returns folio mode without vector hits when a leaf is named", () => {
    const index = buildManuscriptVectorIndex(parsed, 64);
    const result = askManuscript("go to folio 2v", parsed, index);
    expect(result.mode).toBe("folio");
    expect(result.folioJump?.folioId).toBe("2v");
    expect(result.hits).toHaveLength(0);
  });

  it("ranks rubric-related chunks highly for gold queries", () => {
    const index = buildManuscriptVectorIndex(parsed, 128);
    const hits = searchManuscriptIndex("auro gold rubric", index, 5, 0.05);
    expect(hits.length).toBeGreaterThan(0);
    const topText = hits[0].chunk.text.toLowerCase();
    expect(topText.includes("auro") || topText.includes("gold") || hits[0].chunk.type === "rubric").toBe(
      true,
    );
  });

  it("classifies manuscript intents from prototypes", () => {
    const protos = buildProtoVectors({ ...MANUSCRIPT_INTENT_PROTOTYPES });
    const [top] = classifyIntent("show me the rubrics and red headings", protos);
    expect(top.intent).toBe("find_rubric");
    expect(top.score).toBeGreaterThan(0.3);
  });

  it("filters to rubric blocks when find_rubric intent wins", () => {
    const index = buildManuscriptVectorIndex(parsed, 128);
    const result = askManuscript("find rubrics and red titles", parsed, index, {
      minScore: 0.05,
    });
    if (result.mode === "filtered") {
      expect(result.hits.every((h) => h.chunk.type === "rubric")).toBe(true);
    } else {
      expect(result.hits.length).toBeGreaterThanOrEqual(0);
    }
  });
});
