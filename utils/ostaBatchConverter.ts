import path from "node:path";
import type { ParsedManuscript, ValidationError } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";
import { exportBaseName } from "@/utils/exportFormats";
import { exportToLegacyHTML } from "@/utils/htmlExport";
import { lintHsmsTranscription } from "@/utils/hsmsLinter";
import { inferManuscriptTitle } from "@/utils/manuscriptTitle";
import type { OstaFileIssue, OstaIssueSource } from "@/utils/ostaIssueReport";
import {
  buildPrecompiledFacets,
  runCorpusPrecomputeWithFs,
} from "@/utils/corpusPrecompute";
import {
  buildLibraryCatalog,
  buildLibraryCatalogEntry,
  buildLibraryEntryPayload,
  type LibraryCatalogEntry,
} from "@/utils/libraryCatalog";
import {
  canSkipOstaConvert,
  hashTranscriptionSource,
  sourceHashPath,
} from "@/utils/ostaConvertCache";
import { scanRenderedMarkupLeakage } from "@/utils/renderMarkupLeakage";
export type { OstaBatchSummary, OstaIssueGroup } from "@/utils/ostaIssueReport";
export {
  canSkipOstaConvert,
  hashTranscriptionSource,
  sourceHashPath,
} from "@/utils/ostaConvertCache";

export const HSMS_NATIVE_BUNDLE_FORMAT = "hsms-native-bundle/2";

/** Defaults for CLI scripts. Input roots: see `utils/corpusRoots.ts`. */
export const DEFAULT_OSTA_PATHS = {
  input: "../OSTA/transcriptions",
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
  status: "ok" | "failed" | "skipped";
  compileError?: string;
  /** True when SHA-256 matched prior artifacts and conversion was skipped. */
  skippedUnchanged?: boolean;
  sourceHash?: string;
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
  /** Single corpus root (legacy). Prefer `inputDirs` for multi-corpus runs. */
  inputDir?: string;
  /** One or more corpus roots (flat or nested `*.txt` trees). */
  inputDirs?: string[];
  outputDir: string;
  /** Optional cap for smoke runs (e.g. --limit 5). */
  limit?: number;
  /** Re-convert even when the source SHA-256 matches prior outputs. */
  force?: boolean;
  onProgress?: (fileName: string, index: number, total: number) => void;
  /** Called when an unchanged source hash skips re-parse/export. */
  onSkip?: (fileName: string, index: number, total: number) => void;
}

export interface OstaBatchConvertOutput {
  fileResults: OstaFileResult[];
  inputDir: string;
  inputDirs: string[];
  outputDir: string;
}

/** A discovered `*.txt` transcription relative to one corpus root. */
export type DiscoveredTranscription = {
  rootDir: string;
  /** Absolute path used for reading. */
  absolutePath: string;
  /** Path relative to `rootDir` using `/` separators (e.g. `1500/auto1_01.txt`). */
  relativePath: string;
  /** Unique artifact / catalog id (nested dirs become `__` segments). */
  baseName: string;
  /** Catalog display name (relative path when nested). */
  sourceFileName: string;
};

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
  options?: { baseName?: string },
): Omit<OstaFileResult, "outputs"> & {
  html: string;
  nativeTs: string;
  issuesLog: string;
  parsedManuscript?: ParsedManuscript;
} {
  const baseName = options?.baseName ?? exportBaseName(sourceFileName);
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
      parsedManuscript: parsed,
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
  /** When provided, discovery walks nested directories (Celestina year folders, etc.). */
  isDirectory?(path: string): boolean;
}

/** Stable catalog / artifact id from a corpus-relative path. */
export function transcriptionExportBaseName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return exportBaseName(normalized.replace(/\//g, "__"));
}

/** Year hint from a leading `1500/`-style folder segment. */
export function yearHintFromRelativePath(relativePath: string): string {
  const match = relativePath.replace(/\\/g, "/").match(/^(\d{3,4})\//);
  return match ? match[1] : "";
}

function enrichCatalogEntryFromPath(
  entry: LibraryCatalogEntry,
  relativePath: string,
  rootDir: string,
): LibraryCatalogEntry {
  const yearHint = yearHintFromRelativePath(relativePath);
  const rootLabel = path.basename(rootDir).toLowerCase();
  const corpusHint =
    rootLabel.includes("celestina") || relativePath.toLowerCase().includes("celestina")
      ? "celestina rojas"
      : rootLabel === "transcriptions"
        ? "osta"
        : rootLabel.replace(/[^\w.\-]+/g, " ");

  if (yearHint && !entry.year) {
    entry.year = yearHint;
  }
  if (!entry.author && corpusHint.includes("celestina")) {
    entry.author = "Fernando de Rojas";
  }
  if (
    corpusHint.includes("celestina") &&
    entry.title &&
    !/celestina/i.test(entry.title) &&
    !/celestina/i.test(entry.baseName)
  ) {
    entry.title = `${entry.title} (Celestina)`;
  }

  entry.keywords = [entry.keywords, corpusHint, yearHint].filter(Boolean).join(" ").trim();
  return entry;
}

/**
 * Flat discovery (legacy). Prefer `discoverTranscriptionEntries` for nested corpora.
 */
export function discoverTranscriptionFiles(inputDir: string, readdir: (dir: string) => string[]): string[] {
  return readdir(inputDir)
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b));
}

