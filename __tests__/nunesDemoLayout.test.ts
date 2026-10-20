import { DEFAULT_DEMO } from "../constants/demoTranscriptions";
import {
  blockToSegs,
  stripDropCapPrefixFromSegs,
} from "../components/svgFacsimile/tokenRendering";
import { compileManuscriptTree } from "../utils/compiler";
import { renderNormalizedText } from "../utils/normalizedText";

const DISPLAY = {
  showExpanded: true,
  showDeletions: true,
  suppressOtioseMarks: false,
  useNormalizedDiacritics: true,
};

describe("Nunes demo leaf layout contracts", () => {
  const ast = compileManuscriptTree(DEFAULT_DEMO);
  const folio = ast.folios[0];

  it("opens folio 3r with IN4 S stripped so body starts at Phera", () => {
    expect(folio.id).toBe("3r");
    const line1 = folio.blocks.find((b) => b.lineNumber === "1");
    expect(line1).toBeDefined();
    const drop = line1!.tokens.find((t) => t.type === "drop_initial");
    expect(drop?.value).toBe("S");
    expect(drop?.initialDepth).toBe(4);

    // Lexer peels S into drop_initial; remaining text token is already "Phera".
    const textTok = line1!.tokens.find((t) => t.type === "text");
    expect(textTok?.value).toMatch(/^Phera/);

    // Layout path must not re-emit the cap grapheme in body segs.
    let segs = blockToSegs(line1!, DISPLAY);
    segs = stripDropCapPrefixFromSegs(segs, drop!.value);
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toMatch(/^Phera segundo Euclides/i);
    expect(joined.startsWith("S")).toBe(false);
  });

  it("keeps {GL.} as a gloss block, not prose", () => {
    const gloss = folio.blocks.find((b) => b.lineNumber === "13");
    expect(gloss?.type).toBe("gloss");
    const codes = gloss!.tokens.flatMap((t) => t.envLayers?.map((l) => l.code) ?? []);
    expect(codes.some((c) => (c ?? "").toUpperCase() === "GL")).toBe(true);
    expect(renderNormalizedText(gloss!.tokens)).toMatch(/Chame~sse fixas|Chamẽsse fixas/i);
  });

  it("does not fold the gloss into a two-column zipper group", () => {
    const glossIdx = folio.blocks.findIndex((b) => b.type === "gloss");
    expect(glossIdx).toBeGreaterThanOrEqual(0);
    expect(folio.blocks[glossIdx].columns).not.toBe(2);
  });
});
