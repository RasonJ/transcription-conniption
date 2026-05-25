import fs from "node:fs";
import path from "node:path";
import { tokenizeLineStructural } from "../utils/structuralAssembly";
import { scanStructuralTokenIssues, type StructuralEnvFrame } from "../utils/parseValidation";

const RE_COLUMN_OPEN = /^\{CB(\d+)\./;
const RE_COLUMN_STRIP = /^\{CB\d+\.(?:\s|~|\+)*/;
const RE_BRACE_CLOSE_ONLY = /^\}\s*$/;
const RE_FOLIO_MARKER = /^\[fol\./;

const filePath =
  process.argv[2] ??
  path.resolve(__dirname, "../../OSTA/transcriptions/TEXT.ABC.txt");
const targetLine = Number.parseInt(process.argv[3] ?? "7366", 10) - 1;

const raw = fs.readFileSync(filePath, "utf8");
const lines = raw.split(/\r?\n/);

let envStack: StructuralEnvFrame[] = [];
let inColumnBlock = false;
let lastCbLine = -1;
let lastColCloseLine = -1;

for (let i = 0; i <= targetLine; i++) {
  let line = lines[i]?.trim() ?? "";
  if (!line) continue;

  if (RE_FOLIO_MARKER.test(line)) {
    envStack = [];
    inColumnBlock = false;
    continue;
  }

  if (RE_COLUMN_OPEN.test(line)) {
    inColumnBlock = true;
    lastCbLine = i + 1;
    line = line.replace(RE_COLUMN_STRIP, "").trim();
    if (!line) continue;
  }

  if (RE_BRACE_CLOSE_ONLY.test(line)) {
    if (envStack.length > 0) {
      envStack.pop();
    } else if (inColumnBlock) {
      inColumnBlock = false;
      lastColCloseLine = i + 1;
    }
    continue;
  }

  if (line.endsWith("+")) {
    line = line.slice(0, -1).trim();
    if (!line) continue;
  }

  const structuralTokens = tokenizeLineStructural(line);
  const scanned = scanStructuralTokenIssues(structuralTokens, line, i, envStack, inColumnBlock);
  envStack = scanned.stackAfter;
  if (scanned.columnBlockClosed) {
    inColumnBlock = false;
    lastColCloseLine = i + 1;
  }

  if (i === targetLine) {
    const extra = scanned.errors.filter((e) => /extra structural/i.test(e.message));
    console.log({
      line: targetLine + 1,
      snippet: line.slice(0, 100),
      inColumnBlock,
      stack: envStack.map((f) => f.code),
      lastCbLine,
      lastColCloseLine,
      extraCount: extra.length,
      extra: extra[0]?.message,
    });
  }
}
