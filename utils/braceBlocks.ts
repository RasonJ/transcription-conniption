import type { FigureMnemonic, Token } from "../constants/manuscript";
import type { FigureIdAllocator } from "./figureAnchors";
import { parseDropInitialPrefix } from "./dropInitial";
import { tokenizeString } from "./hsmsLexer";

/** Extract `{…}` with nested braces (e.g. `{ILL. {IN4.} caption…}`). */
export function extractBalancedBraceBlock(
  text: string,
  fromIndex = 0,
): { block: string; length: number } | null {
  const slice = text.slice(fromIndex);
  if (!slice.startsWith("{")) return null;

  let depth = 0;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return {
          block: slice.slice(0, i + 1),
          length: fromIndex + i + 1,
        };
      }
    }
  }
  return null;
}

const FIGURE_HEAD_RE = /^\{(ILL|MIN|DIAG|SYMB)\./i;

export function parseFigureBraceBlock(
  block: string,
): { mnemonic: FigureMnemonic; inner: string } | null {
  const match = block.match(FIGURE_HEAD_RE);
  if (!match) return null;

  const mnemonic = match[1].toUpperCase() as FigureMnemonic;
  const inner = block.replace(FIGURE_HEAD_RE, "").replace(/\}$/, "");
  return { mnemonic, inner };
}

export function tokenizeFigureBraceBlock(
  block: string,
  figureAllocator?: FigureIdAllocator,
): Token[] {
  const parsed = parseFigureBraceBlock(block);
  if (!parsed) return tokenizeString(block, figureAllocator);

  const figureId = figureAllocator?.next() ?? `unfoliated_fig_${Date.now()}`;
  const tokens: Token[] = [
    {
      type: "figure_anchor",
      value: parsed.inner.trim(),
      raw: block,
      figureId,
      figureType: parsed.mnemonic,
    },
  ];

  let remainder = parsed.inner;
  const drop = parseDropInitialPrefix(remainder);
  if (drop.token) {
    tokens.push(drop.token);
    remainder = drop.rest;
  }

  const trimmed = remainder.trim();
  if (trimmed) tokens.push(...tokenizeString(trimmed, figureAllocator));

  return tokens;
}