export function discoverTranscriptionEntries(
  rootDir: string,
  fs: Pick<FileSystemWriter, "readdir" | "exists" | "isDirectory">,
): DiscoveredTranscription[] {
  if (!fs.exists(rootDir)) {
    return [];
  }

  const found: DiscoveredTranscription[] = [];

  const walk = (dir: string, relPrefix: string) => {
    let names: string[];
    try {
      names = fs.readdir(dir);
    } catch {
      return;
    }

    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      if (name === "." || name === ".." || name.startsWith(".")) {
        continue;
      }
      const absolutePath = path.join(dir, name);
      const relativePath = relPrefix ? `${relPrefix}/${name}` : name;
      const isDir = fs.isDirectory?.(absolutePath);

      if (isDir === true) {
        walk(absolutePath, relativePath);
        continue;
      }

      // Without isDirectory, only scan the root (legacy flat mock FS / OSTA layout).
      if (isDir === undefined && relPrefix) {
        continue;
      }

      if (!name.toLowerCase().endsWith(".txt")) {
        continue;
      }

      found.push({
        rootDir,
        absolutePath,
        relativePath: relativePath.replace(/\\/g, "/"),
        baseName: transcriptionExportBaseName(relativePath),
        sourceFileName: relativePath.replace(/\\/g, "/"),
      });
    }
  };

  walk(rootDir, "");
  return found.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function resolveBatchInputDirs(options: OstaBatchConvertOptions): string[] {
  const dirs = [
    ...(options.inputDirs ?? []),
    ...(options.inputDir ? [options.inputDir] : []),
  ].filter(Boolean);
  // Dedupe while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const dir of dirs) {
    const key = path.normalize(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(dir);
  }
  return unique;
}

