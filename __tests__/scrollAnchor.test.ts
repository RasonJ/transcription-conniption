import { anchorFromLineIndex } from "../utils/scrollAnchor";

describe("scrollAnchor", () => {
  it("resolves folio and line number from source line index", () => {
    const text = `{RMK: Author.}
[fol. 3r]
{CB1.
42 {RUB. % Heading}
43 body text here`;

    const anchor = anchorFromLineIndex(text, 3);
    expect(anchor.folioId).toBe("3r");
    expect(anchor.lineNumber).toBe("42");
  });

  it("walks back to the latest folio marker", () => {
    const text = `[fol. 1r]
1 first
[fol. 2v]
10 second line`;

    expect(anchorFromLineIndex(text, 4).folioId).toBe("2v");
    expect(anchorFromLineIndex(text, 4).lineNumber).toBe("10");
  });
});
