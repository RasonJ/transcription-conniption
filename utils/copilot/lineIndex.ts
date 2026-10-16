/**
 * Per-line diplomatic and reading words, built lazily for Tier B/C recipes
 * (graph patterns need the diplomatic surface: `n~`, `c'`, `<ue>`, `[+]`).
 * Cached per ParsedManuscript; one linear pass.
 */
import type { BlockType, ParsedManuscript, Token } from "../../constants/manuscript";
import { buildSpatialFolio } from "../spatialAst";

export interface LineWord {
  /** As transcribed: legacy notation kept (`sen~or`, `q<ue>`, `de[+]nostados`). */
  diplomatic: string;
  /** Reading form: diacritics resolved, expansions applied, `[+]` joined (`señor`, `que`). */
  reading: string;
  lang?: string;
  hasExpansion: boolean;
  hasSuperscript: boolean;
  hasPrefixSeparator: boolean;
  /** Expanded forms used inside this word (e.g. `ue` from `q<ue>`). */
  expansions: string[];
}

export interface LineRecord {
  index: number;
  folioIndex: number;
  folioId: string;
  blockIndex: number;
  lineNumber?: string;
  type: BlockType;
  columns: number;
  language?: string;
  words: LineWord[];
  /** Diplomatic text of the whole line (spaces between words). */
  diplomatic: string;
  /** Final token is a line-end hyphen. */
  endsWithHyphen: boolean;
  /** This is the last line of its column envelope ({CB.} close) or folio side. */
  closesColumn: boolean;
  closesFolio: boolean;
  tokens: Token[];
}

const WORD_TYPES = new Set([
  "text",
  "expansion",
  "superscript",
  "scribal_insertion",
  "editorial_insertion",
  "reconstructed_text",
  "drop_initial",
]);

const cache = new WeakMap<ParsedManuscript, LineRecord[]>();

function tokenLanguage(token: Token): string | undefined {
  const layers = token.envLayers;
  if (!layers) return undefined;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].type === "language_span") return layers[i].code;
  }
  return undefined;
}

function newWord(): LineWord {
  return {
    diplomatic: "",
    reading: "",
    hasExpansion: false,
    hasSuperscript: false,
    hasPrefixSeparator: false,
    expansions: [],
  };
}

function wordsOfBlock(tokens: Token[]): LineWord[] {
  const words: LineWord[] = [];
  let cur = newWord();
  const flush = () => {
    if (cur.diplomatic.trim() || cur.reading.trim()) words.push(cur);
    cur = newWord();
  };
  for (const token of tokens) {
    if (token.type === "prefix_separator") {
      cur.diplomatic += "[+]";
      cur.hasPrefixSeparator = true;
      continue;
    }
    if (!WORD_TYPES.has(token.type)) {
      flush();
      continue;
    }
    const lang = tokenLanguage(token);
    if (token.type === "expansion") {
      cur.diplomatic += token.raw;
      cur.reading += token.value;
      cur.hasExpansion = true;
      cur.expansions.push(token.value);
      cur.lang = cur.lang ?? lang;
      continue;
    }
    if (token.type === "superscript") {
      cur.diplomatic += token.raw;
      cur.reading += token.value;
      cur.hasSuperscript = true;
      cur.lang = cur.lang ?? lang;
      continue;
    }
    const diplomatic = token.type === "text" ? token.raw : token.value;
    const reading = token.type === "text" ? token.normalized ?? token.value : token.value;
    // Whitespace inside text tokens separates words.
    const dParts = diplomatic.split(/(\s+)/);
    const rParts = reading.split(/(\s+)/);
    if (dParts.length === 1 && rParts.length === 1) {
      cur.diplomatic += diplomatic;
      cur.reading += reading;
      cur.lang = cur.lang ?? lang;
      continue;
    }
    for (let i = 0; i < dParts.length; i++) {
      const d = dParts[i];
      const r = rParts[i] ?? d;
      if (/^\s+$/.test(d)) {
        flush();
      } else if (d) {
        cur.diplomatic += d;
        cur.reading += r;
        cur.lang = cur.lang ?? lang;
      }
    }
  }
  flush();
  return words;
}

/** Lines in document order with column/folio closing flags from the spatial tree. */
export function getLineIndex(parsed: ParsedManuscript): LineRecord[] {
  const hit = cache.get(parsed);
  if (hit) return hit;
  const lines: LineRecord[] = [];
  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    const closesColumnAt = new Set<number>();
    try {
      const spatial = buildSpatialFolio(folio);
      for (const cb of spatial.columnBlocks) {
        const byTrack = new Map<string, number>();
        for (const line of cb.lines) {
          const bi = folio.blocks.indexOf(line.block);
          if (bi >= 0) byTrack.set(line.track, bi);
        }
        byTrack.forEach((bi) => closesColumnAt.add(bi));
      }
    } catch {
      // Spatial tree is best-effort; without it only folio closes are flagged.
    }
    let lastProse = -1;
    for (let bi = 0; bi < folio.blocks.length; bi++) {
      const t = folio.blocks[bi].type;
      if (t !== "diagram" && t !== "initial_container") lastProse = bi;
    }
    for (let bi = 0; bi < folio.blocks.length; bi++) {
      const block = folio.blocks[bi];
      const words = wordsOfBlock(block.tokens);
      const last = [...block.tokens].reverse().find((t) => !(t.type === "text" && !t.value.trim()));
      lines.push({
        index: lines.length,
        folioIndex: fi,
        folioId: folio.id,
        blockIndex: bi,
        lineNumber: block.lineNumber,
        type: block.type,
        columns: block.columns,
        language: block.language,
        words,
        diplomatic: words.map((w) => w.diplomatic).join(" "),
        endsWithHyphen: last?.type === "hyphen" || (last?.type === "text" && /-$/.test(last.value)),
        closesColumn: closesColumnAt.has(bi),
        closesFolio: bi === lastProse,
        tokens: block.tokens,
      });
    }
  }
  cache.set(parsed, lines);
  return lines;
}

/** Body text lines only (prose/rubric/language spans), excluding glosses and addenda. */
export function isBodyLine(line: LineRecord): boolean {
  return line.type === "prose" || line.type === "rubric" || line.type === "language_span";
}
