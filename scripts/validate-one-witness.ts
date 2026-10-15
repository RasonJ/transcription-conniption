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

  console.log({
    file: baseName,
    status: result.status,
    issueCount: issues.length,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    extraClose: extra.length,
    sample: extra.slice(0, 5).map((e) => ({
      line: e.lineIndex + 1,
      snippet: e.rawSnippet?.trim(),
    })),
  });

  const outLog = path.resolve(
    __dirname,
    "../out",
    `${path.basename(filePath, path.extname(filePath))}.issues.log`,
  );
  fs.mkdirSync(path.dirname(outLog), { recursive: true });
  fs.writeFileSync(outLog, result.issuesLog, "utf8");
  console.log(`Wrote issue log: ${outLog}`);
}

main();
