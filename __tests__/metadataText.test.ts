import { compileManuscriptTree } from "../utils/compiler";
import { formatPaleographicPlainText, formatRunningHeaderText, normalizeMetadataPlainText } from "../utils/metadataText";

describe("metadataText display flattening", () => {
  it("normalizes Germa~o imprint printer name", () => {
    expect(normalizeMetadataPlainText("Germa~o")).toMatch(/Germão/i);
    expect(normalizeMetadataPlainText("Germa~o")).not.toContain("~");
  });

  it("merges L<IBRO> into LIBRO for running headers", () => {
    expect(formatRunningHeaderText("L<IBRO> DELA SPHERA")).toBe("LIBRO DELA SPHERA");
    expect(formatPaleographicPlainText("L<IBRO> DELA SPHERA")).toBe("LIBRO DELA SPHERA");
  });

  it("parses demo imprint and heading on first compile", () => {
    const ast = compileManuscriptTree(`{RMK: Pedro Nunes.}
{RMK: Tratado da sphera com suas anotac'o~es.}
{RMK: Lisboa | Germa~o Galharde | 1537.}
[fol. 3r]
{HD. L<IBRO> DELA SPHERA}
{CB1.
1 Test line.}`);

    expect(ast.metadata.imprint?.city).toBe("Lisboa");
    expect(ast.metadata.imprint?.printer).toMatch(/Germão/i);
    expect(formatRunningHeaderText(ast.folios[0]?.headings[0] ?? "")).toBe("LIBRO DELA SPHERA");
  });
});
