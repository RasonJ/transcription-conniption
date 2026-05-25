import type { FigureMnemonic } from "../constants/manuscript";

export const FIGURE_MNEMONICS: FigureMnemonic[] = ["ILL", "MIN", "DIAG", "SYMB"];

/** HSMS inline figure placeholders: {ILL. caption}, {DIAG. …}, etc. */
export const FIGURE_ANCHOR_SOURCE = String.raw`\{(ILL|MIN|DIAG|SYMB)\.\s*([^}]*)\}`;

const RE_SAN_FOLIO = /[^\w.-]+/g;
const RE_WHITESPACE = /\s+/g;
const RE_DIAG_EMPTY = /^\{DIAG\.\s*\}$/i;

export function sanitizeFolioIdForFigure(folioId: string): string {
  return folioId.replace(RE_SAN_FOLIO, "_").replace(RE_WHITESPACE, "_") || "unfoliated";
}

export function buildFigureId(folioId: string, sequence: number): string {
  return `${sanitizeFolioIdForFigure(folioId)}_fig_${String(sequence).padStart(3, "0")}`;
}

export type FigureIdAllocator = {
  folioId: string;
  next: () => string;
};

export function createFigureIdAllocator(folioId: string): FigureIdAllocator {
  let counter = 1;
  return {
    folioId,
    next: () => buildFigureId(folioId, counter++),
  };
}

/** True when the line is only an empty diagram envelope (legacy block placeholder). */
export function isEmptyDiagramLine(line: string): boolean {
  return RE_DIAG_EMPTY.test(line.trim());
}

/** Balanced-brace check: does the terminal `}` close an inline figure mnemonic? */
export function trailingBraceClosesInlineFigure(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith("}")) return false;

  let depth = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === "}") depth++;
    else if (trimmed[i] === "{") {
      depth--;
      if (depth === 0) {
        const head = trimmed.slice(i, i + 5).toUpperCase();
        return (
          head.startsWith("{ILL.") ||
          head.startsWith("{MIN.") ||
          head.startsWith("{DIAG.") ||
          head.startsWith("{SYMB.")
        );
      }
    }
  }
  return false;
}

/** Prevent inline figure closers from being consumed as environment block terminators. */
export function stripEnvironmentClose(line: string): { line: string; endsBlock: boolean } {
  let endsBlock = false;
  let working = line.trim();

  while (working.endsWith("}")) {
    if (trailingBraceClosesInlineFigure(working)) {
      break;
    }
    endsBlock = true;
    working = working.slice(0, -1).trimEnd();
  }

  return { line: working, endsBlock };
}
