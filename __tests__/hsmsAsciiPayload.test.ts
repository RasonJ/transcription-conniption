import { dedupeRepeatedFolioBlocks, lineContentKey } from "../utils/hsmsAsciiPayload";

describe("hsmsAsciiPayload line-aware dedupe", () => {
  it("strips margin line numbers for content keys", () => {
    expect(lineContentKey("14 muito excelente")).toBe(lineContentKey("15 muito excelente"));
  });

  it("dedupes folio blocks even when line numbers differ", () => {
    const raw = `[fol. 1r]
{CB1.
1 hello world
}
[fol. 1r]
{CB1.
2 hello world
}`;
    const out = dedupeRepeatedFolioBlocks(raw);
    expect(out.match(/\[fol\./gi)?.length).toBe(1);
  });
});