export function runOstaBatchConvertWithFs(
  options: OstaBatchConvertOptions,
  fs: FileSystemWriter,
): OstaBatchConvertOutput {
  const inputDirs = resolveBatchInputDirs(options);
  if (inputDirs.length === 0) {
    throw new Error("No corpus input directories configured (inputDir / inputDirs).");
  }

  const missing = inputDirs.filter((dir) => !fs.exists(dir));
  if (missing.length === inputDirs.length) {
    throw new Error(`Corpus transcription directories not found: ${missing.join(", ")}`);
  }
  if (missing.length > 0) {
    console.warn(`Skipping missing corpus roots: ${missing.join(", ")}`);
  }

  const activeDirs = inputDirs.filter((dir) => fs.exists(dir));
  fs.mkdir(options.outputDir);

  const allEntries = activeDirs.flatMap((dir) => discoverTranscriptionEntries(dir, fs));
  // Prefer first occurrence when baseNames collide across roots.
  const deduped: DiscoveredTranscription[] = [];
  const seenBase = new Set<string>();
  for (const entry of allEntries) {
    if (seenBase.has(entry.baseName)) {
      console.warn(`Skipping duplicate baseName ${entry.baseName} (${entry.absolutePath})`);
      continue;
    }
    seenBase.add(entry.baseName);
    deduped.push(entry);
  }

  const targetFiles =
    typeof options.limit === "number" && options.limit > 0
      ? deduped.slice(0, options.limit)
      : deduped;

  const fileResults: OstaFileResult[] = [];
  const catalogEntries: LibraryCatalogEntry[] = [];

  const exportedAt = new Date().toISOString();

  for (let i = 0; i < targetFiles.length; i++) {
    const discovered = targetFiles[i];
    const { sourceFileName, baseName, absolutePath, relativePath, rootDir } = discovered;
    options.onProgress?.(sourceFileName, i + 1, targetFiles.length);

    const rawText = fs.readFile(absolutePath);
    const sourceHash = hashTranscriptionSource(rawText);
    const htmlPath = path.join(options.outputDir, `${baseName}.html`);
    const nativePath = path.join(options.outputDir, `${baseName}.native.ts`);
    const libraryPath = path.join(options.outputDir, `${baseName}.library.json`);
    const logPath = path.join(options.outputDir, `${baseName}.issues.log`);
    const hashPath = sourceHashPath(options.outputDir, baseName);

    let storedHash: string | null = null;
    if (fs.exists(hashPath)) {
      try {
        storedHash = fs.readFile(hashPath).trim();
      } catch {
        storedHash = null;
      }
    }

    if (
      canSkipOstaConvert({
        sourceHash,
        storedHash,
        hasHtml: fs.exists(htmlPath),
        hasNative: fs.exists(nativePath),
        hasLibrary: fs.exists(libraryPath),
        force: options.force,
      })
    ) {
      options.onSkip?.(sourceFileName, i + 1, targetFiles.length);

      let folioCount: number | undefined;
      let wordCount: number | undefined;
      let manuscriptTitle: string | undefined;
      try {
        const libraryRaw = fs.readFile(libraryPath);
        const libraryJson = JSON.parse(libraryRaw) as {
          folioCount?: number;
          wordCount?: number;
          title?: string;
        };
        folioCount = libraryJson.folioCount;
        wordCount = libraryJson.wordCount;
        manuscriptTitle = libraryJson.title;
      } catch {
        // Catalog entry still records ok/skipped with available metadata.
      }

      catalogEntries.push(
        enrichCatalogEntryFromPath(
          buildLibraryCatalogEntry({
            baseName,
            sourceFileName,
            status: "ok",
            exportedAt,
            transcriptionText: rawText,
            manuscriptTitle: manuscriptTitle ?? inferManuscriptTitle(rawText, sourceFileName),
            folioCount,
            wordCount,
          }),
          relativePath,
          rootDir,
        ),
      );

      fileResults.push({
        sourceFileName,
        baseName,
        status: "skipped",
        skippedUnchanged: true,
        sourceHash,
        folioCount,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        lintErrorCount: 0,
        lintWarningCount: 0,
        parseErrorCount: 0,
        parseWarningCount: 0,
        renderErrorCount: 0,
        renderWarningCount: 0,
        issues: [],
        outputs: {
          html: htmlPath,
          nativeTs: nativePath,
          issuesLog: logPath,
        },
      });
      continue;
    }

    const processed = processOstaTranscription(sourceFileName, rawText, { baseName });

    if (processed.status === "ok") {
      fs.writeFile(htmlPath, processed.html);
      fs.writeFile(nativePath, processed.nativeTs);
      const payload = buildLibraryEntryPayload({
        baseName: processed.baseName,
        sourceFileName: processed.sourceFileName,
        exportedAt,
        transcriptionText: rawText,
        manuscriptTitle: inferManuscriptTitle(rawText, processed.sourceFileName),
      });
      enrichCatalogEntryFromPath(payload, relativePath, rootDir);
      fs.writeFile(libraryPath, JSON.stringify(payload, null, 2));
      fs.writeFile(hashPath, `${sourceHash}\n`);

      if (processed.parsedManuscript) {
        const facets = buildPrecompiledFacets(processed.parsedManuscript, processed.baseName, {
          sourceText: rawText,
        });
        fs.writeFile(
          path.join(options.outputDir, `${processed.baseName}.facets.json`),
          JSON.stringify(facets),
        );
      }
    }
    fs.writeFile(logPath, processed.issuesLog);

    catalogEntries.push(
      enrichCatalogEntryFromPath(
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
        relativePath,
        rootDir,
      ),
    );

    fileResults.push({
      sourceFileName: processed.sourceFileName,
      baseName: processed.baseName,
      status: processed.status,
      compileError: processed.compileError,
      sourceHash,
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

  // Global TF-IDF, corpus stats, and codicological graph (uses sidecars; fills missing facets).
  try {
    runCorpusPrecomputeWithFs(
      {
        outputDir: options.outputDir,
        catalog,
        skipExistingFacets: true,
      },
      fs,
      path.join,
    );
  } catch (err) {
    console.warn(
      "Corpus precompute skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return {
    fileResults,
    inputDir: activeDirs[0] ?? "",
    inputDirs: activeDirs,
    outputDir: options.outputDir,
  };
}
