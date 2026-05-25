import path from "node:path";
import type { ParsedManuscript, ValidationError } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { exportBaseName } from "@/utils/exportFormats";
import { exportToLegacyHTML } from "@/utils/htmlExport";
import { lintHsmsTranscription } from "@/utils/hsmsLinter";
import { inferManuscriptTitle } from "@/utils/manuscriptTitle";
import type { OstaFileIssue, OstaIssueSource } from "@/utils/ostaIssueReport";
import {
  buildLibraryCatalog,
  buildLibraryCatalogEntry,
  buildLibraryEntryPayload,
  type LibraryCatalogEntry,
} from "@/utils/libraryCatalog";
import { scanRenderedMarkupLeakage } from "@/utils/renderMarkupLeakage";
export type { OstaBatchSummary, OstaIssueGroup } from "@/utils/ostaIssueReport";

export const HSMS_NATIVE_BUNDLE_FORMAT = "hsms-native-bundle/2";

export const DEFAULT_OSTA_PATHS = {
  input: "C:\\jason\\_dev\\c#\\_gu\\OSTA\\transcriptions",
  output: "out",
} as const;

export interface HsmsNativeBundle {
  format: typeof HSMS_NATIVE_BUNDLE_FORMAT;
  exportedAt: string;
  sourceFileName: string;
  manuscriptTitle: string;
  transcriptionText: string;
  /** Present in memory during batch; v2 native modules compile from `transcriptionText` only. */
  parsedManuscript?: ParsedManuscript;
}

export interface OstaFileResult {
  sourceFileName: string;
  baseName: string;
  status: "ok" | "failed";
  compileError?: string;
  stats?: ParsedManuscript["stats"];
  folioCount?: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  lintErrorCount: number;
  lintWarningCount: number;
  parseErrorCount: number;
  parseWarningCount: number;
  renderErrorCount: number;
  renderWarningCount: number;
  issues: OstaFileIssue[];
  outputs: {
    html: string;
    nativeTs: string;
    issuesLog: string;
  };
}

export interface OstaBatchConvertOptions {
  inputDir: string;
  outputDir: string;
  /** Optional cap for smoke runs (e.g. --limit 5). */
  limit?: number;
  onProgress?: (fileName: string, index: number, total: number) => void;
}

export interface OstaBatchConvertOutput {
  fileResults: OstaFileResult[];
  inputDir: string;
  outputDir: string;
}

export { inferManuscriptTitle } from "@/utils/manuscriptTitle";

function toFileIssues(
  errors: ValidationError[] | undefined,
  source: OstaIssueSource,
): OstaFileIssue[] {
  return (errors ?? []).map((e) => ({
    lineIndex: e.lineIndex,
    severity: e.severity,
    message: e.message,
    rawSnippet: e.rawSnippet,
    source,
  }));
}

function issueDedupeKey(issue: OstaFileIssue): string {
  return `${issue.lineIndex}|${issue.severity}|${issue.message}`;
}

/** Parse-time issues not already reported by the pre-compile linter. */
export function splitLintAndParseIssues(
  lintIssues: OstaFileIssue[],
  compileValidation: ValidationError[] | undefined,
): { lintIssues: OstaFileIssue[]; parseIssues: OstaFileIssue[]; merged: OstaFileIssue[] } {
  const lintKeys = new Set(lintIssues.map(issueDedupeKey));
  const parseOnly: OstaFileIssue[] = [];

  for (const err of compileValidation ?? []) {
    const candidate: OstaFileIssue = {
      lineIndex: err.lineIndex,
      severity: err.severity,
      message: err.message,
      rawSnippet: err.rawSnippet,
      source: "parse",
    };
    if (!lintKeys.has(issueDedupeKey(candidate))) {
      parseOnly.push(candidate);
    }
  }

  const merged = [...lintIssues, ...parseOnly];
  return { lintIssues, parseIssues: parseOnly, merged };
}

function countBySeverity(issues: OstaFileIssue[]): { error: number; warning: number } {
  const counts = { error: 0, warning: 0 };
  for (let i = 0; i < issues.length; i++) {
    if (issues[i].severity === "error") counts.error++;
    else counts.warning++;
  }
  return counts;
}

export interface IssueLogSections {
  lint: OstaFileIssue[];
  parse: OstaFileIssue[];
  render: OstaFileIssue[];
}

