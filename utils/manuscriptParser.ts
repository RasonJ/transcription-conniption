import type {
  BlockType,
  FolioSide,
  ManuscriptBlock,
  ParsedManuscript,
  Token,
  TokenType,
  ValidationError,
} from "../constants/manuscript";
import {
  createFigureIdAllocator,
  isEmptyDiagramLine,
  type FigureIdAllocator,
} from "./figureAnchors";
import { buildEnvOpenPattern, isLanguageCode, parseEnvironmentOpen } from "./environmentBlocks";
import { enrichParsedManuscript } from "./analyzeManuscript";
import { parseFolioMarker } from "./folioMarkers";
import { escapeRegex } from "./regexUtils";
import { parseDropInitialPrefix } from "./dropInitial";
import { normalizeMetadataPlainText } from "./metadataText";
import { PAREN_CLOSE_SENTINEL, PAREN_OPEN_SENTINEL, preprocessSentinels, tokenizeString } from "./hsmsLexer";
import {
  implicitContinuationSlopKey,
  implicitContinuationSlopWarning,
  scanLineLexicalIssues,
  scanStructuralTokenIssues,
  type StructuralEnvFrame,
} from "./parseValidation";
import {
  assembleStructuralTokens,
  tokenizeLineStructural,
  type EnvStackFrame,
} from "./structuralAssembly";

export { preprocessSentinels, tokenizeString, PAREN_OPEN_SENTINEL, PAREN_CLOSE_SENTINEL };

/** Margin line index — bounded quantifiers avoid catastrophic backtracking on long lines. */
export const LINE_PREFIX_RE =
  /^([a-zA-Z0-9[\].]{1,14})(?:[).:\s-]{1,3}|\s+(?=\{))/;

const RE_PL_DIGITS = /^\d{1,4}$/;
const RE_PL_ROMAN = /^[ivxlcdm]+$/i;
const RE_STRIP_BRACKETS = /[[\].]/g;
const RE_YEAR_LIKE = /^\d{3,4}$/;

/** True when a captured prefix is a margin ref (digit or Roman), not a prose fragment after hyphenation. */
export function isPlausibleMarginLineNumber(ref: string): boolean {
  if (RE_PL_DIGITS.test(ref)) return true;
  const withoutInterpolations = ref.replace(/\[[^\]]*\]/g, "");
  const body = withoutInterpolations.replace(RE_STRIP_BRACKETS, "");
  return body.length > 0 && RE_PL_ROMAN.test(body);
}

const RE_RMK_EXTRACT = /\{RMK:\s*(.*?)\.?\}/i;
const RE_RMK_GLOBAL = /\{RMK:\s*.*?\}\s*/gi;
const RE_MARGIN_CHECK = /^[a-zA-Z0-9[\].]{1,14}$/;
const RE_HEADING_EXTRACT = /\{HD[12]?\.\s*([^}]+)\}/;
const RE_HEADING_TRAILING_PLUS = /\s*\+$/;
const RE_COLUMN_EXTRACT = /\{CB(\d+)\./;
const RE_COLUMN_STRIP = /^\{CB\d+\.(?:\s|~|\+)*/;
const RE_CATCHWORD_EXTRACT = /\{CW\.\s*([^}]+)\}/;
const RE_SIGNATURE_EXTRACT = /\{SG\.\s*([^}]+)\}/;
export function buildLanguageTagPattern(code: string): RegExp {
  return new RegExp(`\\{${escapeRegex(code)}\\.\\s*([^}]*)\\}`, "gi");
}

/** Block types that contribute to reading-flow / hyphen reconstruction. */
const FLOW_BLOCK_TYPES = new Set<BlockType>([
  "prose",
  "language_span",
  "rubric",
  "gloss",
  "addendum",
]);

type MetadataTarget = ParsedManuscript["metadata"];

function applyRmkContent(content: string, metadata: MetadataTarget): void {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }
  if (trimmed.includes("|")) {
    const components = trimmed.split("|").map((c) => c.trim());
    if (components[2] && !Number.isNaN(Number(components[2]))) {
      metadata.imprint = {
        city: normalizeMetadataPlainText(components[0]),
        printer: normalizeMetadataPlainText(components[1]),
        date: components[2].trim(),
      };
    } else {
      metadata.witness = {
        city: normalizeMetadataPlainText(components[0]),
        library: normalizeMetadataPlainText(components[1]),
        shelfmark: normalizeMetadataPlainText(components[2] ?? ""),
      };
    }
    return;
  }
  if (!metadata.author) {
    metadata.author = normalizeMetadataPlainText(trimmed);
  } else if (!metadata.title) {
    metadata.title = normalizeMetadataPlainText(trimmed);
  }
}

