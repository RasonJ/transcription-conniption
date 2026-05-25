import { compileManuscriptTree } from "../utils/compiler";
import { tokenizeString } from "../utils/hsmsLexer";
import { PAREN_CLOSE_SENTINEL, PAREN_OPEN_SENTINEL } from "../utils/hsmsLexer";
import { blockToSegs } from "../components/svgFacsimile/tokenRendering";

describe("citation_wrap (( )) tokens", () => {
  it("tokenizes historical double-bracket citation markers as citation_wrap", () => {
    const tokens = tokenizeString("((Como se achegasse Jh<es>u))");
    const wraps = tokens.filter((t) => t.type === "citation_wrap");
    expect(wraps).toHaveLength(2);
    expect(wraps[0]?.value).toBe("((");
    expect(wraps[1]?.value).toBe("))");
    expect(tokens.some((t) => t.value.includes(PAREN_OPEN_SENTINEL))).toBe(false);
    expect(tokens.some((t) => t.value.includes(PAREN_CLOSE_SENTINEL))).toBe(false);
  });

  it("does not treat single parentheses as citation_wrap", () => {
    const tokens = tokenizeString("(editorial note)");
    expect(tokens.some((t) => t.type === "citation_wrap")).toBe(false);
  });

  it("renders citation_wrap with faint italic segs", () => {
    const segs = blockToSegs(
      {
        type: "prose",
        columns: 1,
        tokens: [
          { type: "citation_wrap", value: "((", raw: "((" },
          { type: "text", value: "Como", raw: "Como" },
          { type: "citation_wrap", value: "))", raw: "))" },
        ],
      },
      {
        showExpanded: true,
        showDeletions: true,
        suppressOtioseMarks: false,
        useNormalizedDiacritics: true,
      },
    );
    expect(segs[0]?.text).toBe("((");
    expect(segs[0]?.italic).toBe(true);
    expect(segs[0]?.fill).toBe("#a08060");
  });

  it("parses 1497-style gloss citation wrap inside column block", () => {
    const snippet = `{CB2.
{RUB. Glosa.}
((Como se achegasse Jh<es>u a Jherusale~ & vijn-
do a[ ]betphage.)) Diz lyra}`;
    const ast = compileManuscriptTree(snippet);
    const folio = ast.folios[0];
    expect(folio).toBeDefined();
    const allTokens = folio!.blocks.flatMap((b) => b.tokens);
    const wraps = allTokens.filter((t) => t.type === "citation_wrap");
    expect(wraps.length).toBeGreaterThanOrEqual(2);
    expect(allTokens.some((t) => t.type === "expansion" && t.value === "es")).toBe(true);
  });
});
