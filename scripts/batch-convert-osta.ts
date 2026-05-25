#!/usr/bin/env node
/**
 * Batch-convert OSTA HSMS transcriptions to browser HTML, native TypeScript bundles,
 * and per-file issue logs under out/. Runs issue aggregation when conversion finishes.
 *
 * Each <baseName>.issues.log contains [LINT], [PARSE], and [RENDER] sections.
 * Render scan skips mechanical lacuna `[ ]` checks (skipLacunaChecks) for corpus speed;
 * lacuna syntax may still appear under [LINT]. See docs/HSMS-EDITOR.md §9.1.
 *
 * Usage:
 *   npm run batch:osta
 *   npx tsx scripts/batch-convert-osta.ts --limit=10   # if npm swallows --limit
 *   npm run batch:osta -- --out ./out --in "C:\\path\\to\\OSTA\\transcriptions"
 *   npm run batch:osta -- --no-report   # skip aggregate report step
 *
 * Environment:
 *   OSTA_TRANSCRIPTIONS_PATH — override default input directory
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OSTA_PATHS, runOstaBatchConvertWithFs } from "../utils/ostaBatchConverter";
import { runOstaIssueReportWithFs } from "../utils/ostaIssueReport";
import { readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const skipReport = process.argv.includes("--no-report");

const inputDir =
  readCliArg("--in") ??
  process.env.OSTA_TRANSCRIPTIONS_PATH ??
  path.resolve(projectRoot, "..", "OSTA", "transcriptions");

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
};

console.log("OSTA batch convert");
console.log(`  Input:  ${inputDir}`);
console.log(`  Output: ${outputDir}`);
if (limit) {
  console.log(`  Limit:  ${limit} file(s)`);
}
if (skipReport) {
  console.log("  Report: skipped (--no-report)");
}
console.log("");

const started = Date.now();

const convertResult = runOstaBatchConvertWithFs(
  {
    inputDir,
    outputDir,
    limit,
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

console.log("");
console.log(`Conversion done in ${convertSec}s`);
console.log(`  Transcriptions: ${convertResult.fileResults.length}`);
console.log(`  Succeeded:      ${convertResult.fileResults.length - failedCompile}`);
console.log(`  Failed:         ${failedCompile}`);
console.log(`  Library catalog: ${path.join(outputDir, "library-catalog.json")}`);
console.log("  (Run npm run sync:library before web to serve entries from public/)");

let exitCode = failedCompile > 0 ? 1 : 0;

if (!skipReport) {
  console.log("");
  console.log("Aggregating issue logs…");
  const reportStarted = Date.now();
  const report = runOstaIssueReportWithFs({ outputDir, inputDir }, nodeFs);
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
