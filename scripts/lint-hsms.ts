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

function printUsage(): void {
  console.log(`${BOLD}HSMS structural linter${RESET}`);
  console.log(`Usage: npm run lint:hsms -- <file-or-dir> [--recursive]`);
  console.log(`       npm run lint:project -- [dir]   (default: transcriptions, recursive)`);
  process.exit(1);
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
      console.log(`\n${BOLD}${CYAN}${baseName}${RESET}`);
      console.log(`${GREEN}✔ No structural or lexical issues.${RESET}`);
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

function auditFile(filePath: string, verbose: boolean): boolean {
  const content = fs.readFileSync(filePath, "utf8");
  const report = lintHsmsTranscription(content);
  return printReport(report, path.basename(filePath), verbose);
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const recursive = args.includes("--recursive") || process.env.npm_lifecycle_event === "lint:project";
  const positional = args.filter((a) => a !== "--recursive");

  const defaultDir = path.resolve(__dirname, "../../OSTA/transcriptions");
  const target =
    positional.length > 0
      ? path.resolve(process.cwd(), positional[0]!)
      : fs.existsSync(defaultDir)
        ? defaultDir
        : null;

  if (!target) {
    printUsage();
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

  if (files.length > 1) {
    console.log(`${BOLD}${CYAN}HSMS verification — ${files.length} file(s)${RESET}`);
  }

  let failed = 0;
  for (const file of files) {
    if (!auditFile(file, files.length === 1)) failed++;
  }

  if (files.length > 1) {
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
