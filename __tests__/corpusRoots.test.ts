import path from "node:path";
import {
  resolveCorpusRoots,
  resolveDefaultCorpusRoots,
} from "../utils/corpusRoots";

describe("corpusRoots", () => {
  it("resolves sibling OSTA + Celestina defaults", () => {
    const roots = resolveDefaultCorpusRoots("/app/transcription-conniption");
    expect(roots[0].replace(/\\/g, "/")).toMatch(/\/OSTA\/transcriptions$/);
    expect(roots[1].replace(/\\/g, "/")).toMatch(/\/estilometria-celestina$/);
  });

  it("prefers --in / cli roots over defaults", () => {
    const roots = resolveCorpusRoots({
      projectRoot: "/app/transcription-conniption",
      cliIns: ["C:/custom/osta", "C:/custom/celestina"],
      exists: () => false,
    });
    expect(roots.map((r) => path.normalize(r))).toEqual([
      path.normalize("C:/custom/osta"),
      path.normalize("C:/custom/celestina"),
    ]);
  });

  it("filters default roots to those that exist", () => {
    const roots = resolveCorpusRoots({
      projectRoot: "/app/transcription-conniption",
      exists: (dir) => dir.replace(/\\/g, "/").endsWith("/estilometria-celestina"),
    });
    expect(roots).toHaveLength(1);
    expect(roots[0].replace(/\\/g, "/")).toMatch(/\/estilometria-celestina$/);
  });
});
