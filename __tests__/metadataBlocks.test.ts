import { compileManuscriptTree } from "../utils/compiler";
import { blockIsMetadataLeak, filterMetadataBlocksFromFolios } from "../utils/metadataBlocks";
import { stripRmkFromLine } from "../utils/manuscriptParser";

describe("metadataBlocks", () => {
  it("strips RMK from numbered catalog lines", () => {
    const metadata = {
      author: "",
      title: "",
      imprint: {},
      witness: {},
    };
    const rest = stripRmkFromLine("1 {RMK: Pedro Nunes.}", metadata);
    expect(rest).toBeNull();
    expect(metadata.author).toMatch(/Pedro/i);
  });

  it("filters leaked RMK blocks from folios", () => {
    const ast = filterMetadataBlocksFromFolios(
      compileManuscriptTree(`{RMK: Author.}
{RMK: Title.}
[fol. 1r]
{CB1.
1 {RMK: Should not appear.}
2 En el nonbre de Dios
{CW. e}}`),
    );
    const body = ast.folios.flatMap((f) => f.blocks).flatMap((b) => b.tokens.map((t) => t.value));
    expect(body).not.toContain("Should");
    expect(blockIsMetadataLeak({ type: "prose", columns: 1, tokens: [{ type: "text", value: "{RMK: x}", raw: "{RMK: x}" }] })).toBe(
      true,
    );
  });
});