/**
 * Extract `{RMK: …}` anywhere on a line into metadata and return the remainder (if any).
 * Returns null when the whole line was metadata.
 */
export function stripRmkFromLine(line: string, metadata: MetadataTarget): string | null {
  const match = line.match(RE_RMK_EXTRACT);
  if (!match) return line;
  applyRmkContent(match[1], metadata);
  const rest = line.replace(RE_RMK_GLOBAL, "").trim();
  if (!rest) return null;
  if (RE_MARGIN_CHECK.test(rest)) return null;
  return rest;
}

export function extractLinePrefix(line: string): { line: string; lineNumber?: string } {
  const match = line.match(LINE_PREFIX_RE);
  if (!match) return { line };

  const remainder = line.substring(match[0].length).trim();
  const lineNumber = match[1];

  if (!isPlausibleMarginLineNumber(lineNumber)) {
    return { line };
  }

  // Reject year-like bare numbers in prose (e.g. "1537. Lisboa") unless an env tag follows.
  if (RE_YEAR_LIKE.test(lineNumber) && remainder.length > 0 && remainder[0] !== "{") {
    return { line };
  }

  return { lineNumber, line: remainder };
}

export type ReadingStringOptions = {
  /** Omit standalone otiose tildes (~) for dictionary-style reading. */
  suppressOtioseMarks?: boolean;
  /** Use diplomatic diacritic forms (o~) instead of normalized Unicode (õ). */
  diplomaticDiacritics?: boolean;
};

function flushBlock(
  folio: FolioSide,
  blockType: BlockType,
  columns: number,
  tokens: Token[],
  lineNumber?: string,
  language?: string,
): void {
  if (tokens.length === 0 && blockType !== "diagram") {
    return;
  }
  folio.blocks.push({
    type: blockType,
    columns,
    tokens: [...tokens],
    ...(lineNumber ? { lineNumber } : {}),
    ...(language ? { language } : {}),
  });
}

const SKIP_WORD_TYPES = new Set<TokenType>([
  "scribal_deletion",
  "editorial_deletion",
  "calderon",
  "calderon_two",
  "calderon_three",
  "blank_space",
  "hyphen",
  "superscript",
  "figure_anchor",
  "scribal_punctuation",
  "env_open",
  "env_close",
  "citation_wrap",
  "missing_fragment",
  "mechanical_lacuna",
  "illegible_text",
]);

export function tokensToReadingString(tokens: Token[], options: ReadingStringOptions = {}): string {
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "otiose_mark") {
      if (!options.suppressOtioseMarks) chunks.push("~");
      continue;
    }
    if (SKIP_WORD_TYPES.has(token.type)) continue;
    if (token.type === "reconstructed_text") {
      chunks.push(token.value);
      continue;
    }
    if (token.type === "mechanical_lacuna") {
      chunks.push(" ");
      continue;
    }
    if (token.type === "scribal_insertion" || token.type === "editorial_insertion") {
      chunks.push(` ${token.value} `);
      continue;
    }
    chunks.push(
      options.diplomaticDiacritics && token.normalized ? token.raw : token.value,
    );
  }
  return chunks.join("");
}

function blockEndsWithHyphen(block: ManuscriptBlock): boolean {
  if (block.tokens.length === 0) {
    return false;
  }
  const last = block.tokens[block.tokens.length - 1];
  if (last.type === "hyphen") {
    return true;
  }
  return last.type === "text" && last.value.endsWith("-");
}

export function reconstructPageFlow(
  blocks: ManuscriptBlock[],
  options?: ReadingStringOptions,
): string {
  const chunks: string[] = [];
  let pendingHyphenText = "";

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!FLOW_BLOCK_TYPES.has(block.type)) continue;

    let blockString = tokensToReadingString(block.tokens, options);
    if (pendingHyphenText) {
      blockString = pendingHyphenText + blockString;
      pendingHyphenText = "";
    }

    if (blockEndsWithHyphen(block)) {
      pendingHyphenText = blockString.endsWith("-") ? blockString.slice(0, -1) : blockString;
      continue;
    }

    if (blockString.length > 0) chunks.push(blockString);
  }

  if (pendingHyphenText.length > 0) chunks.push(pendingHyphenText);
  return chunks.join(" ").trim();
}

