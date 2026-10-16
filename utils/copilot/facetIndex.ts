import type {
  BlockType,
  ParsedManuscript,
  Token,
  TokenType,
} from "../../constants/manuscript";
import { manuscriptIdentityFromSource } from "../manuscriptIdentity";

/** Bump when facet semantics change so cached indexes are discarded. */
export const FACET_VERSION = 1;

const CACHE_LIMIT = 4;

/** Token types worth keeping occurrence refs for (plain text would dominate memory). */
const SKIP_REF_TYPES = new Set<TokenType>(["text", "env_open", "env_close"]);

/** Token types that contribute visible characters to a word. */
const WORD_TYPES = new Set<TokenType>([
  "text",
  "expansion",
  "superscript",
  "scribal_insertion",
  "editorial_insertion",
  "reconstructed_text",
  "drop_initial",
]);

const RE_HAND_PREFIX = /^\^?(\d+)#/;
const RE_WS = /(\s+)/;

export interface TokenRef {
  folioIndex: number;
  folioId: string;
  blockIndex: number;
  tokenIndex: number;
  lineNumber?: string;
}

export interface BlockRef {
  folioIndex: number;
  folioId: string;
  blockIndex: number;
  lineNumber?: string;
}

/** Struct-of-arrays word list (surfaces from the hyphen-stitched flow). */
export interface WordStream {
  count: number;
  surfaces: string[];
  folioIndex: number[];
}

export interface LanguageFacet {
  tokens: number;
  words: number;
  /** Contiguous runs where this language starts. */
  spans: TokenRef[];
}

export interface FolioFacet {
  id: string;
  hasCatchword: boolean;
  hasSignature: boolean;
  headingCount: number;
}

export interface FacetIndex {
  witnessHash: string;
  facetVersion: number;
  folioIds: string[];
  words: WordStream;
  /** Words counted by walking tokens (used for language ratios). */
  walkedWords: number;
  tokenTypeCounts: Map<TokenType, { total: number; byFolio: Map<string, number> }>;
  tokenRefs: Map<TokenType, TokenRef[]>;
  /** Hand id (e.g. "2") → tokens carrying it. */
  handRefs: Map<string, TokenRef[]>;
  languageSpans: Map<string, LanguageFacet>;
  /** initialDepth → drop-initial tokens. */
  initialDepth: Map<number, TokenRef[]>;
  blockTypeCounts: Map<BlockType, number>;
  blockRefs: Map<BlockType, BlockRef[]>;
  folios: Map<string, FolioFacet>;
}

const byRef = new WeakMap<ParsedManuscript, FacetIndex>();
const bySource = new Map<string, FacetIndex>();

export function clearFacetCache(): void {
  bySource.clear();
}

/**
 * Language mnemonic for a token: innermost language span in its env stack.
 * `block.language` is not used because it covers the whole line even when the span closes early.
 */
function tokenLanguage(token: Token): string | undefined {
  const layers = token.envLayers;
  if (layers) {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].type === "language_span") return layers[i].code;
    }
  }
  return undefined;
}

