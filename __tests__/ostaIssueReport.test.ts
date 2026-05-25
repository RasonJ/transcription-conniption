import path from "node:path";
import {
  buildIssueGroups,
  buildIssuesJson,
  formatIssuesSummaryText,
  parseIssueLog,
  runOstaIssueReportWithFs,
  type FileSystemReader,
} from "../utils/ostaIssueReport";
import { formatIssueLog } from "../utils/ostaBatchConverter";

describe("ostaIssueReport", () => {
  it("parses issue logs written by the batch converter", () => {
    const log = formatIssueLog("TEXT.DEMO.txt", "ok", {
      lint: [
        {
          lineIndex: 0,
          severity: "error",
          message: "[FOLIO_LEAK] Folio boundary marker required",
          rawSnippet: "foo",
          source: "lint",
        },
      ],
      parse: [
        {
          lineIndex: 2,
          severity: "error",
          message: "Unclosed expansion tag `<…>` before line end",
          rawSnippet: "foo <bar",
          source: "parse",
        },
      ],
      render: [
        {
          lineIndex: 4,
          severity: "error",
          message: "[RENDER_LEAK] Leftover HSMS brace mnemonic in rendered HTML: {CB1.}",
          rawSnippet: "{CB1.}",
          source: "render",
        },
      ],
    });

    const parsed = parseIssueLog(log, "TEXT.DEMO.issues.log");
    expect(parsed.sourceFileName).toBe("TEXT.DEMO.txt");
    expect(parsed.status).toBe("ok");
    expect(parsed.issueCount).toBe(3);
    expect(parsed.errorCount).toBe(3);
    expect(parsed.lintErrorCount).toBe(1);
    expect(parsed.parseErrorCount).toBe(1);
    expect(parsed.renderErrorCount).toBe(1);
    expect(parsed.issues[0].source).toBe("lint");
    expect(parsed.issues[1].source).toBe("parse");
    expect(parsed.issues[2].source).toBe("render");
  });

  it("aggregates lint issue codes from tagged logs", () => {
    const log = formatIssueLog("X.txt", "ok", {
      lint: [
        {
          lineIndex: 0,
          severity: "error",
          message: "[FOLIO_LEAK] Folio boundary marker required",
          rawSnippet: "x",
          source: "lint",
        },
      ],
      parse: [],
      render: [],
    });
    const parsed = parseIssueLog(log, "X.issues.log");
    const groups = buildIssueGroups([parsed]);
    expect(groups.some((g) => g.code === "FOLIO_LEAK")).toBe(true);
  });

  it("writes issues.json and issues-summary.txt (not markdown)", () => {
    const logA = formatIssueLog("A.txt", "ok", {
      lint: [],
      render: [],
      parse: [
        {
          lineIndex: 0,
          severity: "error",
          message: "Unclosed expansion tag `<…>` before line end",
          rawSnippet: "foo <bar",
          source: "parse",
        },
      ],
    });
    const logB = formatIssueLog("B.txt", "ok", {
      lint: [],
      parse: [
        {
          lineIndex: 2,
          severity: "error",
          message: "Unclosed expansion tag `<…>` before line end",
          rawSnippet: "baz <qux",
          source: "parse",
        },
      ],
    });

    const written = new Map<string, string>();
    const fs: FileSystemReader = {
      mkdir: () => {},
      writeFile: (filePath, contents) => {
        written.set(path.normalize(filePath), contents);
      },
      readFile: (filePath) => {
        const key = path.normalize(filePath);
        const value = written.get(key);
        if (value === undefined) {
          throw new Error(`missing ${key}`);
        }
        return value;
      },
      readdir: () => ["A.issues.log", "B.issues.log"],
      exists: () => true,
    };

    written.set(path.normalize("/out/A.issues.log"), logA);
    written.set(path.normalize("/out/B.issues.log"), logB);

    const output = runOstaIssueReportWithFs({ outputDir: "/out", inputDir: "/in" }, fs);

    expect(written.has(path.normalize("/out/issues.json"))).toBe(true);
    expect(written.has(path.normalize("/out/issues-summary.txt"))).toBe(true);
    expect(written.has(path.normalize("/out/issues-summary.md"))).toBe(false);

    const json = JSON.parse(written.get(path.normalize("/out/issues.json"))!) as ReturnType<
      typeof buildIssuesJson
    >;
    expect(json.format).toBe("hsms-osta-issues/1");
    expect(json.byCode.UNCLOSED_EXPANSION.variantCount).toBe(1);
    expect(json.priorities).toHaveLength(1);
    expect(json.fileRollup).toHaveLength(2);
    expect(json.stats.totalParseErrors).toBe(2);
    expect("fileResults" in json).toBe(false);
    expect("issueGroups" in json).toBe(false);

    const txt = written.get(path.normalize("/out/issues-summary.txt"))!;
    expect(txt).toContain("=== Overview ===");
    expect(txt).toContain("Lint errors:");
    expect(txt).toContain("Parse errors:");
    expect(txt).toContain("Render errors:");
    expect(txt).toContain("UNCLOSED_EXPANSION");
    expect(output.issuesTextPath).toContain("issues-summary.txt");
  });

  it("aggregates validation issues across files", () => {
    const results = [
      {
        sourceFileName: "A.txt",
        baseName: "A",
        status: "ok" as const,
        issueCount: 1,
        errorCount: 1,
        warningCount: 0,
        lintErrorCount: 0,
        lintWarningCount: 0,
        parseErrorCount: 1,
        parseWarningCount: 0,
        issues: [
          {
            lineIndex: 0,
            severity: "error" as const,
            message: "Unclosed expansion tag `<…>` before line end",
            rawSnippet: "foo <bar",
            source: "parse" as const,
          },
        ],
      },
      {
        sourceFileName: "B.txt",
        baseName: "B",
        status: "ok" as const,
        issueCount: 1,
        errorCount: 1,
        warningCount: 0,
        lintErrorCount: 0,
        lintWarningCount: 0,
        parseErrorCount: 1,
        parseWarningCount: 0,
        issues: [
          {
            lineIndex: 2,
            severity: "error" as const,
            message: "Unclosed expansion tag `<…>` before line end",
            rawSnippet: "baz <qux",
            source: "parse" as const,
          },
        ],
      },
    ];

    const groups = buildIssueGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].occurrenceCount).toBe(2);
    expect(groups[0].fileCount).toBe(2);

    const payload = buildIssuesJson("/in", "/out", results, groups);
    const txt = formatIssuesSummaryText(payload, groups);
    expect(txt).toContain("Unclosed expansion tag");
    expect(txt).toContain("A.txt");
  });
});
