import path from "node:path";
import type { ValidationError } from "@/constants/manuscript";
import { exportBaseName } from "@/utils/exportFormats";

export const OSTA_ISSUES_JSON_FORMAT = "hsms-osta-issues/1";

export type OstaIssueSource = "lint" | "parse" | "render";

export interface OstaFileIssue {
  lineIndex: number;
  severity: ValidationError["severity"];
  message: string;
  rawSnippet: string;
  /** `lint` = hsmsLinter pre-pass; `parse` = compile-time parser validation. */
  source?: OstaIssueSource;
}

export interface OstaFileResult {
  sourceFileName: string;
  baseName: string;
  status: "ok" | "failed";
  compileError?: string;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  lintErrorCount?: number;
  lintWarningCount?: number;
  parseErrorCount?: number;
  parseWarningCount?: number;
  renderErrorCount?: number;
  renderWarningCount?: number;
  issues: OstaFileIssue[];
  issuesLogPath?: string;
}

export interface OstaIssueGroup {
  code: string;
  severity: ValidationError["severity"];
  message: string;
  occurrenceCount: number;
  fileCount: number;
  files: string[];
  priorityScore: number;
  examples: Array<{ sourceFileName: string; lineIndex: number; rawSnippet: string }>;
}

export interface OstaIssuesStats {
  totalFiles: number;
  succeeded: number;
  failed: number;
  filesWithIssues: number;
  filesClean: number;
  totalValidationErrors: number;
  totalValidationWarnings: number;
  totalLintErrors: number;
  totalLintWarnings: number;
  totalParseErrors: number;
  totalParseWarnings: number;
  totalRenderErrors: number;
  totalRenderWarnings: number;
  distinctIssueTypes: number;
}

export interface OstaIssuePriorityItem {
  code: string;
  severity: ValidationError["severity"];
  message: string;
  occurrenceCount: number;
  fileCount: number;
  files: string[];
  priorityScore: number;
}

export interface OstaCodeSummary {
  variantCount: number;
  fileCount: number;
  occurrenceCount: number;
  items: OstaIssuePriorityItem[];
}

/** Compact JSON payload — no per-line issue dumps (see *.issues.log). */
export interface OstaIssuesJson {
  format: typeof OSTA_ISSUES_JSON_FORMAT;
  generatedAt: string;
  inputDir: string;
  outputDir: string;
  stats: OstaIssuesStats;
  compileFailures: Array<{ sourceFileName: string; compileError: string }>;
  byCode: Record<string, OstaCodeSummary>;
  priorities: OstaIssuePriorityItem[];
  fileRollup: Array<{
    sourceFileName: string;
    status: "ok" | "failed";
    errorCount: number;
    warningCount: number;
    lintErrorCount: number;
    lintWarningCount: number;
    parseErrorCount: number;
    parseWarningCount: number;
    renderErrorCount: number;
    renderWarningCount: number;
    issueCount: number;
  }>;
}

const JSON_TOP_PRIORITIES = 40;
const JSON_TOP_VARIANTS_PER_CODE = 25;
const JSON_MAX_FILES_LISTED = 20;

export interface OstaIssueReportOutput {
  stats: OstaIssuesStats;
  issuesJsonPath: string;
  issuesTextPath: string;
}

export interface OstaIssueReportOptions {
  outputDir: string;
  inputDir?: string;
  onProgress?: (logFileName: string, index: number, total: number) => void;
}

export interface FileSystemReader {
  readFile(path: string): string;
  readdir(path: string): string[];
  exists(path: string): boolean;
  writeFile(path: string, contents: string): void;
  mkdir(path: string): void;
}

const RE_LOG_SOURCE = /^Source:\s*(.+)$/m;
const RE_LOG_STATUS = /^Status:\s*(ok|failed)$/m;
const RE_LOG_ISSUE =
  /^\[LINE (\d+)\] \((ERROR|WARNING)\)(?: \[(LINT|PARSE|RENDER)\])?: (.+)$/;
const RE_LOG_SNIPPET = /^Snippet:\s*(.*)$/;

/** Collapse line-specific messages so aggregation matches hsms-tmp scale. */
export function normalizeIssueMessageForGrouping(message: string): string {
  return message
    .replace(/\bon line \d+\b/gi, "on line *")
    .replace(/\bfound on line \d+\b/gi, "found on line *")
    .replace(/\bbefore line \d+\b/gi, "before line *");
}

