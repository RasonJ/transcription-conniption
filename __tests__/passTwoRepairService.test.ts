import {
  alignBatchRepairResults,
  parseBatchRepairResponse,
  type PageDiagnosticsPayload,
} from "../services/passTwoRepairService";

const flagged: PageDiagnosticsPayload[] = [
  {
    pageIndex: 0,
    folioId: "1r",
    rawHsmsAscii: "[fol. 1r]\n{CB1.\nbroken\n",
    errorMessages: ["L3: unclosed brace"],
  },
  {
    pageIndex: 2,
    folioId: "2r",
    rawHsmsAscii: "[fol. 2r]\n{CB1.\nalso broken\n",
    errorMessages: ["L2: EMPTY_COLUMN_ENVELOPE"],
  },
];

describe("parseBatchRepairResponse", () => {
  it("splits PAGE wrappers into per-folio results", () => {
    const response = `=== PAGE 1 [fol. 1r] ===
[fol. 1r]
{CB1.
1 fixed
}
=== END PAGE 1 ===

=== PAGE 3 [fol. 2r] ===
[fol. 2r]
{CB1.
1 also fixed
}
=== END PAGE 3 ===`;

    const parsed = parseBatchRepairResponse(response, flagged);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].pageIndex).toBe(0);
    expect(parsed[0].folioId).toBe("1r");
    expect(parsed[0].repairedHsmsAscii).toContain("{CB1.");
    expect(parsed[0].repairedHsmsAscii).toContain("fixed");
    expect(parsed[1].pageIndex).toBe(2);
    expect(parsed[1].folioId).toBe("2r");
  });

  it("falls back to raw response for a single-page batch without wrappers", () => {
    const one = [flagged[0]];
    const parsed = parseBatchRepairResponse("[fol. 1r]\n{CB1.\nok\n}", one);
    expect(parsed).toEqual([
      {
        pageIndex: 0,
        folioId: "1r",
        repairedHsmsAscii: "[fol. 1r]\n{CB1.\nok\n}",
      },
    ]);
  });
});

describe("alignBatchRepairResults", () => {
  it("fills missing folios from Pass 1 ASCII", () => {
    const parsed = [
      {
        pageIndex: 0,
        folioId: "1r",
        repairedHsmsAscii: "[fol. 1r]\n{CB1.\nfixed\n}",
      },
    ];
    const aligned = alignBatchRepairResults(parsed, flagged);
    expect(aligned).toHaveLength(2);
    expect(aligned[0].repairedHsmsAscii).toContain("fixed");
    expect(aligned[1].repairedHsmsAscii).toBe(flagged[1].rawHsmsAscii);
  });
});
