import type { BlockType, EnvLayer, Token, TokenType } from "../constants/manuscript";
import { extractBalancedBraceBlock, tokenizeFigureBraceBlock } from "./braceBlocks";
import { blockTypeForEnvCode, isKnownEnvironmentCode } from "./environmentBlocks";
import type { FigureIdAllocator } from "./figureAnchors";
import { FIGURE_MNEMONICS } from "./figureAnchors";
import { parseDropInitialPrefix } from "./dropInitial";
import { tokenizeString } from "./hsmsLexer";
import { ENV_OPEN_INLINE } from "./lexicalPatterns";

const FIGURE_CODES = new Set<string>(FIGURE_MNEMONICS);

function isFigureCode(code: string): boolean {
  return FIGURE_CODES.has(code.toUpperCase());
}

function pushStructural(out: Token[], type: TokenType, value: string, raw: string): void {
  out.push({ type, value, raw });
}

function appendLexicalChunk(
  tokens: Token[],
  chunk: string,
  figureAllocator?: FigureIdAllocator,
): void {
  let rest = chunk;
  while (rest.length > 0) {
    const drop = parseDropInitialPrefix(rest);
    if (drop.token) {
      tokens.push(drop.token);
      rest = drop.rest;
      continue;
    }
    tokens.push(...tokenizeString(rest, figureAllocator));
    break;
  }
}

