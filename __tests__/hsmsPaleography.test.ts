import { blockToSegs, stripDropCapPrefixFromSegs } from "../components/svgFacsimile/tokenRendering";
import { compileManuscriptTree } from "../utils/compiler";
import { parseDropInitialPrefix, parseDropInitialLetterCluster } from "../utils/dropInitial";
import { tokenizeString } from "../utils/hsmsLexer";

const DISPLAY = {
  showExpanded: true,
  showDeletions: true,
  suppressOtioseMarks: false,
  useNormalizedDiacritics: true,
};

describe("drop initial grapheme", () => {
  it("peels D from DEpoys mixed-case opening without word-boundary failure", () => {
    const { token, rest } = parseDropInitialPrefix("{IN8.} DEpoys que");
    expect(token?.value).toBe("D");
    expect(token?.initialDepth).toBe(8);
    expect(rest).toMatch(/^Epoys/);
  });

  it("peels one historiated letter from AO, leaving O in the body", () => {
    const { token, rest } = parseDropInitialPrefix("{IN4.} AO muyto circumspecto");
    expect(token?.value).toBe("A");
    expect(token?.initialDepth).toBe(4);
    expect(rest).toMatch(/^O/);
    expect(rest).toMatch(/muyto/);
  });

  it("peels cap letter from /C/ editorial marker after drop tag", () => {
    const { token, rest } = parseDropInitialPrefix("{IN6.} /C/omiença vn breue");
    expect(token?.value).toBe("C");
    expect(rest).toMatch(/^omiença/);
  });

  it("peels one letter from SPhera, TRatado, and EU openings", () => {
    expect(parseDropInitialLetterCluster("{IN4.} SPhera segundo")).toBe("S");
    expect(parseDropInitialLetterCluster("{IN4.} TRatado da")).toBe("T");
    expect(parseDropInitialLetterCluster("{IN5.} O Tratado")).toBe("O");
    expect(parseDropInitialLetterCluster("{IN5.} EU el Rey")).toBe("E");
  });

  it("strips a duplicated cap grapheme from layout segments", () => {
    const segs = stripDropCapPrefixFromSegs(
      [{ text: "AO muyto", fill: "#1a0a05", italic: false, bold: false, fs: 16, strike: false, underline: false, super: false }],
      "A",
    );
    expect(segs[0]?.text).toMatch(/^O/);
  });

  it("renders facsimile body starting with O after the illuminated A", () => {
    const snippet = `{CB1.
{IN4.} AO muyto circumspecto}`;
    const ast = compileManuscriptTree(snippet);
    const block = ast.folios[0]?.blocks[0];
    const drop = block?.tokens.find((t) => t.type === "drop_initial");
    expect(drop?.value).toBe("A");
    const segs = stripDropCapPrefixFromSegs(blockToSegs(block!, DISPLAY), drop!.value);
    expect(segs.map((s) => s.text).join("")).toMatch(/^O/);
    expect(segs.map((s) => s.text).join("")).toContain("muyto");
  });
});

describe("HSMS paleographic bracket and lacuna tokens", () => {
  it("does not split mechanical lacuna with greedy diacritic rules", () => {
    const tokens = tokenizeString("d[ ]estado a[ ]que");
    expect(tokens.filter((t) => t.type === "blank_space")).toHaveLength(2);
    const lacunaIdx = tokens.findIndex((t) => t.type === "blank_space");
    expect(tokens[lacunaIdx - 1]?.type).toBe("text");
    expect(tokens[lacunaIdx - 1]?.value).toBe("d");
    expect(tokens[lacunaIdx + 1]?.type).toBe("text");
    expect(tokens[lacunaIdx + 1]?.value).toMatch(/^estado/);
  });

  it("tokenizes editorial reconstruction separately from lacuna brackets", () => {
    const tokens = tokenizeString("pera que [*pro-]ueitoso a[ ]que a[ ]natureza Jo??");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("reconstructed_text");
    expect(tokens.filter((t) => t.type === "blank_space" && /^\[\s*\]$/.test(t.raw ?? ""))).toHaveLength(2);
    expect(types.filter((t) => t === "missing_fragment")).toHaveLength(1);
    expect(tokens.find((t) => t.type === "reconstructed_text")?.value).toBe("pro-");
    expect(tokens.filter((t) => t.type === "text").map((t) => t.value).join("")).toMatch(
      /a.*que.*natureza.*Jo/,
    );
  });

  it("distinguishes bracketed illegible text from loose margin lacunae", () => {
    const tokens = tokenizeString("Santa Maria [??] estad??");
    const illegible = tokens.filter((t) => t.type === "illegible_text");
    const torn = tokens.filter((t) => t.type === "missing_fragment");
    expect(illegible).toHaveLength(1);
    expect(illegible[0]?.value).toBe("??");
    expect(torn).toHaveLength(1);
    expect(torn[0]?.raw).toBe("??");
  });

  it("preserves word spacing around mechanical lacunae in facsimile segs", () => {
    const segs = blockToSegs(
      {
        type: "prose",
        columns: 1,
        tokens: tokenizeString("a[ ]que"),
      },
      DISPLAY,
    );
    expect(segs.map((s) => s.text).join("")).toBe("a que");
  });

  it("renders reconstructions, illegible squares, and torn-margin ellipses", () => {
    const segs = blockToSegs(
      {
        type: "prose",
        columns: 1,
        tokens: tokenizeString("[*m-] Jo?? [??]"),
      },
      DISPLAY,
    );
    const joined = segs.map((s) => s.text).join("");
    expect(joined).toContain("[m-]");
    expect(joined).toContain("Jo");
    expect(joined).toContain("…");
    expect(joined).toContain("□□");
  });
});
