import fs from "node:fs";
import path from "node:path";
import { lintHsmsTranscription, type LintReport } from "../utils/hsmsLinter";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

const SOURCE_EXT = /\.(txt|hsms)$/i;

function printUsage(exitCode = 1): void {
  console.log(`${BOLD}HSMS structural linter${RESET}`);
  console.log(`Usage: npm run lint:hsms -- <file-or-dir> [--recursive] [--json] [--verbose]`);
  console.log(`       npm run lint:project -- [dir]   (default: transcriptions, recursive)`);
  process.exit(exitCode);
}

function collectFiles(targetPath: string, recursive: boolean): string[] {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (!SOURCE_EXT.test(targetPath)) {
      console.log(
        `${BOLD}${RED}Error:${RESET} Expected a .txt or .hsms transcription file: ${targetPath}`,
      );
      process.exit(1);
    }
    return [targetPath];
  }

  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (recursive) walk(full);
        continue;
      }
      if (SOURCE_EXT.test(name)) out.push(full);
    }
  };
  walk(targetPath);
  return out.sort();
}

function printReport(report: LintReport, baseName: string, verbose: boolean): boolean {
  if (report.issues.length === 0) {
    if (verbose) {
      console.log(`${GREEN}✔ ${baseName}${RESET}`);
    }
    return true;
  }

  console.log(`\n${BOLD}${CYAN}Document:${RESET} ${baseName}`);
  console.log("─".repeat(70));

  for (const err of report.criticalErrors) {
    console.log(
      `  ${RED}${BOLD}[CRITICAL]${RESET} Line ${err.lineIndex + 1}: ${err.message}`,
    );
    if (err.rawSnippet) {
      console.log(`    ${DIM}Snippet: "${err.rawSnippet.trim()}"${RESET}`);
    }
  }

  for (const warn of report.structuralWarnings) {
    console.log(
      `  ${YELLOW}${BOLD}[WARNING]${RESET} Line ${warn.lineIndex + 1}: ${warn.message}`,
    );
    if (warn.rawSnippet) {
      console.log(`    ${DIM}Snippet: "${warn.rawSnippet.trim()}"${RESET}`);
    }
  }

  console.log("─".repeat(70));
  const color = report.isValid ? GREEN : RED;
  console.log(
    `  ${BOLD}${color}${report.errorCount} error(s), ${report.warningCount} warning(s).${RESET}`,
  );
  return report.isValid;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function printTabularSummary(
  rows: Array<{ file: string; errors: number; warnings: number; ok: boolean }>,
): void {
  console.log("\n" + `${BOLD}${CYAN}File summary${RESET}`);
  console.log(`${DIM}${pad("FILE", 42)}  ${pad("ERR", 5)}  ${pad("WARN", 5)}  STATUS${RESET}`);
  console.log("─".repeat(70));
  for (const row of rows) {
    const badge = row.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    const errColor = row.errors > 0 ? RED : DIM;
    const warnColor = row.warnings > 0 ? YELLOW : DIM;
    console.log(
      `${pad(row.file, 42)}  ${errColor}${pad(String(row.errors), 5)}${RESET}  ${warnColor}${pad(String(row.warnings), 5)}${RESET}  ${badge}`,
    );
  }
}

function auditFile(
  filePath: string,
  options: { print: boolean; verbose: boolean },
): { isValid: boolean; report: LintReport } {
  const content = fs.readFileSync(filePath, "utf8");
  const report = lintHsmsTranscription(content);
  const isValid = report.isValid;
  if (options.print) {
    printReport(report, path.basename(filePath), options.verbose);
  }
  return { isValid, report };
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    printUsage(0);
    return;
  }
  const recursive =
    args.includes("--recursive") || process.env.npm_lifecycle_event === "lint:project";
  const isJson = args.includes("--json");
  const verbose = args.includes("--verbose");
  const positional = args.filter((a) => !a.startsWith("--"));

  const defaultDir = path.resolve(__dirname, "../../OSTA/transcriptions");
  const target =
    positional.length > 0
      ? path.resolve(process.cwd(), positional[0]!)
      : fs.existsSync(defaultDir)
        ? defaultDir
        : null;

  if (!target) {
    printUsage();
    return;
  }

  if (!fs.existsSync(target)) {
    console.log(`${BOLD}${RED}Error:${RESET} Path not found: ${target}`);
    process.exit(1);
  }

  const files = collectFiles(target, recursive);
  if (files.length === 0) {
    console.log(`${YELLOW}No .txt or .hsms files under ${target}${RESET}\n`);
    process.exit(1);
  }

  if (!isJson && files.length > 1) {
    console.log(`${BOLD}${CYAN}HSMS verification — ${files.length} file(s)${RESET}`);
  }

  let failed = 0;
  const jsonResults: Record<string, LintReport> = {};
  const summaryRows: Array<{ file: string; errors: number; warnings: number; ok: boolean }> = [];

  for (const file of files) {
    const printDetail = !isJson && (verbose || files.length === 1);
    const { isValid, report } = auditFile(file, {
      print: printDetail,
      verbose: verbose || files.length === 1,
    });
    const base = path.basename(file);
    jsonResults[base] = report;
    summaryRows.push({
      file: base,
      errors: report.errorCount,
      warnings: report.warningCount,
      ok: isValid,
    });
    if (!isValid) {
      failed++;
      // Multi-file quiet mode: still expand failing documents.
      if (!isJson && !printDetail) {
        printReport(report, base, true);
      }
    }
  }

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          files: files.length,
          failed,
          results: jsonResults,
        },
        null,
        2,
      ),
    );
    process.exit(failed === 0 ? 0 : 2);
  }

  if (files.length > 1) {
    printTabularSummary(summaryRows);
    console.log("\n" + "═".repeat(70));
    if (failed === 0) {
      console.log(
        `${BOLD}${GREEN}✔ Verification complete: all ${files.length} manuscripts passed (zero critical errors).${RESET}\n`,
      );
      process.exit(0);
    }
    console.log(
      `${BOLD}${RED}✖ Verification failed: ${failed} of ${files.length} file(s) have critical defects.${RESET}\n`,
    );
    process.exit(2);
  }

  process.exit(failed === 0 ? 0 : 2);
}

main();
