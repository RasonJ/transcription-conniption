import fs from "node:fs";
import path from "node:path";
import { processOstaTranscription } from "../utils/ostaBatchConverter";

const filePath =
  process.argv[2] ??
  path.resolve(__dirname, "../../OSTA/transcriptions/EEE-GUROP-3.txt");

const raw = fs.readFileSync(filePath, "utf8");
const result = processOstaTranscription(path.basename(filePath), raw);
const issues = result.issues ?? [];
const extra = issues.filter((e) => /extra structural closing/i.test(e.message));
console.log({
  file: path.basename(filePath),
  status: result.status,
  issueCount: issues.length,
  errorCount: result.errorCount,
  warningCount: result.warningCount,
  extraClose: extra.length,
  sample: extra.slice(0, 5).map((e) => ({ line: e.lineIndex + 1, snippet: e.rawSnippet })),
});

const outLog = path.resolve(__dirname, "../out", `${path.basename(filePath, ".txt")}.issues.log`);
fs.mkdirSync(path.dirname(outLog), { recursive: true });
fs.writeFileSync(outLog, result.issuesLog, "utf8");
console.log("Wrote", outLog);