export function issueCodeFromMessage(message: string): string {
  const tagged = message.match(/^\[([A-Z][A-Z0-9_]*)\]\s*/);
  if (tagged) {
    return tagged[1];
  }

  const m = message.toLowerCase();
  if (m.includes("unclosed environment")) return "UNCLOSED_ENVIRONMENT";
  if (m.includes("unclosed expansion")) return "UNCLOSED_EXPANSION";
  if (m.includes("unclosed parenthetical deletion")) return "UNCLOSED_PAREN_DELETION";
  if (m.includes("unclosed bracket insertion")) return "UNCLOSED_BRACKET_INSERTION";
  if (m.includes("stray closing brace")) return "STRAY_CLOSE_BRACE";
  if (m.includes("extra structural closing brace")) return "EXTRA_CLOSE_BRACE";
  if (m.includes("continuation delimiter (+)")) return "IMPLICIT_CONTINUATION_SLOP";
  if (m.includes("unmapped mnemonic")) return "UNMAPPED_MNEMONIC";
  if (m.includes("folio boundary") || m.includes("folio marker")) return "FOLIO_LEAK";
  if (m.includes("compiler_crash") || m.includes("tokenizer failed")) return "COMPILER_CRASH";
  if (m.includes("malformed_header")) return "MALFORMED_HEADER_BLOCK";
  if (m.includes("catchword") || m.includes("signature")) return "STRAY_PAGE_METADATA";
  if (m.includes("initial_gutter") || m.includes("drop-cap gutter")) return "INITIAL_GUTTER_LEAK";
  if (m.includes("malformed_reconstruction") || m.includes("editorial reconstruction"))
    return "MALFORMED_RECONSTRUCTION";
  if (m.includes("empty bracket")) return "EMPTY_BRACKET_TOKEN";
  if (m.includes("empty_file")) return "EMPTY_FILE";
  if (m.includes("render_leak") || m.includes("render leak")) return "RENDER_LEAK";
  if (m.includes("render_brace")) return "RENDER_BRACE_MNEMONIC";
  if (m.includes("render_drop_initial")) return "RENDER_DROP_INITIAL";
  if (m.includes("render_column")) return "RENDER_COLUMN_TAG";
  if (m.includes("render_folio")) return "RENDER_FOLIO_MARKER";
  if (m.includes("render_expansion")) return "RENDER_EXPANSION_ANGLE";
  if (m.includes("reconstruction markup") || m.includes("raw_reconstruction"))
    return "RENDER_RAW_RECONSTRUCTION";
  if (m.includes("mechanical lacuna") || m.includes("bracket_lacuna"))
    return "RENDER_BRACKET_LACUNA";
  if (m.includes("stray bracketed") || m.includes("stray_bracket")) return "RENDER_STRAY_BRACKET";
  if (m.includes("bracket clump") || m.includes("bracket_clump")) return "RENDER_BRACKET_CLUMP";
  if (m.includes("loose bracket")) return "RENDER_LOOSE_BRACKET";
  if (m.includes("illegible bracket")) return "RENDER_BRACKET_ILLEGIBLE";
  if (m.includes("empty bracket")) return "RENDER_EMPTY_BRACKETS";
  return "VALIDATION_OTHER";
}

export function priorityScore(
  severity: ValidationError["severity"],
  fileCount: number,
  occurrenceCount: number,
): number {
  const levelWeight = severity === "error" ? 1_000_000 : 0;
  return levelWeight + fileCount * 1000 + occurrenceCount;
}

export function discoverIssueLogFiles(
  outputDir: string,
  readdir: (dir: string) => string[],
): string[] {
  return readdir(outputDir)
    .filter((name) => name.toLowerCase().endsWith(".issues.log"))
    .sort((a, b) => a.localeCompare(b));
}

export function issueLogBaseName(logFileName: string): string {
  return logFileName.replace(/\.issues\.log$/i, "");
}

