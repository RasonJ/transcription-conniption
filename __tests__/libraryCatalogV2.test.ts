import {
  normalizeLibraryCatalog,
  upgradeCatalogEntryToV2,
} from "../utils/libraryCatalog";
import { groupCatalogEntriesIntoWorks } from "../utils/workGrouping";

describe("library catalog v2", () => {
  it("upgrades v1 desconocido row without using it as a title", () => {
    const v2 = upgradeCatalogEntryToV2({
      id: "TEXT.PLG",
      baseName: "TEXT.PLG",
      sourceFileName: "TEXT.PLG.txt",
      title: ". desconocido",
      author: "HSMS-0480",
      year: "9247",
      city: "Madrid",
      printer: "Biblioteca Nacional de España",
      keywords: "hsms-0480 . desconocido 9247 madrid",
      status: "ok",
      exportedAt: "2026-10-16T04:41:04.202Z",
      folioCount: 13,
      wordCount: 4292,
    });

    expect(v2.title).toMatch(/Untitled/i);
    expect(v2.title).not.toMatch(/desconocido/i);
    expect(v2.authorUnknown).toBe(true);
    expect(v2.hsmsId).toBe("HSMS-0480");
    expect(v2.year).toBeNull(); // 9247 is not a plausible imprint year
    expect(v2.repository).toMatch(/Biblioteca Nacional/i);
  });

  it("groups Celestina parts under one workId", () => {
    const catalog = normalizeLibraryCatalog({
      format: "hsms-library-catalog/1",
      generatedAt: "2026-10-20T00:00:00.000Z",
      outputDir: "out",
      entries: [
        {
          id: "a",
          baseName: "1500__auto_02",
          sourceFileName: "1500/auto_02.txt",
          title: "1500/auto 02 (Celestina)",
          author: "Fernando de Rojas",
          year: "1500",
          city: "",
          printer: "",
          keywords: "celestina",
          status: "ok",
          exportedAt: "2026-10-16T04:41:04.202Z",
          wordCount: 100,
          folioCount: 1,
        },
        {
          id: "b",
          baseName: "1500__auto_10",
          sourceFileName: "1500/auto_10.txt",
          title: "1500/auto 10 (Celestina)",
          author: "Fernando de Rojas",
          year: "1500",
          city: "",
          printer: "",
          keywords: "celestina",
          status: "ok",
          exportedAt: "2026-10-16T04:41:04.202Z",
          wordCount: 200,
          folioCount: 2,
        },
        {
          id: "c",
          baseName: "1500__auto_04a",
          sourceFileName: "1500/auto_04a.txt",
          title: "1500/auto 04a (Celestina)",
          author: "Fernando de Rojas",
          year: "1500",
          city: "",
          printer: "",
          keywords: "celestina",
          status: "ok",
          exportedAt: "2026-10-16T04:41:04.202Z",
          wordCount: 150,
          folioCount: 1,
        },
      ],
    });

    const groups = groupCatalogEntriesIntoWorks(catalog.entries);
    const celestina = groups.find((g) => g.workId === "celestina");
    expect(celestina).toBeTruthy();
    expect(celestina!.parts).toHaveLength(3);
    expect(celestina!.parts.map((p) => p.partLabel)).toEqual([
      "auto 02",
      "auto 04a",
      "auto 10",
    ]);
    expect(celestina!.totalWords).toBe(450);
  });
});