/** Pass 1 — interleave environment braces with sticky lexical tokens on one line. */
export function tokenizeLineStructural(line: string, figureAllocator?: FigureIdAllocator): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const len = line.length;

  while (index < len) {
    const rest = line.slice(index);

    const leadingDrop = parseDropInitialPrefix(rest);
    if (leadingDrop.token) {
      tokens.push(leadingDrop.token);
      index += rest.length - leadingDrop.rest.length;
      continue;
    }

    const dropCapBare = rest.match(/^(\{IN\d+\.?)(?=\s|$)/);
    if (dropCapBare) {
      const drop = parseDropInitialPrefix(rest);
      if (drop.token) {
        tokens.push(drop.token);
        index += rest.length - drop.rest.length;
        continue;
      }
      appendLexicalChunk(tokens, dropCapBare[1], figureAllocator);
      index += dropCapBare[1].length;
      continue;
    }

    const brace = extractBalancedBraceBlock(rest, 0);
    if (brace) {
      if (/^\{\s*\}$/.test(brace.block)) {
        appendLexicalChunk(tokens, brace.block, figureAllocator);
        index += brace.length;
        continue;
      }

      // Colon metadata blocks ({RMK:, {RUB:, …}) — not structural env braces.
      if (/^\{[A-Z]{2,4}:/.test(brace.block)) {
        appendLexicalChunk(tokens, brace.block, figureAllocator);
        index += brace.length;
        continue;
      }

      if (/^\{(ILL|MIN|DIAG|SYMB)\./i.test(brace.block)) {
        tokens.push(...tokenizeFigureBraceBlock(brace.block, figureAllocator));
        index += brace.length;
        continue;
      }

      // Single-token env wrappers like `{Glosa.}` — open and close together.
      const envOnlyMatch = brace.block.match(/^\{([A-Za-z]{2,5})\.\}$/i);
      if (envOnlyMatch) {
        const code = envOnlyMatch[1].toUpperCase();
        if (isKnownEnvironmentCode(code) && !isFigureCode(code)) {
          pushStructural(tokens, "env_open", code, `{${code}.`);
          pushStructural(tokens, "env_close", "}", "}");
          index += brace.length;
          continue;
        }
      }

      const mnemonicMatch = brace.block.match(/^\{(IN\d+|[A-Za-z]{2,5})\./i);
      const mnemonicCode = mnemonicMatch?.[1]?.toUpperCase() ?? "";
      const isDropCapMnemonic = /^IN\d+$/.test(mnemonicCode);
      if (
        mnemonicCode &&
        (isDropCapMnemonic ||
          (!isKnownEnvironmentCode(mnemonicCode) && !isFigureCode(mnemonicCode)))
      ) {
        appendLexicalChunk(tokens, brace.block, figureAllocator);
        index += brace.length;
        continue;
      }
    }

    const openFigureLine = rest.match(/^\{(ILL|MIN|DIAG|SYMB)\.(.*)$/s);
    if (openFigureLine && !rest.includes("}", openFigureLine[0].length - 1)) {
      const synthetic = `{${openFigureLine[1].toUpperCase()}. ${openFigureLine[2].trimEnd()}}`;
      tokens.push(...tokenizeFigureBraceBlock(synthetic, figureAllocator));
      index = len;
      continue;
    }

    const envMatch = rest.match(ENV_OPEN_INLINE);
    if (envMatch) {
      const code = envMatch[1].toUpperCase();
      if (isKnownEnvironmentCode(code) && !isFigureCode(code)) {
        pushStructural(tokens, "env_open", code, envMatch[0]);
        index += envMatch[0].length;
        continue;
      }
      // Unknown `{XXX.` prefix (e.g. mis-detected) — consume as balanced lexical, not env_close crawl.
      const unknownOpen = extractBalancedBraceBlock(rest, 0);
      if (unknownOpen) {
        appendLexicalChunk(tokens, unknownOpen.block, figureAllocator);
        index += unknownOpen.length;
        continue;
      }
    }

    if (rest.startsWith("}")) {
      pushStructural(tokens, "env_close", "}", "}");
      index += 1;
      continue;
    }

    if (rest.startsWith("$.") || rest.startsWith("$;")) {
      const raw = rest.startsWith("$.") ? "$." : "$;";
      pushStructural(tokens, "scribal_punctuation", raw, raw);
      index += raw.length;
      continue;
    }

    const nextSpecial = rest.search(/[\{}\$]/);
    const chunkEnd = nextSpecial === -1 ? len - index : nextSpecial;
    if (chunkEnd > 0) {
      const chunk = line.substring(index, index + chunkEnd);
      appendLexicalChunk(tokens, chunk, figureAllocator);
      index += chunkEnd;
      continue;
    }

    index += 1;
  }

  return tokens;
}

export type EnvStackFrame = EnvLayer;

/** Recursive environment stack (blockStack) for nested {RUB.}/{LAT.}/… tags. */
export type BlockEnvironmentStack = EnvStackFrame[];

export type StructuralAssemblyResult = {
  contentTokens: Token[];
  stackAfter: EnvStackFrame[];
  outerBlockType: BlockType;
  outerLanguage?: string;
  openedRubric: boolean;
  openedGloss: boolean;
  /** Outermost environment type opened or inherited on this line. */
  lineOuterType: BlockType;
  /** True when all environments close by end of line (inline or continued). */
  fullyClosedLine: boolean;
};

/** Pass 2 — walk structural tokens and annotate content with nested blockStack layers. */
export function assembleStructuralTokens(
  structuralTokens: Token[],
  inheritedStack: BlockEnvironmentStack = [],
): StructuralAssemblyResult {
  const stack = inheritedStack.map((f) => ({ ...f }));
  const contentTokens: Token[] = [];
  let outerBlockType: BlockType = stack[0]?.type ?? "prose";
  let lineOuterType: BlockType = stack[0]?.type ?? "prose";
  let outerLanguage = stack[0]?.type === "language_span" ? stack[0].code : undefined;
  let openedRubric = false;
  let openedGloss = false;
  let openedEnvOnLine = false;

  for (const token of structuralTokens) {
    if (token.type === "env_open") {
      const code = token.value.toUpperCase();
      const top = stack[stack.length - 1];
      if (top?.code === code) {
        continue;
      }
      const frame: EnvStackFrame = { type: blockTypeForEnvCode(code), code };
      stack.push(frame);
      if (stack.length === 1 && inheritedStack.length === 0) {
        lineOuterType = frame.type;
        openedEnvOnLine = true;
      }
      if (stack.length === 1) {
        outerBlockType = frame.type;
        outerLanguage = frame.type === "language_span" ? frame.code : undefined;
      }
      if (frame.type === "rubric") {
        openedRubric = true;
      }
      if (frame.type === "gloss") {
        openedGloss = true;
      }
      continue;
    }

    if (token.type === "env_close") {
      if (stack.length > 0) {
        stack.pop();
      }
      if (stack.length === 0) {
        outerBlockType = "prose";
        outerLanguage = undefined;
      } else {
        outerBlockType = stack[0].type;
        outerLanguage = stack[0].type === "language_span" ? stack[0].code : undefined;
      }
      continue;
    }

    contentTokens.push({
      ...token,
      envLayers: stack.length > 0 ? stack.map((f) => ({ ...f })) : undefined,
    });
  }

  const fullyClosedLine =
    stack.length === 0 && (inheritedStack.length > 0 || openedEnvOnLine);

  return {
    contentTokens,
    stackAfter: stack.map((f) => ({ ...f })),
    outerBlockType,
    outerLanguage,
    openedRubric,
    openedGloss,
    lineOuterType,
    fullyClosedLine,
  };
}

/** Convenience: run Pass 1 + Pass 2 on a single physical line. */
export function compileLineStructural(
  line: string,
  inheritedStack: BlockEnvironmentStack = [],
  figureAllocator?: FigureIdAllocator,
): StructuralAssemblyResult & { structuralTokens: Token[] } {
  const structuralTokens = tokenizeLineStructural(line, figureAllocator);
  const assembled = assembleStructuralTokens(structuralTokens, inheritedStack);
  return { ...assembled, structuralTokens };
}