export function parseIssueLog(logContents: string, logFileName: string): OstaFileResult {
  const baseName = issueLogBaseName(logFileName);
  const sourceMatch = logContents.match(RE_LOG_SOURCE);
  const statusMatch = logContents.match(RE_LOG_STATUS);
  const sourceFileName = sourceMatch?.[1]?.trim() ?? `${baseName}.txt`;
  const status = statusMatch?.[1] === "failed" ? "failed" : "ok";

  let compileError: string | undefined;
  const compileBlock = logContents.match(/=== COMPILE FAILURE ===\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/);
  if (compileBlock) {
    compileError = compileBlock[1].trim();
  }

  const issues: OstaFileIssue[] = [];
  const lines = logContents.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const issueMatch = lines[i].match(RE_LOG_ISSUE);
    if (!issueMatch) {
      continue;
    }
    const lineNumber = Number.parseInt(issueMatch[1], 10);
    const severity = issueMatch[2].toLowerCase() as ValidationError["severity"];
    const sourceTag = issueMatch[3] as "LINT" | "PARSE" | "RENDER" | undefined;
    const message = issueMatch[4];
    const source: OstaIssueSource | undefined =
      sourceTag === "LINT"
        ? "lint"
        : sourceTag === "PARSE"
          ? "parse"
          : sourceTag === "RENDER"
            ? "render"
            : undefined;
    let rawSnippet = "";
    if (i + 1 < lines.length) {
      const snippetMatch = lines[i + 1].match(RE_LOG_SNIPPET);
      if (snippetMatch) {
        rawSnippet = snippetMatch[1];
      }
    }
    issues.push({
      lineIndex: Math.max(0, lineNumber - 1),
      severity,
      message,
      rawSnippet,
      ...(source ? { source } : {}),
    });
  }

  let errorCount = 0;
  let warningCount = 0;
  let lintErrorCount = 0;
  let lintWarningCount = 0;
  let parseErrorCount = 0;
  let parseWarningCount = 0;
  let renderErrorCount = 0;
  let renderWarningCount = 0;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const isError = issue.severity === "error";
    if (isError) {
      errorCount++;
    } else {
      warningCount++;
    }
    if (issue.source === "lint") {
      if (isError) lintErrorCount++;
      else lintWarningCount++;
    } else if (issue.source === "parse") {
      if (isError) parseErrorCount++;
      else parseWarningCount++;
    } else if (issue.source === "render") {
      if (isError) renderErrorCount++;
      else renderWarningCount++;
    }
  }

  return {
    sourceFileName,
    baseName: exportBaseName(sourceFileName) || baseName,
    status,
    compileError,
    issueCount: issues.length,
    errorCount,
    warningCount,
    lintErrorCount,
    lintWarningCount,
    parseErrorCount,
    parseWarningCount,
    renderErrorCount,
    renderWarningCount,
    issues,
  };
}

export function buildIssueGroups(results: OstaFileResult[]): OstaIssueGroup[] {
  const map = new Map<string, OstaIssueGroup>();

  for (let ri = 0; ri < results.length; ri++) {
    const result = results[ri];
    for (let ii = 0; ii < result.issues.length; ii++) {
      const issue = result.issues[ii];
      const code = issueCodeFromMessage(issue.message);
      const message = normalizeIssueMessageForGrouping(issue.message);
      const key = `${issue.severity}|${code}|${message}`;
      let group = map.get(key);
      if (!group) {
        group = {
          code,
          severity: issue.severity,
          message,
          occurrenceCount: 0,
          fileCount: 0,
          files: [],
          priorityScore: 0,
          examples: [],
        };
        map.set(key, group);
      }

      group.occurrenceCount++;
      if (!group.files.includes(result.sourceFileName)) {
        group.files.push(result.sourceFileName);
        group.fileCount++;
      }
      if (group.examples.length < 3) {
        group.examples.push({
          sourceFileName: result.sourceFileName,
          lineIndex: issue.lineIndex,
          rawSnippet: issue.rawSnippet.slice(0, 120),
        });
      }
    }
  }

  const groups = [...map.values()];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    g.priorityScore = priorityScore(g.severity, g.fileCount, g.occurrenceCount);
  }

  return groups.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return a.message.localeCompare(b.message);
  });
}

export function buildIssuesStats(fileResults: OstaFileResult[], issueGroups: OstaIssueGroup[]): OstaIssuesStats {
  let succeeded = 0;
  let failed = 0;
  let totalValidationErrors = 0;
  let totalValidationWarnings = 0;
  let totalLintErrors = 0;
  let totalLintWarnings = 0;
  let totalParseErrors = 0;
  let totalParseWarnings = 0;
  let totalRenderErrors = 0;
  let totalRenderWarnings = 0;
  let filesWithIssues = 0;

  for (let i = 0; i < fileResults.length; i++) {
    const result = fileResults[i];
    if (result.status === "ok") {
      succeeded++;
    } else {
      failed++;
    }
    if (result.issueCount > 0 || result.status === "failed") {
      filesWithIssues++;
    }
    totalValidationErrors += result.errorCount;
    totalValidationWarnings += result.warningCount;
    totalLintErrors += result.lintErrorCount ?? 0;
    totalLintWarnings += result.lintWarningCount ?? 0;
    totalParseErrors += result.parseErrorCount ?? 0;
    totalParseWarnings += result.parseWarningCount ?? 0;
    totalRenderErrors += result.renderErrorCount ?? 0;
    totalRenderWarnings += result.renderWarningCount ?? 0;
  }

  return {
    totalFiles: fileResults.length,
    succeeded,
    failed,
    filesWithIssues,
    filesClean: fileResults.length - filesWithIssues,
    totalValidationErrors,
    totalValidationWarnings,
    totalLintErrors,
    totalLintWarnings,
    totalParseErrors,
    totalParseWarnings,
    totalRenderErrors,
    totalRenderWarnings,
    distinctIssueTypes: issueGroups.length,
  };
}

