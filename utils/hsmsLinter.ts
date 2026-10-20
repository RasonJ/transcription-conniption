import type { ValidationError } from "../constants/manuscript";
import type { HsmsLinterIssueCode } from "./hsmsAgentRuleCatalog";
import {
  implicitContinuationSlopKey,
  implicitContinuationSlopWarning,
  scanLineLexicalIssues,
  scanStructuralTokenIssues,
  unclosedEnvironmentErrors,
  type StructuralEnvFrame,
} from "./parseValidation";
import {
  prooferIncidentsAsValidationErrors,
  scanProoferDocumentIncidents,
  scanProoferLineIncidents,
} from "./prooferIncidents";
import { tokenizeLineStructural } from "./structuralAssembly";

/** Max chars evaluated by paleographic / diacritic regex windows (bounds backtracking cost). */
const LINT_REGEX_WINDOW = 240;

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
/** Empty closed column tag `{CB1.}` — common vision-model mistake. */
const RE_EMPTY_COLUMN_TAG = /^\{CB\d+\.\}\s*$/;
const RE_BRACE_CLOSE_ONLY = /^\}\s*$/;
const RE_FOLIO_MARKER = /^\[\s*fol(?:io)?\.?\s*([^\]]+)\]/i;
/** Metadata / page chrome allowed outside column envelopes. */
const RE_OUTSIDE_COLUMN_OK = /^\{(?:RMK|HD\d?|CW|SG|ILL|DIAG)\b/i;

const RE_STRAY_CATCHWORD = /^\{CW\.\s*([^}]+)\}/i;
const RE_STRAY_SIGNATURE = /^\{SG\.\s*([^}]+)\}/i;
const RE_HEADER_LEAK = /^\{HD[12]?\.\s*([^}]+)\}/i;
/** Asterisk inside brackets but not in valid `[*text]` editorial reconstruction form. */
const RE_MALFORMED_RECONSTRUCTION =
  /\[\s*[^*\]][^\]]*\*[^\]]*\]|\[\s+\*[^\]]*\]|\[\*\s*\]|\*[^\]]*\]/;
/** Valid editorial reconstruction — exclude from MALFORMED_RECONSTRUCTION. */
const RE_VALID_RECONSTRUCTION = /\[\s*\*[^\]]+\]/;
/** Multiple spaces after `{INn.}` collapse micro-tracking beside the cap box. */
const RE_INITIAL_MULTI_SPACE = /^\{IN\d+\.\}\s{2,}/;
/** Mechanical lacuna must be `[ ]` (interior space), not bare `[]`. */
const RE_BARE_EMPTY_BRACKETS = /\[\]/;
/** Stacked @ / prime notation before the lexer can bind a single cluster. */
const RE_MALFORMED_DIACRITIC = /@[@'~^]{2,}|[A-Za-z]{2,}@[A-Za-z]/;
const RE_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const RE_TRAILING_BRACE = /\}\s*$/;
const RE_LAT_VERNACULAR_CLOSE = /\}\s+\S/;

