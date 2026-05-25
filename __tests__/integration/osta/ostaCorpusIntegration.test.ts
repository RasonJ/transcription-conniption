import fs from "fs";
import path from "path";
import type { ParsedManuscript } from "../../../constants/manuscript";
import { compileManuscriptTree } from "../../../utils/compiler";
import { PAREN_CLOSE_SENTINEL, PAREN_OPEN_SENTINEL } from "../../../utils/hsmsLexer";
import { exportToTEIXML } from "../../../utils/teiExport";
import { requireOstaIntegration, resolveOstaTranscriptionsPath } from "./ostaPaths";

requireOstaIntegration();

const OSTA_TRANSCRIPTIONS_PATH = resolveOstaTranscriptionsPath();
const REPORTS_DIR = path.resolve(__dirname, "../../../reports");
const WRITE_VALIDATION_REPORTS = process.env.OSTA_WRITE_REPORTS === "1";

if (!fs.existsSync(OSTA_TRANSCRIPTIONS_PATH)) {
  throw new Error(`OSTA transcriptions directory not found: ${OSTA_TRANSCRIPTIONS_PATH}`);
}

const targetFiles = fs
  .readdirSync(OSTA_TRANSCRIPTIONS_PATH)
  .filter((file) => file.endsWith(".txt"))
  .sort();

function assertLexicalInvariants(parsed: ParsedManuscript): void {
  for (const folio of parsed.folios) {
    expect(folio.id).not.toMatch(/[\[\]]/);

    for (const block of folio.blocks) {
      for (const token of block.tokens) {
        expect(token.value).not.toContain(PAREN_OPEN_SENTINEL);
        expect(token.value).not.toContain(PAREN_CLOSE_SENTINEL);
      }
    }
  }
}

function writeValidationReport(fileName: string, parsed: ParsedManuscript): void {
  const errors = parsed.validationErrors ?? [];
  if (errors.length === 0) {
    return;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const report = errors
    .map(
      (e) =>
        `[LINE ${e.lineIndex + 1}] (${e.severity.toUpperCase()}): ${e.message}\nSnippet: ${e.rawSnippet}`,
    )
    .join("\n\n");
  fs.writeFileSync(path.join(REPORTS_DIR, `${fileName}.errors.log`), report, "utf8");
}

function compileAndAssert(fileName: string): void {
  const filePath = path.join(OSTA_TRANSCRIPTIONS_PATH, fileName);
  const rawTranscriptionText = fs.readFileSync(filePath, "utf8");

  let parsedTree: ParsedManuscript;
  expect(() => {
    parsedTree = compileManuscriptTree(rawTranscriptionText);
  }).not.toThrow();

  expect(parsedTree!).toBeDefined();
  expect(parsedTree!.folios).toBeInstanceOf(Array);
  expect(parsedTree!.stats.totalWords).toBeGreaterThan(0);

  if (parsedTree!.folios.length > 0) {
    assertLexicalInvariants(parsedTree!);
  }

  let teiXmlOutput: string;
  expect(() => {
    teiXmlOutput = exportToTEIXML(parsedTree!);
  }).not.toThrow();

  expect(teiXmlOutput!).toContain("<TEI");
  expect(teiXmlOutput!).toContain("</TEI>");

  if (WRITE_VALIDATION_REPORTS) {
    writeValidationReport(fileName, parsedTree!);
  }
}

describe("Parallel OSTA Transcription Corpus Integration Tests", () => {
  jest.setTimeout(120_000);

  it("should verify that files are discovered in the target directory", () => {
    expect(targetFiles.length).toBeGreaterThan(0);
  });

  it.each(targetFiles)(
    "should successfully compile %s without syntax or stack exceptions",
    (fileName) => {
      compileAndAssert(fileName);
    },
  );

  if (WRITE_VALIDATION_REPORTS) {
    it.each(targetFiles)("should flag and output transcriber warning reports for %s", (fileName) => {
      const filePath = path.join(OSTA_TRANSCRIPTIONS_PATH, fileName);
      const rawText = fs.readFileSync(filePath, "utf8");
      writeValidationReport(fileName, compileManuscriptTree(rawText));
    });
  }
});
