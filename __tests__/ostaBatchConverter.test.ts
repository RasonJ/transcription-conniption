import path from "node:path";
import { compileManuscriptTree } from "../utils/compiler";
import {
  formatIssueLog,
  generateNativeTypeScriptModule,
  processOstaTranscription,
  runOstaBatchConvertWithFs,
  splitLintAndParseIssues,
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
    const fs: FileSystemWriter = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        written.set(path.normalize(filePath), contents);
      },
      readFile: () => SAMPLE,
      readdir: () => ["TEXT.DEMO.txt"],
      exists: () => true,
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
    expect(written.has(path.join(out, "library-catalog.json"))).toBe(true);
    expect(written.has(path.join(out, "issues-summary.json"))).toBe(false);
    expect(output.fileResults).toHaveLength(1);
    expect(output.fileResults[0].status).toBe("ok");
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
});