function pushLintIssue(
  issues: ValidationError[],
  severity: ValidationError["severity"],
  code: HsmsLinterIssueCode,
  message: string,
  lineIndex: number,
  snippet: string,
  params?: ValidationError["params"],
): void {
  issues.push({
    severity,
    message: `[${code}] ${message}`,
    code,
    ...(params ? { params } : {}),
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
  // Bound regex windows to avoid catastrophic backtracking on un-truncated OCR lines.
  const sample = line.length > LINT_REGEX_WINDOW ? line.slice(0, LINT_REGEX_WINDOW) : line;

  if (linesSinceFolio >= 0 && linesSinceFolio < 4) {
    if (RE_STRAY_CATCHWORD.test(sample) || RE_STRAY_SIGNATURE.test(sample)) {
      pushLintIssue(
        issues,
        "warning",
        "STRAY_PAGE_METADATA",
        "Catchword or signature appears near the top of the folio — verify it belongs at the page foot.",
        lineIndex,
        sample,
      );
    }
  }

  if (sample.startsWith("{HD") && RE_HEADER_LEAK.test(sample)) {
    const payload = sample.match(RE_HEADER_LEAK)?.[1] ?? "";
    if (payload.includes("{") || payload.includes("}")) {
      pushLintIssue(
        issues,
        "error",
        "MALFORMED_HEADER_BLOCK",
        "Running headers must contain flat text only, not nested structural braces.",
        lineIndex,
        sample,
      );
    }
  }

  if (RE_INITIAL_MULTI_SPACE.test(sample)) {
    pushLintIssue(
      issues,
      "warning",
      "INITIAL_GUTTER_LEAK",
      "Multiple spaces after `{INn.}` can disturb drop-cap gutter alignment in facsimile layout.",
      lineIndex,
      sample,
    );
  }

  if (RE_MALFORMED_RECONSTRUCTION.test(sample) && !RE_VALID_RECONSTRUCTION.test(sample)) {
    pushLintIssue(
      issues,
      "warning",
      "MALFORMED_RECONSTRUCTION",
      "Bracket/asterisk sequence does not match editorial reconstruction form `[*text]`.",
      lineIndex,
      sample,
    );
  }

  if (RE_BARE_EMPTY_BRACKETS.test(sample)) {
    pushLintIssue(
      issues,
      "warning",
      "EMPTY_BRACKET_TOKEN",
      "Empty brackets `[]` should be a mechanical lacuna `[ ]` (interior space) per HSMS convention.",
      lineIndex,
      sample,
    );
  }
}

export type LintHsmsOptions = {
  /** When false, skip Proofer-style editorial/technical incident scan (default true). */
  includeProofer?: boolean;
  /** Optional witness filename for `TEXT.SIGLA.txt` checks. */
  sourceFileName?: string;
};

/**
 * Fast structural lint of raw HSMS text — no full AST / concordance build.
 * Use before facsimile render, in the editor, or from `npm run lint:hsms`.
 * Includes Proofer-style incident flags by default ("señala; el editor decide").
 */
export function lintHsmsTranscription(
  rawText: string,
  options?: LintHsmsOptions,
): LintReport {
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
  const includeProofer = options?.includeProofer !== false;

  // Document-scoped proofer checks once; line checks run in the shared O(N) pass below.
  if (includeProofer) {
    issues.push(
      ...prooferIncidentsAsValidationErrors(
        scanProoferDocumentIncidents(rawText, {
          sourceFileName: options?.sourceFileName,
        }),
      ),
    );
  }

  let envStack: StructuralEnvFrame[] = [];
  let inColumnBlock = false;
  let columnLineIndex = -1;
  let columnHadEnvOpen = false;
  let pendingVernacularClose = false;
  let linesSinceFolio = -1;
  /** Vision models often emit `{CB1.}` then loose text; flag that pairing only. */
  let sawEmptyColumnTag = false;
  const slopWarned = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    // Preserve leading spaces for proofer EDGE_SPACE; strip trailing only.
    const rawLine = lines[i].replace(/\s+$/, "");
    if (!rawLine.trim()) continue;

    if (includeProofer) {
      issues.push(
        ...prooferIncidentsAsValidationErrors(scanProoferLineIncidents(rawLine, i)),
      );
    }

    let line = rawLine.trim();

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
          { mnemonic: `{${activeEnv.code}.}`, line: activeEnv.startLine + 1 },
        );
      }
      // Reset folio-local tracking — prevents unbounded Set growth on multi-folio corpora.
      // Keep `sawEmptyColumnTag`: vision often emits `{CB1.}` then `[fol. …]` then loose body text.
      envStack = [];
      inColumnBlock = false;
      columnLineIndex = -1;
      columnHadEnvOpen = false;
      pendingVernacularClose = false;
      linesSinceFolio = 0;
      slopWarned.clear();
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

    const diacriticSample =
      line.length > LINT_REGEX_WINDOW ? line.slice(0, LINT_REGEX_WINDOW) : line;
    if (RE_MALFORMED_DIACRITIC.test(diacriticSample)) {
      pushLintIssue(
        issues,
        "warning",
        "MALFORMED_DIACRITIC",
        "Nested or stacked diacritic markers detected — verify @, ', and ~ notation.",
        i,
        diacriticSample,
      );
    }

    if (RE_EMPTY_COLUMN_TAG.test(line)) {
      pushLintIssue(
        issues,
        "error",
        "EMPTY_COLUMN_ENVELOPE",
        "Empty column tag `{CBn.}` — open with `{CBn.` on its own line, put text inside, close with `}`.",
        i,
        line,
      );
      sawEmptyColumnTag = true;
      inColumnBlock = false;
      columnLineIndex = -1;
      columnHadEnvOpen = false;
      pendingVernacularClose = false;
      continue;
    }

    if (RE_COLUMN_OPEN.test(line)) {
      inColumnBlock = true;
      sawEmptyColumnTag = false;
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

    if (
      sawEmptyColumnTag &&
      !inColumnBlock &&
      !RE_OUTSIDE_COLUMN_OK.test(line) &&
      RE_LETTER_OR_DIGIT.test(line)
    ) {
      pushLintIssue(
        issues,
        "error",
        "TEXT_OUTSIDE_COLUMN",
        "Body text follows an empty `{CBn.}` tag — wrap it in a multiline `{CBn.` … `}` envelope.",
        i,
        line,
      );
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
        allowVernacularClose: pendingVernacularClose && RE_TRAILING_BRACE.test(line),
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
        { detail: err instanceof Error ? err.message : String(err) },
      );
      continue;
    }

    const latClosedWithVernacular =
      stackBeforeLine.some((f) => f.code === "LAT") &&
      envStack.length < stackBeforeLine.length &&
      RE_LAT_VERNACULAR_CLOSE.test(line);
    if (latClosedWithVernacular) {
      pendingVernacularClose = true;
    } else if (pendingVernacularClose && RE_TRAILING_BRACE.test(line)) {
      pendingVernacularClose = false;
    }
  }

  issues.push(...unclosedEnvironmentErrors(envStack));
  return validationIssuesToLintReport(issues);
}
