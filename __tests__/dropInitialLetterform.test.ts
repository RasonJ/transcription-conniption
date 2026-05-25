import {
  buildDropCapSeed,
  pickLetterform,
} from "../components/svgFacsimile/dropInitialLetterform";

describe("dropInitialLetterform", () => {
  it("is deterministic for the same folio, letter, and line index", () => {
    const seed = buildDropCapSeed("3r", "T", 12);
    const a = pickLetterform(seed);
    const b = pickLetterform(seed);
    expect(a.matrix).toBe(b.matrix);
    expect(a.fontFamily).toBe(b.fontFamily);
    expect(a.theme.field).toBe(b.theme.field);
  });

  it("varies across folio sides for the same letter", () => {
    const on3r = pickLetterform(buildDropCapSeed("3r", "T", 0));
    const on4v = pickLetterform(buildDropCapSeed("4v", "T", 0));
    const differs =
      on3r.matrix !== on4v.matrix ||
      on3r.fontFamily !== on4v.fontFamily ||
      on3r.theme.field !== on4v.theme.field;
    expect(differs).toBe(true);
  });

  it("varies across line indices on the same folio", () => {
    const line0 = pickLetterform(buildDropCapSeed("3r", "S", 0));
    const line42 = pickLetterform(buildDropCapSeed("3r", "S", 42));
    const differs =
      line0.matrix !== line42.matrix ||
      line0.fontFamily !== line42.fontFamily ||
      line0.theme.field !== line42.theme.field;
    expect(differs).toBe(true);
  });
});