/** Hand id for a token: explicit `hand`, else the `^N#` prefix in reconstructed text. */
export function tokenHand(token: Token): string | undefined {
  if (token.hand) return token.hand;
  if (token.type === "reconstructed_text") {
    return token.value.match(RE_HAND_PREFIX)?.[1];
  }
  return undefined;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function hashStep(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function languageFacet(map: Map<string, LanguageFacet>, code: string): LanguageFacet {
  let facet = map.get(code);
  if (!facet) {
    facet = { tokens: 0, words: 0, spans: [] };
    map.set(code, facet);
  }
  return facet;
}

function buildFacetIndexUncached(parsed: ParsedManuscript, identity?: string): FacetIndex {
  const folioIds: string[] = [];
  const surfaces: string[] = [];
  const wordFolio: number[] = [];
  const tokenTypeCounts: FacetIndex["tokenTypeCounts"] = new Map();
  const tokenRefs: FacetIndex["tokenRefs"] = new Map();
  const handRefs: FacetIndex["handRefs"] = new Map();
  const languageSpans: FacetIndex["languageSpans"] = new Map();
  const initialDepth: FacetIndex["initialDepth"] = new Map();
  const blockTypeCounts: FacetIndex["blockTypeCounts"] = new Map();
  const blockRefs: FacetIndex["blockRefs"] = new Map();
  const folios: FacetIndex["folios"] = new Map();
  let walkedWords = 0;
  let hash = 5381;

  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    folioIds.push(folio.id);
    hash = hashStep(hash, `[${folio.id}]`);
    folios.set(folio.id, {
      id: folio.id,
      hasCatchword: Boolean(folio.catchword),
      hasSignature: Boolean(folio.signature),
      headingCount: folio.headings.length,
    });

    const flow = folio.reconstructedFlow ?? "";
    if (flow) {
      const parts = flow.split(/\s+/);
      for (let p = 0; p < parts.length; p++) {
        const w = parts[p];
        if (w.length > 0 && /[\p{L}\p{N}]/u.test(w)) {
          surfaces.push(w);
          wordFolio.push(fi);
        }
      }
    }

    for (let bi = 0; bi < folio.blocks.length; bi++) {
      const block = folio.blocks[bi];
      blockTypeCounts.set(block.type, (blockTypeCounts.get(block.type) ?? 0) + 1);
      push(blockRefs, block.type, {
        folioIndex: fi,
        folioId: folio.id,
        blockIndex: bi,
        lineNumber: block.lineNumber,
      });

      let current = "";
      let currentLang: string | undefined;
      let spanLang: string | undefined;

      const flushWord = () => {
        if (current.length === 0) return;
        walkedWords++;
        if (currentLang) languageFacet(languageSpans, currentLang).words++;
        current = "";
        currentLang = undefined;
      };

      for (let ti = 0; ti < block.tokens.length; ti++) {
        const token = block.tokens[ti];
        hash = hashStep(hash, token.type);
        hash = hashStep(hash, token.raw);

        const ref: TokenRef = {
          folioIndex: fi,
          folioId: folio.id,
          blockIndex: bi,
          tokenIndex: ti,
          lineNumber: block.lineNumber,
        };

        let counts = tokenTypeCounts.get(token.type);
        if (!counts) {
          counts = { total: 0, byFolio: new Map() };
          tokenTypeCounts.set(token.type, counts);
        }
        counts.total++;
        counts.byFolio.set(folio.id, (counts.byFolio.get(folio.id) ?? 0) + 1);

        if (!SKIP_REF_TYPES.has(token.type)) push(tokenRefs, token.type, ref);

        const hand = tokenHand(token);
        if (hand) push(handRefs, hand, ref);

        if (token.type === "drop_initial") {
          push(initialDepth, token.initialDepth ?? 1, ref);
        }

        const lang = tokenLanguage(token);
        if (lang !== spanLang) {
          if (lang) languageFacet(languageSpans, lang).spans.push(ref);
          spanLang = lang;
        }
        if (lang && WORD_TYPES.has(token.type)) languageFacet(languageSpans, lang).tokens++;

        // de[+]nostados is one lexical item: the separator joins rather than splits.
        if (token.type === "prefix_separator") continue;
        if (!WORD_TYPES.has(token.type)) {
          flushWord();
          continue;
        }
        const text = token.type === "text" ? token.normalized ?? token.value : token.value;
        const pieces = text.split(RE_WS);
        for (let pi = 0; pi < pieces.length; pi++) {
          const piece = pieces[pi];
          if (piece.length === 0) continue;
          if (/^\s+$/.test(piece)) {
            flushWord();
          } else {
            current += piece;
            currentLang = currentLang ?? lang;
          }
        }
      }
      flushWord();
    }
  }

  return {
    witnessHash: identity ?? `fx_${hash.toString(36)}`,
    facetVersion: FACET_VERSION,
    folioIds,
    words: { count: surfaces.length, surfaces, folioIndex: wordFolio },
    walkedWords,
    tokenTypeCounts,
    tokenRefs,
    handRefs,
    languageSpans,
    initialDepth,
    blockTypeCounts,
    blockRefs,
    folios,
  };
}

/**
 * One linear pass over a parsed witness. Cached by object reference, and by manuscript
 * identity hash when `sourceText` is supplied (survives re-parses of unchanged text).
 */
export function buildFacetIndex(
  parsed: ParsedManuscript,
  options?: { sourceText?: string },
): FacetIndex {
  const hit = byRef.get(parsed);
  if (hit) return hit;

  const identity =
    options?.sourceText !== undefined
      ? `${FACET_VERSION}:${manuscriptIdentityFromSource(options.sourceText)}`
      : undefined;

  if (identity) {
    const cached = bySource.get(identity);
    if (cached) {
      bySource.delete(identity);
      bySource.set(identity, cached);
      byRef.set(parsed, cached);
      return cached;
    }
  }

  const built = buildFacetIndexUncached(parsed, identity);
  byRef.set(parsed, built);

  if (identity) {
    bySource.set(identity, built);
    if (bySource.size > CACHE_LIMIT) {
      const oldest = bySource.keys().next().value;
      if (oldest !== undefined) bySource.delete(oldest);
    }
  }
  return built;
}
