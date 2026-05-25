import type { ValidationError } from "../constants/manuscript";
import {
  implicitContinuationSlopKey,
  implicitContinuationSlopWarning,
  scanLineLexicalIssues,
  scanStructuralTokenIssues,
  unclosedEnvironmentErrors,
  type StructuralEnvFrame,
} from "./parseValidation";
import { tokenizeLineStructural } from "./structuralAssembly";

export interface LintReport {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  /** All issues in source order. */
  issues: ValidationError[];
  criticalErrors: ValidationError[];
  structuralWarnings: ValidationError[];
}

const RE_COLUMN_OPEN = /^\{CB(\d+)\./;
const RE_COLUMN_STRIP = /^\{CB\d+\.(?:\s|~|\+)*/;
const RE_BRACE_CLOSE_ONLY = /^\}\s*$/;
const RE_FOLIO_MARKER = /^\[\s*fol(?:io)?\.?\s*([^\]]+)\]/i;

const RE_STRAY_CATCHWORD = /^\{CW\.\s*([^}]+)\}/i;
const RE_STRAY_SIGNATURE = /^\{SG\.\s*([^}]+)\}/i;
const RE_HEADER_LEAK = /^\{HD[12]?\.\s*([^}]+)\}/i;
/** Asterisk inside brackets but not in valid `[*text]` editorial reconstruction form. */
const RE_MALFORMED_RECONSTRUCTION =
  /\[\s*[^*\]][^\]]*\*[^\]]*\]|\[\s+\*[^\]]*\]|\[\*\s*\]|\*[^\]]*\]/;
/** Multiple spaces after `{INn.}` collapse micro-tracking beside the cap box. */
const RE_INITIAL_MULTI_SPACE = /^\{IN\d+\.\}\s{2,}/;
/** Mechanical lacuna must be `[ ]` (interior space), not bare `[]`. */
const RE_BARE_EMPTY_BRACKETS = /\[\]/;
/** Stacked @ / prime notation before the lexer can bind a single cluster. */
const RE_MALFORMED_DIACRITIC = /@[@'~^]{2,}|[A-Za-z]{2,}@[A-Za-z]/;

function pushLintIssue(
  issues: ValidationError[],
  severity: ValidationError["severity"],
  code: string,
  message: string,
  lineIndex: number,
  snippet: string,
): void {
  issues.push({
    severity,
    message: `[${code}] ${message}`,
    lineIndex,
    rawSnippet: snippet.slice(0, 120),
  });
}

export function validationIssuesToLintReport(issues: ValidationError[]): LintReport {
  const criticalErrors: ValidationError[] = [];
  const structuralWarnings: ValidationError[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (issue.severity === "error") criticalErrors.push(issue);
    else if (issue.severity === "warning") structuralWarnings.push(issue);
  }

  return {
    isValid: criticalErrors.length === 0,
    errorCount: criticalErrors.length,
    warningCount: structuralWarnings.length,
    issues,
    criticalErrors,
    structuralWarnings,
  };
}

function runPaleographicContextChecks(
  line: string,
  lineIndex: number,
  linesSinceFolio: number,
  issues: ValidationError[],
): void {
  if (linesSinceFolio >= 0 && linesSinceFolio < 4) {
    if (RE_STRAY_CATCHWORD.test(line) || RE_STRAY_SIGNATURE.test(line)) {
      pushLintIssue(
        issues,
        "warning",
        "STRAY_PAGE_METADATA",
        "Catchword or signature appears near the top of the folio — verify it belongs at the page foot.",
        lineIndex,
        line,
      );
    }
  }

  if (line.startsWith("{HD") && RE_HEADER_LEAK.test(line)) {
    const payload = line.match(RE_HEADER_LEAK)?.[1] ?? "";
    if (payload.includes("{") || payload.includes("}")) {
      pushLintIssue(
        issues,
        "error",
        "MALFORMED_HEADER_BLOCK",
        "Running headers must contain flat text only, not nested structural braces.",
        lineIndex,
        line,
      );
    }
  }

  if (RE_INITIAL_MULTI_SPACE.test(line)) {
    pushLintIssue(
      issues,
      "warning",
      "INITIAL_GUTTER_LEAK",
      "Multiple spaces after `{INn.}` can disturb drop-cap gutter alignment in facsimile layout.",
      lineIndex,
      line,
    );
  }

  if (RE_MALFORMED_RECONSTRUCTION.test(line) && !/\[\s*\*[^\]]+\]/.test(line)) {
    pushLintIssue(
      issues,
      "warning",
      "MALFORMED_RECONSTRUCTION",
      "Bracket/asterisk sequence does not match editorial reconstruction form `[*text]`.",
      lineIndex,
      line,
    );
  }

  if (RE_BARE_EMPTY_BRACKETS.test(line)) {
    pushLintIssue(
      issues,
      "warning",
      "EMPTY_BRACKET_TOKEN",
      "Empty brackets `[]` should be a mechanical lacuna `[ ]` (interior space) per HSMS convention.",
      lineIndex,
      line,
    );
  }
}