export function reconstructManuscriptFlow(
  folios: FolioSide[],
  options?: ReadingStringOptions,
): string {
  const chunks: string[] = [];
  let carryOverFraction = "";

  for (let fi = 0; fi < folios.length; fi++) {
    let pageText = folios[fi].reconstructedFlow ?? reconstructPageFlow(folios[fi].blocks, options);

    if (carryOverFraction) {
      pageText = carryOverFraction + pageText;
      carryOverFraction = "";
    }

    if (pageText.endsWith("-")) {
      const lastSpaceIdx = pageText.lastIndexOf(" ");
      if (lastSpaceIdx >= 0) {
        carryOverFraction = pageText.substring(lastSpaceIdx + 1, pageText.length - 1);
        pageText = pageText.substring(0, lastSpaceIdx).trim();
      } else {
        carryOverFraction = pageText.slice(0, -1);
        pageText = "";
      }
    }

    if (pageText.length > 0) {
      chunks.push(pageText);
    }
  }

  if (carryOverFraction.length > 0) {
    chunks.push(carryOverFraction);
  }

  return chunks.join("\n\n").trim();
}

function finalizeFolio(folio: FolioSide, options?: ReadingStringOptions): void {
  folio.reconstructedFlow = reconstructPageFlow(folio.blocks, options);
}

