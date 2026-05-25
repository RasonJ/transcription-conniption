#!/usr/bin/env node
/**
 * Aggregate per-witness `*.issues.log` into issues-summary.txt and issues.json.
 *
 * Usage:
 *   npm run report:osta
 *   npm run report:osta -- --out ./out
 *   npm run report:osta -- --out ./out --in "C:\\path\\to\\OSTA\\transcriptions"
 *
 * Typically runs automatically after `npm run batch:osta`, but safe to re-run
 * any time issue logs change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OSTA_PATHS } from "../utils/ostaBatchConverter";
import { runOstaIssueReportWithFs } from "../utils/ostaIssueReport";
import { readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const outputDir = path.resolve(projectRoot, readCliArg("--out") ?? DEFAULT_OSTA_PATHS.output);
const inputDir =
  readCliArg("--in") ??
  process.env.OSTA_TRANSCRIPTIONS_PATH ??
  path.resolve(projectRoot, "..", "OSTA", "transcriptions");

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

console.log("OSTA issue log aggregation");
console.log(`  Logs:   ${outputDir}`);
console.log(`  Input:  ${inputDir}`);
console.log("");

const started = Date.now();

const result = runOstaIssueReportWithFs(
  { outputDir, inputDir },
  nodeFs,
);

const { stats } = result;
const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

console.log(`Done in ${elapsedSec}s`);
console.log(`  Issue logs processed: ${stats.totalFiles}`);
console.log(`  Compiled successfully:  ${stats.succeeded}`);
console.log(`  Compile failures:     ${stats.failed}`);
console.log(`  Files with issues:    ${stats.filesWithIssues}`);
console.log(`  Validation errors:    ${stats.totalValidationErrors}`);
console.log(`  Validation warnings:  ${stats.totalValidationWarnings}`);
console.log("");
console.log(`  Summary: ${result.issuesTextPath}`);
console.log(`  JSON:    ${result.issuesJsonPath}`);

process.exit(stats.failed > 0 ? 1 : 0);
