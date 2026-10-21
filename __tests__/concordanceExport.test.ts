import { concordanceToCsv } from "../utils/concordanceExport";
import { createMockOccurrence } from "./fixtures/occurrenceFactory";

describe("concordance csv", () => {
  it("writes a header and quoted cells", () => {
    const csv = concordanceToCsv(
      {
        rey: {
          count: 1,
          occurrences: [
            createMockOccurrence({
              folioId: "1r",
              lineNumber: "2",
              preContext: 'el "rey"',
              postContext: "mando",
              keyword: "rey",
            }),
          ],
        },
      },
      "word forms",
    );
    expect(csv.split("\n")[0]).toBe("lemma,count,folio,line,pre,keyword,post");
    expect(csv).toContain('"el ""rey"""');
    expect(csv.endsWith("# word forms")).toBe(true);
  });
});