export function parseHsMsText(rawText: string): ParsedManuscript {
  const lines = rawText.split(/\r?\n/);
  const parseValidationErrors: ValidationError[] = [];
  const result: ParsedManuscript = {
    metadata: { author: "", title: "", imprint: {}, witness: {} },
    folios: [],
    stats: { totalWords: 0, totalLines: 0, rubricCount: 0, glossCount: 0 },
    reconstructedFlow: "",
  };

  let currentFolio: FolioSide | null = null;
  let activeColumns = 1;
  let activeBlockType: BlockType = "prose";
  let continuousBlockTokens: Token[] = [];
  let pendingLineNumber: string | undefined;
  let activeLanguageCode: string | undefined;
  let envStack: EnvStackFrame[] = [];
  let validationEnvStack: StructuralEnvFrame[] = [];
  let inColumnBlock = false;
  let figureAllocator: FigureIdAllocator | undefined;
  const slopWarned = new Set<string>();

  const outermostEnv = (): EnvStackFrame | undefined =>
    envStack.length > 0 ? envStack[envStack.length - 1] : undefined;

  const syncActiveFromStack = (): void => {
    const outer = outermostEnv();
    activeBlockType = outer?.type ?? "prose";
    activeLanguageCode = outer?.type === "language_span" ? outer.code : undefined;
  };

  const ensureFolio = (id = "unfoliated"): FolioSide => {
    if (!currentFolio) {
      currentFolio = { id, headings: [], blocks: [] };
      result.folios.push(currentFolio);
    }
    return currentFolio;
  };

  const doFlush = (folio: FolioSide): void => {
    const outer = outermostEnv();
    const blockType = outer?.type ?? activeBlockType;
    const language = blockType === "language_span" ? outer?.code ?? activeLanguageCode : undefined;
    flushBlock(
      folio,
      blockType,
      activeColumns,
      continuousBlockTokens,
      pendingLineNumber,
      language,
    );
    continuousBlockTokens = [];
    pendingLineNumber = undefined;
  };

  const resetEnvironment = (): void => {
    envStack = [];
    validationEnvStack = [];
    inColumnBlock = false;
    activeBlockType = "prose";
    activeLanguageCode = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      continue;
    }

    const afterRmk = stripRmkFromLine(line, result.metadata);
    if (afterRmk === null) {
      continue;
    }
    line = afterRmk;

    const folioMarker = parseFolioMarker(line);
    if (folioMarker) {
      if (currentFolio) {
        if (continuousBlockTokens.length > 0) {
          doFlush(currentFolio);
        }
        finalizeFolio(currentFolio);
      }
      currentFolio = { id: folioMarker.id, headings: [], blocks: [] };
      result.folios.push(currentFolio);
      figureAllocator = createFigureIdAllocator(folioMarker.id);
      resetEnvironment();
      activeColumns = folioMarker.initialColumns;
      continuousBlockTokens = [];
      pendingLineNumber = undefined;
      continue;
    }

    const folio = ensureFolio();

    if (line.startsWith("{HD")) {
      const headMatch = line.match(RE_HEADING_EXTRACT);
      const headText = headMatch ? headMatch[1] : "";
      folio.headings.push(headText.replace(RE_HEADING_TRAILING_PLUS, "").trim());
      continue;
    }

    if (line.startsWith("{CB")) {
      const cbMatch = line.match(RE_COLUMN_EXTRACT);
      activeColumns = cbMatch ? parseInt(cbMatch[1], 10) : 1;
      inColumnBlock = true;
      line = line.replace(RE_COLUMN_STRIP, "");
      if (!line) continue;
    }

    if (line.startsWith("{CW.")) {
      const cwMatch = line.match(RE_CATCHWORD_EXTRACT);
      if (cwMatch) folio.catchword = cwMatch[1].trim();
      continue;
    }
    if (line.startsWith("{SG.")) {
      const sgMatch = line.match(RE_SIGNATURE_EXTRACT);
      if (sgMatch) folio.signature = sgMatch[1].trim();
      continue;
    }

    if (/^\}\s*$/.test(line)) {
      if (envStack.length > 0) {
        envStack.pop();
        validationEnvStack = validationEnvStack.slice(0, -1);
        syncActiveFromStack();
        continue;
      }
      if (inColumnBlock) {
        inColumnBlock = false;
        continue;
      }
      continue;
    }

    if (isEmptyDiagramLine(line)) {
      doFlush(folio);
      folio.blocks.push({ type: "diagram", columns: activeColumns, tokens: [] });
      resetEnvironment();
      continue;
    }

    let explicitContinuation = false;
    if (line.endsWith("+")) {
      explicitContinuation = true;
      line = line.substring(0, line.length - 1).trim();
    }

    const prefixResult = extractLinePrefix(line);
    if (prefixResult.lineNumber) {
      pendingLineNumber = prefixResult.lineNumber;
      line = prefixResult.line;
      result.stats.totalLines++;
    }

    let lineDropInitial: Token | null = null;
    const lineInitial = parseDropInitialPrefix(line);
    if (lineInitial.token) {
      lineDropInitial = lineInitial.token;
      line = lineInitial.rest.trimStart();
    }

    if (line || lineDropInitial) {
      if (!figureAllocator) {
        figureAllocator = createFigureIdAllocator(folio.id);
      }

      const envStackBefore = envStack;
      const validationStackBefore = validationEnvStack;
      parseValidationErrors.push(...scanLineLexicalIssues(line, i, true));

      const structuralTokens = tokenizeLineStructural(line, figureAllocator);
      const structuralScan = scanStructuralTokenIssues(
        structuralTokens,
        line,
        i,
        validationEnvStack,
        inColumnBlock,
      );
      validationEnvStack = structuralScan.stackAfter;
      if (structuralScan.columnBlockClosed) {
        inColumnBlock = false;
      }

      if (
        !explicitContinuation &&
        validationEnvStack.length > 0 &&
        !line.endsWith("}") &&
        validationStackBefore.length > 0
      ) {
        const open = validationEnvStack[validationEnvStack.length - 1];
        const slopKey = implicitContinuationSlopKey(open);
        if (!slopWarned.has(slopKey)) {
          slopWarned.add(slopKey);
          parseValidationErrors.push(implicitContinuationSlopWarning(i, line, open));
        }
      }

      const assembled = assembleStructuralTokens(structuralTokens, envStack);
      envStack = assembled.stackAfter;

      if (assembled.openedRubric) {
        result.stats.rubricCount++;
      }
      if (assembled.openedGloss) {
        result.stats.glossCount++;
      }

      if (assembled.contentTokens.length > 0 || lineDropInitial) {
        activeBlockType = assembled.lineOuterType;
        if (assembled.lineOuterType === "language_span") {
          const openToken = structuralTokens.find((t) => t.type === "env_open");
          const priorOuter =
            envStackBefore.length > 0 ? envStackBefore[envStackBefore.length - 1] : undefined;
          activeLanguageCode =
            openToken?.value.toUpperCase() ?? priorOuter?.code ?? activeLanguageCode;
        } else if (assembled.fullyClosedLine) {
          activeLanguageCode = undefined;
        }
        const lineTokens = lineDropInitial
          ? [lineDropInitial, ...assembled.contentTokens]
          : assembled.contentTokens;
        lineDropInitial = null;
        continuousBlockTokens.push(...lineTokens);
      } else {
        syncActiveFromStack();
      }

      // Flush per physical line for layout, but keep envStack until an explicit `}` closes it.
      if (continuousBlockTokens.length > 0) {
        doFlush(folio);
        syncActiveFromStack();
      }
    }
  }

  if (currentFolio) {
    if (continuousBlockTokens.length > 0) {
      doFlush(currentFolio);
    }
    finalizeFolio(currentFolio);
  }

  result.reconstructedFlow = reconstructManuscriptFlow(result.folios);

  return enrichParsedManuscript(result, rawText, parseValidationErrors);
}

export { buildEnvOpenPattern, isLanguageCode, parseEnvironmentOpen };
