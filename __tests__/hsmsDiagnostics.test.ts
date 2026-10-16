import { toHsmsDiagnostics } from "../utils/hsmsDiagnostics";
import { lintHsmsTranscription } from "../utils/hsmsLinter";

describe("hsmsDiagnostics", () => {
  it("maps linter issues to LSP-shaped ranges and codes", () => {
    const report = lintHsmsTranscription(`{CB1.
{RUB. abierto
[fol. 2r]
cerrado}`);
    const diags = toHsmsDiagnostics(report.issues);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].source).toBe("hsmsLinter");
    expect([1, 2]).toContain(diags[0].severity);
    expect(diags[0].range.start.line).toBeGreaterThanOrEqual(0);
    expect(diags[0].range.end.character).toBeGreaterThan(0);
    expect(diags.some((d) => typeof d.code === "string" && d.code.length > 0)).toBe(true);
  });
});