export function toPriorityItem(
  group: OstaIssueGroup,
  maxFiles = JSON_MAX_FILES_LISTED,
): OstaIssuePriorityItem {
  return {
    code: group.code,
    severity: group.severity,
    message: group.message,
    occurrenceCount: group.occurrenceCount,
    fileCount: group.fileCount,
    files: group.files.slice(0, maxFiles),
    priorityScore: group.priorityScore,
  };
}

export function buildByCodeSummary(issueGroups: OstaIssueGroup[]): Record<string, OstaCodeSummary> {
  const byCode = groupByCode(issueGroups);
  const summary: Record<string, OstaCodeSummary> = {};

  for (const [code, list] of byCode.entries()) {
    const files = new Set(list.flatMap((x) => x.files));
    const occurrenceCount = list.reduce((s, x) => s + x.occurrenceCount, 0);
    summary[code] = {
      variantCount: list.length,
      fileCount: files.size,
      occurrenceCount,
      items: list
        .slice(0, JSON_TOP_VARIANTS_PER_CODE)
        .map((g) => toPriorityItem(g)),
    };
  }

  return summary;
}

export function buildIssuesJson(
  inputDir: string,
  outputDir: string,
  fileResults: OstaFileResult[],
  issueGroups: OstaIssueGroup[],
): OstaIssuesJson {
  const stats = buildIssuesStats(fileResults, issueGroups);
  const compileFailures = fileResults
    .filter((f) => f.status === "failed")
    .map((f) => ({
      sourceFileName: f.sourceFileName,
      compileError: f.compileError ?? "unknown error",
    }));

  const fileRollup = fileResults.map((f) => ({
    sourceFileName: f.sourceFileName,
    status: f.status,
    errorCount: f.errorCount,
    warningCount: f.warningCount,
    lintErrorCount: f.lintErrorCount ?? 0,
    lintWarningCount: f.lintWarningCount ?? 0,
    parseErrorCount: f.parseErrorCount ?? 0,
    parseWarningCount: f.parseWarningCount ?? 0,
    renderErrorCount: f.renderErrorCount ?? 0,
    renderWarningCount: f.renderWarningCount ?? 0,
    issueCount: f.issueCount,
  }));

  return {
    format: OSTA_ISSUES_JSON_FORMAT,
    generatedAt: new Date().toISOString(),
    inputDir,
    outputDir,
    stats,
    compileFailures,
    byCode: buildByCodeSummary(issueGroups),
    priorities: issueGroups
      .slice(0, JSON_TOP_PRIORITIES)
      .map((g) => toPriorityItem(g)),
    fileRollup,
  };
}

function groupByCode(groups: OstaIssueGroup[]): Map<string, OstaIssueGroup[]> {
  const byCode = new Map<string, OstaIssueGroup[]>();
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!byCode.has(g.code)) {
      byCode.set(g.code, []);
    }
    byCode.get(g.code)!.push(g);
  }
  return byCode;
}

