import type { BlockType, Token, ValidationError } from "../constants/manuscript";
import { blockTypeForEnvCode } from "./environmentBlocks";
import {
  UNCLOSED_BRACKET_INSERTION_AT_EOL,
  UNCLOSED_EXPANSION_AT_EOL,
  UNCLOSED_PAREN_DELETION_AT_EOL,
} from "./lexicalPatterns";

function pushError(
  errors: ValidationError[],
  message: string,
  lineIndex: number,
  rawSnippet: string,
  severity: ValidationError["severity"] = "error",
): void {
  errors.push({
    severity,
    message,
    lineIndex,
    rawSnippet: rawSnippet.slice(0, 120),
  });
}

/** Line-level lexical checks aligned with hsmsLexer token boundaries. */
export function scanLineLexicalIssues(
  line: string,
  lineIndex: number,
  alreadyTrimmed = false,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const trimmed = alreadyTrimmed ? line : line.trim();
  if (trimmed.length === 0) {
    return errors;
  }

  if (UNCLOSED_EXPANSION_AT_EOL.test(trimmed)) {
    let hasClose = false;
    for (let ci = 0; ci < trimmed.length; ci++) {
      if (trimmed[ci] === ">") {
        hasClose = true;
        break;
      }
    }
    if (!hasClose) {
      pushError(errors, "Unclosed expansion tag `<…>` before line end", lineIndex, trimmed);
    }
  }

  if (UNCLOSED_PAREN_DELETION_AT_EOL.test(trimmed)) {
    let hasClose = false;
    for (let ci = 0; ci < trimmed.length; ci++) {
      if (trimmed[ci] === ")") {
        hasClose = true;
        break;
      }
    }
    if (!hasClose) {
      pushError(
        errors,
        "Possible unclosed parenthetical deletion before line end",
        lineIndex,
        trimmed,
        "warning",
      );
    }
  }

  if (UNCLOSED_BRACKET_INSERTION_AT_EOL.test(trimmed)) {
    let hasClose = false;
    for (let ci = 0; ci < trimmed.length; ci++) {
      if (trimmed[ci] === "]") {
        hasClose = true;
        break;
      }
    }
    if (!hasClose) {
      pushError(
        errors,
        "Possible unclosed bracket insertion before line end",
        lineIndex,
        trimmed,
        "warning",
      );
    }
  }

  return errors;
}

export type StructuralEnvFrame = {
  code: string;
  type: BlockType;
  startLine: number;
  snippet: string;
};

export type StructuralScanResult = {
  errors: ValidationError[];
  stackAfter: StructuralEnvFrame[];
  /** True when a `}` closed a `{CBn.` column wrapper (not RUB/LAT/etc.). */
  columnBlockClosed: boolean;
};

export type ColumnScanContext = {
  /** Zero-based index of this line within the current `{CBn.` block. */
  lineIndex: number;
  /** True once any structural env opens inside the current column block. */
  hadEnvOpen: boolean;
};

export type StructuralScanOptions = {
  inColumnBlock?: boolean;
  columnContext?: ColumnScanContext;
  /** When true, suppress empty-stack `}` extra-close (vernacular tail after `{LAT. …} text}`). */
  allowVernacularClose?: boolean;
};

/** Structural env braces on one line; inherits open frames from prior physical lines. */
export function scanStructuralTokenIssues(
  structuralTokens: Token[],
  line: string,
  lineIndex: number,
  inheritedStack: StructuralEnvFrame[] = [],
  options: StructuralScanOptions | boolean = {},
): StructuralScanResult {
  const opts: StructuralScanOptions =
    typeof options === "boolean" ? { inColumnBlock: options } : options;
  const inColumnBlock = opts.inColumnBlock ?? false;
  const columnContext = opts.columnContext;
  const allowVernacularClose = opts.allowVernacularClose ?? false;

  const errors: ValidationError[] = [];
  const envStack = inheritedStack.map((f) => ({ ...f }));
  let columnBlockClosed = false;

  const trimmedLine = line.trim();
  const isFigureStubColumnClose = /^\{(ILL|MIN|DIAG|SYMB)\.\}\s*\}$/i.test(trimmedLine);

  const hasSubstantialTokensAfter = (closeIndex: number): boolean => {
    for (let ti = closeIndex + 1; ti < structuralTokens.length; ti++) {
      const next = structuralTokens[ti];
      if (next.type === "env_close") {
        continue;
      }
      if (next.type === "text" && /^\s*$/.test(next.value)) {
        continue;
      }
      return true;
    }
    return false;
  };

  const canCloseColumnWrapper = (): boolean => {
    if (!columnContext) {
      return true;
    }
    return columnContext.hadEnvOpen || columnContext.lineIndex > 0;
  };

  for (let i = 0; i < structuralTokens.length; i++) {
    const token = structuralTokens[i];
    if (token.type === "env_open") {
      const code = token.value.toUpperCase();
      const top = envStack[envStack.length - 1];
      if (top?.code !== code) {
        envStack.push({
          code,
          type: blockTypeForEnvCode(code),
          startLine: lineIndex,
          snippet: line,
        });
      }
    } else if (token.type === "env_close") {
      if (envStack.length > 0) {
        envStack.pop();
      } else if (inColumnBlock && !hasSubstantialTokensAfter(i) && canCloseColumnWrapper()) {
        if (!columnBlockClosed) {
          columnBlockClosed = true;
        }
      } else if (
        !inColumnBlock &&
        !allowVernacularClose &&
        !isFigureStubColumnClose
      ) {
        pushError(
          errors,
          `Extra structural closing brace found on line ${lineIndex + 1}`,
          lineIndex,
          line,
          "warning",
        );
      }
    }
  }

  return { errors, stackAfter: envStack, columnBlockClosed };
}

export function implicitContinuationSlopKey(frame: StructuralEnvFrame): string {
  return frame.code;
}

export function implicitContinuationSlopWarning(
  lineIndex: number,
  line: string,
  frame: StructuralEnvFrame,
): ValidationError {
  return {
    severity: "warning",
    message: `[IMPLICIT_CONTINUATION] Environment {${frame.code}.} missing explicit continuation delimiter (+).`,
    lineIndex,
    rawSnippet: line.slice(0, 120),
  };
}

export function unclosedEnvironmentErrors(stack: StructuralEnvFrame[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (let i = 0; i < stack.length; i++) {
    const frame = stack[i];
    pushError(
      errors,
      `[UNCLOSED_ENV] Unclosed environment block {${frame.code}. started on line ${frame.startLine + 1}`,
      frame.startLine,
      frame.snippet,
    );
  }
  return errors;
}

export function mergeValidationErrors(...groups: ValidationError[][]): ValidationError[] {
  const seen = new Set<string>();
  const merged: ValidationError[] = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    for (let ei = 0; ei < group.length; ei++) {
      const err = group[ei];
      const key = `${err.lineIndex}|${err.severity}|${err.message}|${err.rawSnippet}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(err);
      }
    }
  }

  return merged;
}