export function formatIssueLog(
  sourceFileName: string,
  status: OstaFileResult["status"],
  sections: IssueLogSections | OstaFileIssue[],
  compileError?: string,
): string {
  const normalized: IssueLogSections = Array.isArray(sections)
    ? { lint: sections, parse: [], render: [] }
    : {
        lint: sections.lint,
        parse: sections.parse,
        render: sections.render ?? [],
      };

  const lines: string[] = [
    `HSMS batch conversion issue log`,
    `Source: ${sourceFileName}`,
    `Status: ${status}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  if (compileError) {
    lines.push("=== COMPILE FAILURE ===", compileError, "");
  }

  const totalIssues =
    normalized.lint.length + normalized.parse.length + normalized.render.length;
  if (totalIssues === 0 && !compileError) {
    lines.push("No lint, validation, or render-leakage issues detected.");
    return lines.join("\n");
  }

  const appendSection = (title: string, issues: OstaFileIssue[]) => {
    if (issues.length === 0) return;
    lines.push(title, "");
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const tag =
        issue.source === "lint"
          ? "LINT"
          : issue.source === "render"
            ? "RENDER"
            : "PARSE";
      lines.push(
        `[LINE ${issue.lineIndex + 1}] (${issue.severity.toUpperCase()}) [${tag}]: ${issue.message}`,
        `Snippet: ${issue.rawSnippet}`,
        "",
      );
    }
  };

  appendSection("=== PRE-COMPILE LINT (hsmsLinter) ===", normalized.lint);
  appendSection("=== COMPILE / PARSE VALIDATION ===", normalized.parse);
  appendSection("=== RENDER / HTML LEAKAGE (post-export scan) ===", normalized.render);

  return lines.join("\n");
}

export function generateNativeTypeScriptModule(bundle: HsmsNativeBundle): string {
  const meta = {
    format: bundle.format,
    exportedAt: bundle.exportedAt,
    sourceFileName: bundle.sourceFileName,
    manuscriptTitle: bundle.manuscriptTitle,
  };

  return `/** Auto-generated by npm run batch:osta — do not edit manually. */
import type { ParsedManuscript } from "../constants/manuscript";
import { compileManuscriptTree } from "../utils/compiler";
import type { HsmsNativeBundle } from "../utils/ostaBatchConverter";

export const nativeBundleMeta = ${JSON.stringify(meta, null, 2)} as const;

export const transcriptionText = ${JSON.stringify(bundle.transcriptionText)};

/** Parsed at load time from \`transcriptionText\` (keeps bundle files small). */
export const parsedManuscript: ParsedManuscript = compileManuscriptTree(transcriptionText);

const bundle: HsmsNativeBundle = {
  ...nativeBundleMeta,
  transcriptionText,
  parsedManuscript,
};

export default bundle;
`;
}

export function processOstaTranscription(
  sourceFileName: string,
  rawText: string,
): Omit<OstaFileResult, "outputs"> & {
  html: string;
  nativeTs: string;
  issuesLog: string;
} {
  const baseName = exportBaseName(sourceFileName);
  const exportedAt = new Date().toISOString();

  const lintReport = lintHsmsTranscription(rawText);
  const lintIssues = toFileIssues(lintReport.issues, "lint");

  try {
    const parsed = compileManuscriptTree(rawText);
    const { parseIssues, merged } = splitLintAndParseIssues(
      lintIssues,
      parsed.validationErrors,
    );

    const lintCounts = countBySeverity(lintIssues);
    const parseCounts = countBySeverity(parseIssues);

    const html = exportToLegacyHTML(parsed, {
      showExpanded: true,
      showDeletions: true,
      useNormalizedDiacritics: true,
      suppressOtioseMarks: false,
    });

    const renderIssues = toFileIssues(
      scanRenderedMarkupLeakage(html, rawText, parsed, { skipLacunaChecks: true }),
      "render",
    );
    const renderCounts = countBySeverity(renderIssues);
    const allIssues = [...merged, ...renderIssues];
    const totalErrors = lintCounts.error + parseCounts.error + renderCounts.error;
    const totalWarnings = lintCounts.warning + parseCounts.warning + renderCounts.warning;

    const bundle: HsmsNativeBundle = {
      format: HSMS_NATIVE_BUNDLE_FORMAT,
      exportedAt,
      sourceFileName,
      manuscriptTitle: inferManuscriptTitle(rawText, sourceFileName),
      transcriptionText: rawText,
      parsedManuscript: parsed,
    };

    const nativeTs = generateNativeTypeScriptModule(bundle);
    const issuesLog = formatIssueLog(sourceFileName, "ok", {
      lint: lintIssues,
      parse: parseIssues,
      render: renderIssues,
    });

    return {
      sourceFileName,
      baseName,
      status: "ok",
      stats: parsed.stats,
      folioCount: parsed.folios.length,
      issueCount: allIssues.length,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      lintErrorCount: lintCounts.error,
      lintWarningCount: lintCounts.warning,
      parseErrorCount: parseCounts.error,
      parseWarningCount: parseCounts.warning,
      renderErrorCount: renderCounts.error,
      renderWarningCount: renderCounts.warning,
      issues: allIssues,
      html,
      nativeTs,
      issuesLog,
    };
  } catch (err: unknown) {
    const compileError =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown compile failure";

    const lintCounts = countBySeverity(lintIssues);
    const issuesLog = formatIssueLog(
      sourceFileName,
      "failed",
      { lint: lintIssues, parse: [], render: [] },
      compileError,
    );

    return {
      sourceFileName,
      baseName,
      status: "failed",
      compileError,
      issueCount: lintIssues.length,
      errorCount: lintCounts.error,
      warningCount: lintCounts.warning,
      lintErrorCount: lintCounts.error,
      lintWarningCount: lintCounts.warning,
      parseErrorCount: 0,
      parseWarningCount: 0,
      renderErrorCount: 0,
      renderWarningCount: 0,
      issues: lintIssues,
      html: "",
      nativeTs: "",
      issuesLog,
    };
  }
}

export interface FileSystemWriter {
  mkdir(path: string): void;
  writeFile(path: string, contents: string): void;
  readFile(path: string): string;
  readdir(path: string): string[];
  exists(path: string): boolean;
}

export function discoverTranscriptionFiles(inputDir: string, readdir: (dir: string) => string[]): string[] {
  return readdir(inputDir)
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b));
}

export function runOstaBatchConvertWithFs(
  options: OstaBatchConvertOptions,
  fs: FileSystemWriter,
): OstaBatchConvertOutput {
  if (!fs.exists(options.inputDir)) {
    throw new Error(`OSTA transcriptions directory not found: ${options.inputDir}`);
  }

  fs.mkdir(options.outputDir);

  const allFiles = discoverTranscriptionFiles(options.inputDir, (dir) => fs.readdir(dir));
  const targetFiles =
    typeof options.limit === "number" && options.limit > 0
      ? allFiles.slice(0, options.limit)
      : allFiles;

  const fileResults: OstaFileResult[] = [];
  const catalogEntries: LibraryCatalogEntry[] = [];

  const exportedAt = new Date().toISOString();

  for (let i = 0; i < targetFiles.length; i++) {
    const sourceFileName = targetFiles[i];
    options.onProgress?.(sourceFileName, i + 1, targetFiles.length);

    const rawText = fs.readFile(path.join(options.inputDir, sourceFileName));
    const processed = processOstaTranscription(sourceFileName, rawText);

    const htmlPath = path.join(options.outputDir, `${processed.baseName}.html`);
    const nativePath = path.join(options.outputDir, `${processed.baseName}.native.ts`);
    const logPath = path.join(options.outputDir, `${processed.baseName}.issues.log`);

    if (processed.status === "ok") {
      fs.writeFile(htmlPath, processed.html);
      fs.writeFile(nativePath, processed.nativeTs);

      const libraryPath = path.join(options.outputDir, `${processed.baseName}.library.json`);
      fs.writeFile(
        libraryPath,
        JSON.stringify(
          buildLibraryEntryPayload({
            baseName: processed.baseName,
            sourceFileName: processed.sourceFileName,
            exportedAt,
            transcriptionText: rawText,
            manuscriptTitle: inferManuscriptTitle(rawText, processed.sourceFileName),
          }),
          null,
          2,
        ),
      );
    }
    fs.writeFile(logPath, processed.issuesLog);

    catalogEntries.push(
      buildLibraryCatalogEntry({
        baseName: processed.baseName,
        sourceFileName: processed.sourceFileName,
        status: processed.status,
        exportedAt,
        transcriptionText: processed.status === "ok" ? rawText : undefined,
        manuscriptTitle:
          processed.status === "ok"
            ? inferManuscriptTitle(rawText, processed.sourceFileName)
            : undefined,
        folioCount: processed.folioCount,
        wordCount: processed.stats?.totalWords,
      }),
    );

    fileResults.push({
      sourceFileName: processed.sourceFileName,
      baseName: processed.baseName,
      status: processed.status,
      compileError: processed.compileError,
      stats: processed.stats,
      folioCount: processed.folioCount,
      issueCount: processed.issueCount,
      errorCount: processed.errorCount,
      warningCount: processed.warningCount,
      lintErrorCount: processed.lintErrorCount,
      lintWarningCount: processed.lintWarningCount,
      parseErrorCount: processed.parseErrorCount,
      parseWarningCount: processed.parseWarningCount,
      renderErrorCount: processed.renderErrorCount,
      renderWarningCount: processed.renderWarningCount,
      issues: processed.issues,
      outputs: {
        html: htmlPath,
        nativeTs: nativePath,
        issuesLog: logPath,
      },
    });
  }

  const catalog = buildLibraryCatalog(catalogEntries, options.outputDir);
  fs.writeFile(
    path.join(options.outputDir, "library-catalog.json"),
    JSON.stringify(catalog, null, 2),
  );

  return {
    fileResults,
    inputDir: options.inputDir,
    outputDir: options.outputDir,
  };
}
