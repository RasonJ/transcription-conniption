import path from "node:path";
import { compileManuscriptTree } from "../utils/compiler";
import {
  discoverTranscriptionEntries,
  formatIssueLog,
  generateNativeTypeScriptModule,
  processOstaTranscription,
  runOstaBatchConvertWithFs,
  splitLintAndParseIssues,
  transcriptionExportBaseName,
  type FileSystemWriter,
} from "../utils/ostaBatchConverter";
import { runOstaIssueReportWithFs } from "../utils/ostaIssueReport";

const SAMPLE = `[fol. 1r]
{CB1.
1 En el nonbre de Dios
2 Aqui comiença este libro
{CW. fin}}`;

describe("ostaBatchConverter", () => {
  it("processes a witness into html, native ts, and issue log payloads", () => {
    const result = processOstaTranscription("TEXT.DEMO.txt", SAMPLE);

    expect(result.status).toBe("ok");
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("#f4ebd0");
    expect(result.nativeTs).toContain("export const parsedManuscript");
    expect(result.nativeTs).toContain("compileManuscriptTree(transcriptionText)");
    expect(result.nativeTs).not.toMatch(/"tokens":\s*\[/);
    expect(result.nativeTs).toContain("hsms-native-bundle/2");
    expect(result.issuesLog).toContain("TEXT.DEMO.txt");
    expect(result.stats?.totalWords).toBeGreaterThan(0);
  });

  it("writes per-file artifacts without aggregate reports", () => {
    const written = new Map<string, string>();
    const existing = new Set<string>();
    const fs: FileSystemWriter = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        const key = path.normalize(filePath);
        written.set(key, contents);
        existing.add(key);
      },
      readFile: () => SAMPLE,
      readdir: () => ["TEXT.DEMO.txt"],
      exists: (filePath) =>
        filePath === "/in" || existing.has(path.normalize(filePath)),
    };

    const output = runOstaBatchConvertWithFs(
      { inputDir: "/in", outputDir: "/out", limit: 1 },
      fs,
    );

    const out = path.normalize("/out");
    expect(written.has(path.join(out, "TEXT.DEMO.html"))).toBe(true);
    expect(written.has(path.join(out, "TEXT.DEMO.native.ts"))).toBe(true);
    expect(written.has(path.join(out, "TEXT.DEMO.issues.log"))).toBe(true);
    expect(written.has(path.join(out, "TEXT.DEMO.library.json"))).toBe(true);
    expect(written.has(path.join(out, "TEXT.DEMO.source.sha256"))).toBe(true);
    expect(written.has(path.join(out, "library-catalog.json"))).toBe(true);
    expect(written.has(path.join(out, "issues-summary.json"))).toBe(false);
    expect(output.fileResults).toHaveLength(1);
    expect(output.fileResults[0].status).toBe("ok");
  });

  it("skips re-convert when the source SHA-256 matches prior artifacts", () => {
    const store = new Map<string, string>();
    const rewritten = new Set<string>();
    const fs: FileSystemWriter = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        const key = path.normalize(filePath);
        store.set(key, contents);
        rewritten.add(key);
      },
      readFile: (filePath) => {
        const key = path.normalize(filePath);
        if (store.has(key)) return store.get(key)!;
        return SAMPLE;
      },
      readdir: () => ["TEXT.DEMO.txt"],
      exists: (filePath) =>
        filePath === "/in" || store.has(path.normalize(filePath)),
    };

    runOstaBatchConvertWithFs({ inputDir: "/in", outputDir: "/out", limit: 1 }, fs);
    expect(store.has(path.normalize(path.join("/out", "TEXT.DEMO.source.sha256")))).toBe(true);
    rewritten.clear();

    const second = runOstaBatchConvertWithFs(
      { inputDir: "/in", outputDir: "/out", limit: 1 },
      fs,
    );
    expect(second.fileResults[0].status).toBe("skipped");
    expect(second.fileResults[0].skippedUnchanged).toBe(true);
    // Catalog is always rewritten; html/native/library should not be rewritten.
    expect(rewritten.has(path.normalize(path.join("/out", "TEXT.DEMO.html")))).toBe(false);
    expect(rewritten.has(path.normalize(path.join("/out", "library-catalog.json")))).toBe(true);
  });

  it("records compile failures in the issue log without html/native outputs", () => {
    const log = formatIssueLog("BAD.txt", "failed", { lint: [], parse: [], render: [] }, "Parser exploded");
    expect(log).toContain("COMPILE FAILURE");
    expect(log).toContain("Parser exploded");
  });

  it("writes lint and parse sections with source tags in the issue log", () => {
    const lintSample = `{CB1.
{RUB. abierto
[fol. 2r]
cerrado}`;

    const result = processOstaTranscription("FOLIO.LEAK.txt", lintSample);
    expect(result.issuesLog).toContain("=== PRE-COMPILE LINT (hsmsLinter) ===");
    expect(result.issuesLog).toMatch(/\[LINT\]/);
    expect(result.lintErrorCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.source === "lint")).toBe(true);
  });

  it("dedupes parse validation issues already reported by lint", () => {
    const lintIssues = [
      {
        lineIndex: 0,
        severity: "error" as const,
        message: "[UNCLOSED_ENV] Unclosed environment",
        rawSnippet: "foo",
        source: "lint" as const,
      },
    ];
    const compileValidation = [
      {
        lineIndex: 0,
        severity: "error" as const,
        message: "[UNCLOSED_ENV] Unclosed environment",
        rawSnippet: "foo",
      },
      {
        lineIndex: 1,
        severity: "warning" as const,
        message: "Parser-only warning",
        rawSnippet: "bar",
      },
    ];
    const { parseIssues, merged } = splitLintAndParseIssues(lintIssues, compileValidation);
    expect(parseIssues).toHaveLength(1);
    expect(parseIssues[0].message).toBe("Parser-only warning");
    expect(merged).toHaveLength(2);
  });

  it("generates importable native TypeScript modules", () => {
    const moduleSource = generateNativeTypeScriptModule({
      format: "hsms-native-bundle/2",
      exportedAt: "2026-01-01T00:00:00.000Z",
      sourceFileName: "TEXT.DEMO.txt",
      manuscriptTitle: "Demo",
      transcriptionText: SAMPLE,
      parsedManuscript: compileManuscriptTree(SAMPLE),
    });
    expect(moduleSource).toContain('import type { ParsedManuscript } from "../constants/manuscript"');
    expect(moduleSource).toContain("export default bundle");
  });

  it("pairs with issue report aggregation after conversion", () => {
    const written = new Map<string, string>();
    const fs: FileSystemWriter = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        written.set(path.normalize(filePath), contents);
      },
      readFile: () => SAMPLE,
      readdir: (dir) => (dir === "/in" ? ["TEXT.DEMO.txt"] : ["TEXT.DEMO.issues.log"]),
      exists: () => true,
    };

    runOstaBatchConvertWithFs({ inputDir: "/in", outputDir: "/out", limit: 1 }, fs);
    const report = runOstaIssueReportWithFs({ outputDir: "/out", inputDir: "/in" }, fs);

    expect(report.stats.totalFiles).toBe(1);
    expect(written.has(path.normalize("/out/issues.json"))).toBe(true);
    expect(written.has(path.normalize("/out/issues-summary.txt"))).toBe(true);
  });

  it("builds nested baseNames from relative paths", () => {
    expect(transcriptionExportBaseName("1500/auto1_01.txt")).toBe("1500__auto1_01");
    expect(transcriptionExportBaseName("TEXT.ABC.txt")).toBe("TEXT.ABC");
  });

  it("recursively discovers nested corpus txt files across multiple roots", () => {
    const tree: Record<string, string[]> = {
      [path.normalize("/osta")]: ["TEXT.A.txt"],
      [path.normalize("/celestina")]: ["1500", "1514"],
      [path.normalize("/celestina/1500")]: ["auto1.txt"],
      [path.normalize("/celestina/1514")]: ["auto1.txt"],
    };
    const dirs = new Set(Object.keys(tree));
    const fs: Pick<FileSystemWriter, "readdir" | "exists" | "isDirectory"> = {
      readdir: (dir) => tree[path.normalize(dir)] ?? [],
      exists: (p) => dirs.has(path.normalize(p)) || p.toLowerCase().endsWith(".txt"),
      isDirectory: (p) => dirs.has(path.normalize(p)),
    };

    const osta = discoverTranscriptionEntries("/osta", fs);
    const cel = discoverTranscriptionEntries("/celestina", fs);
    expect(osta.map((e) => e.baseName)).toEqual(["TEXT.A"]);
    expect(cel.map((e) => e.baseName).sort()).toEqual(["1500__auto1", "1514__auto1"]);

    const files = new Map<string, string>([
      [path.normalize("/osta/TEXT.A.txt"), SAMPLE],
      [path.normalize("/celestina/1500/auto1.txt"), SAMPLE],
      [path.normalize("/celestina/1514/auto1.txt"), SAMPLE],
    ]);
    const written = new Map<string, string>();
    const batchFs: FileSystemWriter = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        written.set(path.normalize(filePath), contents);
      },
      readFile: (filePath) => files.get(path.normalize(filePath)) ?? SAMPLE,
      readdir: (dir) => tree[path.normalize(dir)] ?? [],
      exists: (p) =>
        dirs.has(path.normalize(p)) ||
        files.has(path.normalize(p)) ||
        path.normalize(p).startsWith(path.normalize("/out")),
      isDirectory: (p) => dirs.has(path.normalize(p)),
    };

    const output = runOstaBatchConvertWithFs(
      { inputDirs: ["/osta", "/celestina"], outputDir: "/out" },
      batchFs,
    );
    expect(output.fileResults).toHaveLength(3);
    expect(output.inputDirs).toEqual(["/osta", "/celestina"]);
    expect(written.has(path.normalize("/out/1500__auto1.library.json"))).toBe(true);
    expect(written.has(path.normalize("/out/1514__auto1.library.json"))).toBe(true);
    const catalog = JSON.parse(written.get(path.normalize("/out/library-catalog.json"))!);
    expect(catalog.entryCount).toBe(3);
    expect(catalog.entries.some((e: { keywords: string }) => /celestina/i.test(e.keywords))).toBe(
      true,
    );
  });
});
