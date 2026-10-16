import type { ValidationError } from "@/constants/manuscript";

export type LspSeverity = 1 | 2 | 3 | 4; // Error | Warning | Info | Hint

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface HsmsDiagnostic {
  severity: LspSeverity;
  message: string;
  code?: string;
  source: "hsmsLinter";
  range: LspRange;
  rawSnippet?: string;
  /** Optional editor quick-fix payloads (Phase-2 consumers). */
  data?: {
    fix?: {
      title: string;
      newText: string;
    };
  };
}

const CODE_IN_MESSAGE = /^\[([A-Z0-9_]+)\]\s*/;

export function extractLintCode(issue: ValidationError): string | undefined {
  if (issue.code) return issue.code;
  const m = issue.message.match(CODE_IN_MESSAGE);
  return m?.[1];
}

export function validationSeverityToLsp(severity: ValidationError["severity"]): LspSeverity {
  return severity === "error" ? 1 : 2;
}

/**
 * Map HSMS validation issues to LSP-shaped diagnostics for editor / MCP tooling.
 * Column span defaults to the full line when only a line index is known.
 */
export function toHsmsDiagnostics(issues: ValidationError[]): HsmsDiagnostic[] {
  return issues.map((issue) => {
    const snippet = issue.rawSnippet ?? "";
    const endCol = Math.max(snippet.length, 1);
    return {
      severity: validationSeverityToLsp(issue.severity),
      message: issue.message.replace(CODE_IN_MESSAGE, ""),
      code: extractLintCode(issue),
      source: "hsmsLinter",
      range: {
        start: { line: issue.lineIndex, character: 0 },
        end: { line: issue.lineIndex, character: endCol },
      },
      rawSnippet: snippet || undefined,
    };
  });
}
