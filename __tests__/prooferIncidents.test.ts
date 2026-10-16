import {
  auditHsmsProoferIncidents,
  formatProoferTsv,
  prooferIncidentsToRows,
} from "../utils/prooferIncidents";
import { lintHsmsTranscription } from "../utils/hsmsLinter";
import { executeMcpSidecarTool } from "../utils/copilot/mcpSidecarRuntime";

describe("prooferIncidents", () => {
  it("flags combining diacritics and ellipsis outside brackets", () => {
    const raw = `{CB1.
cafe\u0301 with combining
dots ... not bracketed
}`;
    const incidents = auditHsmsProoferIncidents(raw);
    expect(incidents.some((i) => i.code === "COMBINING_DIACRITIC")).toBe(true);
    expect(incidents.some((i) => i.code === "ELLIPSIS_OUTSIDE_BRACKETS")).toBe(true);
  });

  it("flags illegible runs and tag lowercase", () => {
    const raw = `{CB1.
{rub. lower}
text ???? here
}`;
    const incidents = auditHsmsProoferIncidents(raw);
    expect(incidents.some((i) => i.code === "TAG_LOWERCASE")).toBe(true);
    expect(incidents.some((i) => i.code === "ILLEGIBLE_RUN")).toBe(true);
  });

  it("formats TSV with proofer columns", () => {
    const rows = prooferIncidentsToRows(
      auditHsmsProoferIncidents("{CB1.\ntext ????\n}"),
    );
    const tsv = formatProoferTsv(rows);
    expect(tsv.split("\n")[0]).toBe("line\tcolumn\ttype\tcode\tsnippet\texplanation");
    expect(tsv).toMatch(/ILLEGIBLE_RUN/);
  });

  it("merges into lintHsmsTranscription by default", () => {
    const report = lintHsmsTranscription("{CB1.\ntext ????\n}");
    expect(report.structuralWarnings.some((i) => /ILLEGIBLE_RUN/.test(i.message))).toBe(true);
  });

  it("can skip proofer via options", () => {
    const report = lintHsmsTranscription("{CB1.\ntext ????\n}", { includeProofer: false });
    expect(report.structuralWarnings.some((i) => /ILLEGIBLE_RUN/.test(i.message))).toBe(false);
  });

  it("MCP audit_hsms_syntax returns rows", async () => {
    const result = await executeMcpSidecarTool("audit_hsms_syntax", {
      text: "{CB1.\ntext ????\n}",
    });
    expect(result.ok).toBe(true);
    const data = result.data as { count: number; rows: unknown[] };
    expect(data.count).toBeGreaterThan(0);
    expect(Array.isArray(data.rows)).toBe(true);
  });
});
