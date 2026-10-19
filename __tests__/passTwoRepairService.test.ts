import {
  alignBatchRepairResults,
  formatDiagnosticsForRepair,
  parseBatchRepairResponse,
  type PageDiagnosticsPayload,
} from "@/services/passTwoRepairService";
import type { ValidationError } from "@/constants/manuscript";

describe("passTwoRepairService", () => {
  test("formats validation errors into line diagnostics", () => {
    const diagnostics = formatDiagnosticsForRepair([
      {
        lineIndex: 2,
        message: "Unclosed brace",
        code: "UNCLOSED_BRACE",
        severity: "error",
        rawSnippet: "{CB1.",
      },
      {
        lineIndex: 10,
        message: "Text outside column envelope",
        severity: "error",
        rawSnippet: "orphan",
      },
    ] satisfies ValidationError[]);

    expect(diagnostics).toEqual([
      "L3: [UNCLOSED_BRACE] Unclosed brace",
      "L11: Text outside column envelope",
    ]);
  });

  test("parses multi-page batch repair response into individual folios", () => {
    const sampleInput: PageDiagnosticsPayload[] = [
      {
        pageIndex: 0,
        folioId: "1r",
        rawHsmsAscii: "[fol. 1r]\n{CB1.\n1 {IN4.} Tratado\n",
        errorMessages: ["Unclosed brace"],
      },
      {
        pageIndex: 2,
        folioId: "2r",
        rawHsmsAscii: "[fol. 2r]\n1 faze--\n2 do\n",
        errorMessages: ["Text outside column envelope"],
      },
    ];

    const modelResponse = `
=== PAGE 1 [fol. 1r] ===
[fol. 1r]
{CB1.
1 {IN4.} Tratado
}
=== END PAGE 1 ===

=== PAGE 3 [fol. 2r] ===
[fol. 2r]
{CB1.
1 faze--
2 do
}
=== END PAGE 3 ===
    `;

    const parsed = parseBatchRepairResponse(modelResponse, sampleInput);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      pageIndex: 0,
      folioId: "1r",
      repairedHsmsAscii: "[fol. 1r]\n{CB1.\n1 {IN4.} Tratado\n}",
    });
    expect(parsed[1]).toEqual({
      pageIndex: 2,
      folioId: "2r",
      repairedHsmsAscii: "[fol. 2r]\n{CB1.\n1 faze--\n2 do\n}",
    });
  });

  test("strips echoed diagnostic headers from model output", () => {
    const sampleInput: PageDiagnosticsPayload[] = [
      {
        pageIndex: 0,
        folioId: "1r",
        rawHsmsAscii: "[fol. 1r]\n{CB1.\nbroken\n",
        errorMessages: ["L3: Unclosed brace"],
      },
    ];

    const modelResponse = `=== PAGE 1 [fol. 1r] ===
### DIAGNOSTICS:
- L3: Unclosed brace

### RAW HSMS TEXT:
[fol. 1r]
{CB1.
1 fixed
}
=== END PAGE 1 ===`;

    const parsed = parseBatchRepairResponse(modelResponse, sampleInput);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].repairedHsmsAscii).toBe("[fol. 1r]\n{CB1.\n1 fixed\n}");
    expect(parsed[0].repairedHsmsAscii).not.toContain("DIAGNOSTICS");
    expect(parsed[0].repairedHsmsAscii).not.toContain("RAW HSMS TEXT");
  });

  test("falls back to raw response for a single-page batch without wrappers", () => {
    const one: PageDiagnosticsPayload[] = [
      {
        pageIndex: 0,
        folioId: "1r",
        rawHsmsAscii: "[fol. 1r]\n{CB1.\nbroken\n",
        errorMessages: ["L3: unclosed brace"],
      },
    ];
    const parsed = parseBatchRepairResponse("[fol. 1r]\n{CB1.\nok\n}", one);
    expect(parsed).toEqual([
      {
        pageIndex: 0,
        folioId: "1r",
        repairedHsmsAscii: "[fol. 1r]\n{CB1.\nok\n}",
      },
    ]);
  });

  test("aligns repair results gracefully when a page section is missing from model output", () => {
    const sampleInput: PageDiagnosticsPayload[] = [
      {
        pageIndex: 0,
        folioId: "1r",
        rawHsmsAscii: "[fol. 1r]\n{CB1.\n1 {IN4.} Tratado\n",
        errorMessages: ["Unclosed brace"],
      },
      {
        pageIndex: 1,
        folioId: "1v",
        rawHsmsAscii: "[fol. 1v]\n1 da sphera\n",
        errorMessages: ["Missing {CB1.} envelope"],
      },
    ];

    // Model only returned page 1
    const partialParsed = [
      {
        pageIndex: 0,
        folioId: "1r",
        repairedHsmsAscii: "[fol. 1r]\n{CB1.\n1 {IN4.} Tratado\n}",
      },
    ];

    const aligned = alignBatchRepairResults(partialParsed, sampleInput);

    expect(aligned).toHaveLength(2);
    expect(aligned[0].repairedHsmsAscii).toContain("{CB1.");
    expect(aligned[1].repairedHsmsAscii).toBe("[fol. 1v]\n1 da sphera\n");
  });

  test("aligns empty parse by keeping all Pass 1 ASCII", () => {
    const sampleInput: PageDiagnosticsPayload[] = [
      {
        pageIndex: 0,
        folioId: "1r",
        rawHsmsAscii: "pass1-a",
        errorMessages: ["err"],
      },
      {
        pageIndex: 1,
        folioId: "1v",
        rawHsmsAscii: "pass1-b",
        errorMessages: ["err"],
      },
    ];
    const aligned = alignBatchRepairResults([], sampleInput);
    expect(aligned.map((r) => r.repairedHsmsAscii)).toEqual(["pass1-a", "pass1-b"]);
  });
});
