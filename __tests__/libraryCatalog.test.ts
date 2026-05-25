import {
  buildLibraryCatalogEntry,
  buildLibraryKeywords,
  extractYearFromImprintDate,
  filterLibraryEntries,
} from "../utils/libraryCatalog";

const SAMPLE = `{RMK: Christine de Pisan.}
{RMK: O espelho de Cristina.}
{RMK: Lisboa | Herma~o de Campos |1518-06-22.}
[fol. 1r]
{CB1.
1 En el nonbre de Dios
{CW. fin}}`;

describe("libraryCatalog", () => {
  it("extracts author, title, and year from RMK metadata", () => {
    const entry = buildLibraryCatalogEntry({
      baseName: "cw_test",
      sourceFileName: "cw_test.txt",
      status: "ok",
      exportedAt: "2026-01-01T00:00:00.000Z",
      transcriptionText: SAMPLE,
    });

    expect(entry.author).toMatch(/Christine/i);
    expect(entry.title).toMatch(/espelho de Cristina/i);
    expect(entry.year).toBe("1518");
    expect(entry.city).toMatch(/Lisboa/i);
    expect(entry.keywords).toContain("1518");
    expect(entry.keywords).toContain("cw_test");
  });

  it("filters by author, year, and keywords together", () => {
    const entries = [
      buildLibraryCatalogEntry({
        baseName: "A",
        sourceFileName: "A.txt",
        status: "ok",
        exportedAt: "2026-01-01T00:00:00.000Z",
        transcriptionText: `{RMK: Author One.}\n{RMK: Book Alpha.}\n{RMK: Madrid | Printer |1600.}`,
      }),
      buildLibraryCatalogEntry({
        baseName: "B",
        sourceFileName: "B.txt",
        status: "ok",
        exportedAt: "2026-01-01T00:00:00.000Z",
        transcriptionText: `{RMK: Author Two.}\n{RMK: Book Beta.}\n{RMK: Lisbon | Other |1518.}`,
      }),
    ];

    const byAuthor = filterLibraryEntries(entries, { author: "two" });
    expect(byAuthor).toHaveLength(1);
    expect(byAuthor[0].baseName).toBe("B");

    const byYear = filterLibraryEntries(entries, { year: "1518" });
    expect(byYear).toHaveLength(1);
    expect(byYear[0].baseName).toBe("B");

    const byKeyword = filterLibraryEntries(entries, { keywords: "alpha" });
    expect(byKeyword).toHaveLength(1);
    expect(byKeyword[0].baseName).toBe("A");
  });

  it("extracts a four-digit year prefix from imprint dates", () => {
    expect(extractYearFromImprintDate("1518-06-22")).toBe("1518");
    expect(extractYearFromImprintDate("")).toBe("");
  });

  it("builds a lowercase keyword blob", () => {
    const blob = buildLibraryKeywords({
      author: "Christine",
      title: "Mirror",
      year: "1518",
      city: "Lisboa",
      printer: "Campos",
      baseName: "cw_test",
      sourceFileName: "cw_test.txt",
    });
    expect(blob).toContain("christine");
    expect(blob).toContain("cw_test.txt");
  });
});
