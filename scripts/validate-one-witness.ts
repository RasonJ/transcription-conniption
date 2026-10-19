import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processOstaTranscription } from "../utils/ostaBatchConverter";
import { readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main(): void {
  const inputArg = readCliArg("--in") ?? process.argv[2];
  const filePath = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : path.resolve(__dirname, "../../OSTA/transcriptions/EEE-GUROP-3.txt");

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const baseName = path.basename(filePath);
  const result = processOstaTranscription(baseName, raw);
  const issues = result.issues ?? [];
  const extra = issues.filter((e) => /extra structural closing/i.test(e.message));

  console.log("═".repeat(60));
  console.log(` Witness Diagnostic: ${baseName}`);
  console.log("═".repeat(60));
  console.log(` Status:        ${result.status.toUpperCase()}`);
  console.log(` Issues Total:  ${issues.length}`);
  console.log(` Errors:        ${result.errorCount}`);
  console.log(` Warnings:      ${result.warningCount}`);
  console.log(` Extra Closes:  ${extra.length}`);
  console.log("─".repeat(60));

  if (extra.length > 0) {
    console.log(" Sample Unmatched Structural Closures:");
    extra.slice(0, 5).forEach((e, idx) => {
      console.log(`   ${idx + 1}. Line ${e.lineIndex + 1}: "${e.rawSnippet?.trim() ?? ""}"`);
    });
    console.log("─".repeat(60));
  }

  const outLog = path.resolve(
    __dirname,
    "../out",
    `${path.basename(filePath, path.extname(filePath))}.issues.log`,
  );
  fs.mkdirSync(path.dirname(outLog), { recursive: true });
  fs.writeFileSync(outLog, result.issuesLog, "utf8");
  console.log(` Wrote issue log: ${outLog}\n`);
}

main();