export function formatIssuesSummaryText(
  payload: OstaIssuesJson,
  issueGroups: OstaIssueGroup[],
): string {
  const { stats } = payload;
  const buckets = issueGroups;
  const byCode = groupByCode(buckets);

  const lines: string[] = [
    "HSMS OSTA issues aggregate — prioritized fix list",
    `Generated: ${payload.generatedAt}`,
    `Input: ${payload.inputDir}`,
    `Logs: ${payload.outputDir}`,
    "",
    "=== Overview ===",
    `Files scanned:         ${stats.totalFiles}`,
    `Compiled successfully: ${stats.succeeded}`,
    `Compile failures:      ${stats.failed}`,
    `Files with issues:     ${stats.filesWithIssues}`,
    `Files clean:           ${stats.filesClean}`,
    `Total error instances:   ${stats.totalValidationErrors}`,
    `Total warning instances: ${stats.totalValidationWarnings}`,
    `  Lint errors:           ${stats.totalLintErrors}`,
    `  Lint warnings:         ${stats.totalLintWarnings}`,
    `  Parse errors:          ${stats.totalParseErrors}`,
    `  Parse warnings:        ${stats.totalParseWarnings}`,
    `  Render errors:         ${stats.totalRenderErrors}`,
    `  Render warnings:       ${stats.totalRenderWarnings}`,
    `Distinct issue types:    ${stats.distinctIssueTypes}`,
    "",
  ];

  if (payload.compileFailures.length > 0) {
    lines.push("=== Compile failures ===");
    for (let i = 0; i < payload.compileFailures.length; i++) {
      const f = payload.compileFailures[i];
      lines.push(`  ${f.sourceFileName}: ${f.compileError}`);
    }
    lines.push("");
  }

  lines.push("=== By issue code (fix category) ===");

  const codeOrder = [...byCode.entries()].sort(
    (a, b) =>
      b[1].reduce((s, x) => s + x.priorityScore, 0) -
      a[1].reduce((s, x) => s + x.priorityScore, 0),
  );

  for (const [code, list] of codeOrder) {
    const files = new Set(list.flatMap((x) => x.files));
    const occ = list.reduce((s, x) => s + x.occurrenceCount, 0);
    lines.push("");
    lines.push(code);
    lines.push(`  ${list.length} variant(s) · ${files.size} file(s) · ${occ} occurrence(s)`);
    for (let vi = 0; vi < Math.min(15, list.length); vi++) {
      const item = list[vi];
      lines.push(
        `    · ${item.message} — ${item.fileCount} files, ${item.occurrenceCount}x`,
      );
    }
    if (list.length > 15) {
      lines.push(`    … and ${list.length - 15} more variant(s)`);
    }
  }

  lines.push("");
  lines.push("=== Top priorities (action list) ===");
  const top =
    payload.priorities.length > 0
      ? payload.priorities
      : buckets.slice(0, JSON_TOP_PRIORITIES).map((g) => toPriorityItem(g, 8));
  for (let i = 0; i < Math.min(JSON_TOP_PRIORITIES, top.length); i++) {
    const b = top[i];
    const tag = b.severity === "error" ? "ERROR" : "WARN ";
    lines.push(`${String(i + 1).padStart(2)}. [${tag}] ${b.code} — ${b.message}`);
    lines.push(
      `        ${b.fileCount} files · ${b.occurrenceCount} occurrences · score ${b.priorityScore}`,
    );
    if (b.fileCount <= 8) {
      lines.push(`        files: ${b.files.join(", ")}`);
    } else {
      lines.push(`        files: ${b.files.slice(0, 8).join(", ")} … (+${b.fileCount - 8} more)`);
    }
  }

  lines.push("");
  lines.push("Per-witness detail: out/<name>.issues.log");
  lines.push("Re-aggregate: npm run report:osta");

  return lines.join("\n");
}

export function runOstaIssueReportWithFs(
  options: OstaIssueReportOptions,
  fs: FileSystemReader,
): OstaIssueReportOutput {
  if (!fs.exists(options.outputDir)) {
    throw new Error(`Output directory not found: ${options.outputDir}`);
  }

  fs.mkdir(options.outputDir);

  const logFiles = discoverIssueLogFiles(options.outputDir, (dir) => fs.readdir(dir));
  if (logFiles.length === 0) {
    throw new Error(
      `No *.issues.log files found in ${options.outputDir}. Run batch conversion first or check --out.`,
    );
  }

  const fileResults: OstaFileResult[] = [];

  for (let i = 0; i < logFiles.length; i++) {
    const logFileName = logFiles[i];
    options.onProgress?.(logFileName, i + 1, logFiles.length);
    const logPath = path.join(options.outputDir, logFileName);
    const parsed = parseIssueLog(fs.readFile(logPath), logFileName);
    parsed.issuesLogPath = logPath;
    fileResults.push(parsed);
  }

  const inputDir = options.inputDir ?? "(from issue logs)";
  const issueGroups = buildIssueGroups(fileResults);
  const payload = buildIssuesJson(inputDir, options.outputDir, fileResults, issueGroups);
  const issuesJsonPath = path.join(options.outputDir, "issues.json");
  const issuesTextPath = path.join(options.outputDir, "issues-summary.txt");

  fs.writeFile(issuesJsonPath, JSON.stringify(payload, null, 2));
  fs.writeFile(issuesTextPath, formatIssuesSummaryText(payload, issueGroups));

  return { stats: payload.stats, issuesJsonPath, issuesTextPath };
}