/**
 * Fast structural lint of raw HSMS text — no full AST / concordance build.
 * Use before facsimile render, in the editor, or from `npm run lint:hsms`.
 */
export function lintHsmsTranscription(rawText: string): LintReport {
  if (!rawText.trim()) {
    return validationIssuesToLintReport([
      {
        severity: "error",
        message: "[EMPTY_FILE] Document contains no transcription content.",
        lineIndex: 0,
        rawSnippet: "",
      },
    ]);
  }

  const lines = rawText.split(/\r?\n/);
  const issues: ValidationError[] = [];
  let envStack: StructuralEnvFrame[] = [];
  let inColumnBlock = false;
  let columnLineIndex = -1;
  let columnHadEnvOpen = false;
  let pendingVernacularClose = false;
  let linesSinceFolio = -1;
  const slopWarned = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (RE_FOLIO_MARKER.test(line)) {
      if (envStack.length > 0) {
        const activeEnv = envStack[envStack.length - 1];
        pushLintIssue(
          issues,
          "error",
          "FOLIO_LEAK",
          `Folio boundary breaks inside open environment {${activeEnv.code}.} (opened on line ${activeEnv.startLine + 1}).`,
          i,
          line,
        );
      }
      envStack = [];
      inColumnBlock = false;
      columnLineIndex = -1;
      columnHadEnvOpen = false;
      pendingVernacularClose = false;
      linesSinceFolio = 0;
      continue;
    }

    if (linesSinceFolio >= 0) linesSinceFolio++;

    let explicitContinuation = false;
    if (line.endsWith("+")) {
      explicitContinuation = true;
      line = line.substring(0, line.length - 1).trim();
      if (!line) continue;
    }

    runPaleographicContextChecks(line, i, linesSinceFolio, issues);

    if (RE_MALFORMED_DIACRITIC.test(line)) {
      pushLintIssue(
        issues,
        "warning",
        "MALFORMED_DIACRITIC",
        "Nested or stacked diacritic markers detected — verify @, ', and ~ notation.",
        i,
        line,
      );
    }

    if (RE_COLUMN_OPEN.test(line)) {
      inColumnBlock = true;
      columnLineIndex = -1;
      columnHadEnvOpen = false;
      pendingVernacularClose = false;
      line = line.replace(RE_COLUMN_STRIP, "").trim();
      if (!line) continue;
    }

    if (RE_BRACE_CLOSE_ONLY.test(line)) {
      if (envStack.length > 0) {
        envStack.pop();
        continue;
      }
      if (inColumnBlock) {
        inColumnBlock = false;
        continue;
      }
      continue;
    }

    if (inColumnBlock) columnLineIndex++;

    issues.push(...scanLineLexicalIssues(line, i, true));

    const stackBeforeLine = envStack;
    try {
      const structuralTokens = tokenizeLineStructural(line);
      if (inColumnBlock && structuralTokens.some((t) => t.type === "env_open")) {
        columnHadEnvOpen = true;
      }
      const scanned = scanStructuralTokenIssues(structuralTokens, line, i, envStack, {
        inColumnBlock,
        columnContext: inColumnBlock
          ? { lineIndex: columnLineIndex, hadEnvOpen: columnHadEnvOpen }
          : undefined,
        allowVernacularClose: pendingVernacularClose && /\}\s*$/.test(line),
      });
      issues.push(...scanned.errors);
      envStack = scanned.stackAfter;
      if (scanned.columnBlockClosed) {
        inColumnBlock = false;
        columnLineIndex = -1;
        columnHadEnvOpen = false;
      }

      if (
        !explicitContinuation &&
        scanned.stackAfter.length > 0 &&
        !line.endsWith("}")
      ) {
        const open = scanned.stackAfter[scanned.stackAfter.length - 1];
        const slopKey = implicitContinuationSlopKey(open);
        if (!slopWarned.has(slopKey)) {
          slopWarned.add(slopKey);
          issues.push(implicitContinuationSlopWarning(i, line, open));
        }
      }
    } catch (err) {
      pushLintIssue(
        issues,
        "error",
        "COMPILER_CRASH",
        `Structural tokenizer failed: ${err instanceof Error ? err.message : String(err)}`,
        i,
        line,
      );
      continue;
    }

    const latClosedWithVernacular =
      stackBeforeLine.some((f) => f.code === "LAT") &&
      envStack.length < stackBeforeLine.length &&
      /\}\s+\S/.test(line);
    if (latClosedWithVernacular) {
      pendingVernacularClose = true;
    } else if (pendingVernacularClose && /\}\s*$/.test(line)) {
      pendingVernacularClose = false;
    }

  }

  issues.push(...unclosedEnvironmentErrors(envStack));
  return validationIssuesToLintReport(issues);
}
