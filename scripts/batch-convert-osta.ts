#!/usr/bin/env node
/**
 * Batch-convert HSMS / plain-text transcriptions to browser HTML, native TypeScript
 * bundles, and per-file issue logs under out/. Runs issue aggregation when conversion finishes.
 *
 * Default corpus roots (sibling folders under the parent of this repo):
 *   - OSTA/transcriptions
 *   - estilometria-celestina  (nested year folders; discovered recursively)
 *
 * Each <baseName>.issues.log contains [LINT], [PARSE], and [RENDER] sections.
 * Render scan skips mechanical lacuna `[ ]` checks (skipLacunaChecks) for corpus speed;
 * lacuna syntax may still appear under [LINT]. See docs/HSMS-EDITOR.md §9.1.
 *
 * Usage:
 *   npm run batch:osta
 *   npx tsx scripts/batch-convert-osta.ts --limit=10   # if npm swallows --limit
 *   npm run batch:osta -- --out ./out --in "C:\\path\\to\\OSTA\\transcriptions"
 *   npm run batch:osta -- --in "C:\\jason\\dev\\dev\\OSTA\\transcriptions" --in "C:\\jason\\dev\\dev\\estilometria-celestina"
 *   npm run batch:osta -- --no-report   # skip aggregate report step
 *
 * Environment:
 *   LIBRARY_CORPUS_PATHS — semicolon/comma list of corpus roots (overrides defaults)
 *   OSTA_TRANSCRIPTIONS_PATH — legacy single-root override (Celestina sibling still appended)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCorpusRoots } from "../utils/corpusRoots";
import { DEFAULT_OSTA_PATHS, runOstaBatchConvertWithFs } from "../utils/ostaBatchConverter";
import { runOstaIssueReportWithFs } from "../utils/ostaIssueReport";
import { hasCliFlag, readAllCliArgs, readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const skipReport = hasCliFlag("--no-report");
const force = hasCliFlag("--force");

const inputDirs = resolveCorpusRoots({
  projectRoot,
  cliIns: readAllCliArgs("--in"),
  exists: (dir) => fs.existsSync(dir),
});

const outputDir = path.resolve(projectRoot, readCliArg("--out") ?? DEFAULT_OSTA_PATHS.output);
const limitRaw = readCliArg("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

const nodeFs = {
  mkdir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  },
  writeFile(filePath: string, contents: string) {
    fs.writeFileSync(filePath, contents, "utf8");
  },
  readFile(filePath: string) {
    return fs.readFileSync(filePath, "utf8");
  },
  readdir(dir: string) {
    return fs.readdirSync(dir);
  },
  exists(filePath: string) {
    return fs.existsSync(filePath);
  },
  isDirectory(filePath: string) {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  },
};

console.log("Library / OSTA batch convert");
for (const dir of inputDirs) {
  console.log(`  Input:  ${dir}`);
}
if (inputDirs.length === 0) {
  console.error("No corpus roots found. Pass --in <dir> or clone sibling OSTA / estilometria-celestina.");
  process.exit(1);
}
console.log(`  Output: ${outputDir}`);
if (limit) {
  console.log(`  Limit:  ${limit} file(s)`);
}
if (force) {
  console.log("  Force:  re-convert (ignore source hash cache)");
}
if (skipReport) {
  console.log("  Report: skipped (--no-report)");
}
console.log("");

const started = Date.now();

const convertResult = runOstaBatchConvertWithFs(
  {
    inputDirs,
    outputDir,
    limit,
    force,
    onProgress(fileName, index, total) {
      if (index % 25 === 0 || index === 1 || index === total) {
        console.log(`  [${index}/${total}] ${fileName}`);
      }
    },
  },
  nodeFs,
);

const convertSec = ((Date.now() - started) / 1000).toFixed(1);
const failedCompile = convertResult.fileResults.filter((f) => f.status === "failed").length;
const skipped = convertResult.fileResults.filter((f) => f.status === "skipped").length;

console.log("");
console.log(`Conversion done in ${convertSec}s`);
console.log(`  Transcriptions: ${convertResult.fileResults.length}`);
console.log(`  Succeeded:      ${convertResult.fileResults.length - failedCompile - skipped}`);
console.log(`  Skipped:        ${skipped}`);
console.log(`  Failed:         ${failedCompile}`);
console.log(`  Library catalog: ${path.join(outputDir, "library-catalog.json")}`);
console.log("  (Run npm run sync:library before web to serve entries from public/)");

let exitCode = failedCompile > 0 ? 1 : 0;

if (!skipReport) {
  console.log("");
  console.log("Aggregating issue logs…");
  const reportStarted = Date.now();
  const report = runOstaIssueReportWithFs(
    { outputDir, inputDir: convertResult.inputDir },
    nodeFs,
  );
  const reportSec = ((Date.now() - reportStarted) / 1000).toFixed(1);
  const { stats } = report;

  console.log(`Aggregation done in ${reportSec}s`);
  console.log(`  Files with validation issues: ${stats.filesWithIssues}`);
  console.log(`  Validation errors:   ${stats.totalValidationErrors}`);
  console.log(`  Validation warnings: ${stats.totalValidationWarnings}`);
  console.log("");
  console.log(`  Summary: ${report.issuesTextPath}`);
  console.log(`  JSON:    ${report.issuesJsonPath}`);
}

process.exit(exitCode);
