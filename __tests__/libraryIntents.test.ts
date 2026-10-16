import {
  buildLibraryAwareRouterIndex,
  enrichIntentPrototypesFromCatalog,
  libraryCatalogVocabulary,
  matchLibraryEntry,
} from "../utils/copilot/libraryIntents";
import type { LibraryCatalog } from "../utils/libraryCatalog";

const catalog: LibraryCatalog = {
  format: "hsms-library-catalog/1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  outputDir: "/tmp",
  entryCount: 2,
  entries: [
    {
      id: "TEXT.NUN",
      baseName: "TEXT.NUN",
      sourceFileName: "TEXT.NUN.txt",
      title: "Tratado da sphera",
      author: "Pedro Nunes",
      year: "1537",
      city: "Lisboa",
      printer: "Germão Galharde",
      keywords: "sphera nunes astronomy",
      status: "ok",
      exportedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "TEXT.BAD",
      baseName: "TEXT.BAD",
      sourceFileName: "TEXT.BAD.txt",
      title: "Broken",
      author: "Nobody",
      year: "",
      city: "",
      printer: "",
      keywords: "",
      status: "failed",
      exportedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("libraryIntents", () => {
  it("extracts vocabulary from ok catalog entries only", () => {
    const vocab = libraryCatalogVocabulary(catalog);
    expect(vocab).toMatch(/pedro nunes/i);
    expect(vocab).toMatch(/sphera/);
    expect(vocab).not.toMatch(/broken/i);
  });

  it("enriches search_text prototypes with library terms", () => {
    const enriched = enrichIntentPrototypesFromCatalog(catalog);
    expect(enriched.search_text).toMatch(/nunes/i);
    expect(enriched.find_rubric).toMatch(/lisboa/i);
  });

  it("matches an open witness against the catalog by filename", () => {
    expect(matchLibraryEntry(catalog, "TEXT.NUN.txt")?.title).toMatch(/sphera/i);
    expect(matchLibraryEntry(catalog, null, "Tratado da sphera")?.id).toBe("TEXT.NUN");
  });

  it("builds a router index that includes library-aware search triggers", () => {
    const router = buildLibraryAwareRouterIndex(catalog);
    expect(router.protos.intents.length).toBeGreaterThan(10);
    expect(router.threshold).toBeGreaterThan(0);
  });
});
