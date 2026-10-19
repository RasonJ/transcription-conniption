import type { ManuscriptBlock, Token } from "@/constants/manuscript";
import { formatTokenDisplayGrapheme } from "@/utils/formatTokenDisplayGrapheme";
import { normalizeDisplayDiacritics } from "@/utils/legacyDiacritics";
import {
  convertHsmsToMufiGlyphs,
  MUFI_PALEOGRAPHIC_MAP,
  PATTERN_KEYS_LONGEST_FIRST,
} from "@/utils/mufiCharacterMap";

export const FS = 16;
export const LH = 24;

export const RUBRIC_FILL = "#9b2217";
export const PROSE_FILL = "#1a0a05";
export const GLOSS_FILL = "#4a3060";
export const FOREIGN_FILL = "#1a3a5a";
export const INSERT_FILL = "#2a6e22";
export const EDITORIAL_FILL = "#7a5500";
export const FAINT_FILL = "#a08060";

export interface DisplaySettings {
  showExpanded: boolean;
  showDeletions: boolean;
  suppressOtioseMarks: boolean;
  useNormalizedDiacritics: boolean;
  /** Tier-2 MUFI graphemes on the parchment canvas (HSMS ASCII stays in storage). */
  useMufiGraphemes?: boolean;
  /** Prefer PUA/precomposed MUFI chars when a MUFI font is loaded; else decomposed. */
  usePuaFont?: boolean;
  /**
   * Scholarly line numbers in the left gutter (never prepended into copyable body text).
   * Defaults to true when omitted.
   */
  showLineNumbers?: boolean;
}

export interface Seg {
  text: string;
  fill: string;
  italic: boolean;
  bold: boolean;
  fs: number;
  strike: boolean;
  underline: boolean;
  /** Raised abbreviation (<<…>>, <er>, etc.) — does not expand line height. */
  super: boolean;
}

export function seg(overrides: Partial<Seg> & { text: string; fill: string }): Seg {
  return {
    italic: false,
    bold: false,
    fs: FS,
    strike: false,
    underline: false,
    super: false,
    ...overrides,
  };
}

function blockFill(t: ManuscriptBlock["type"]): string {
  if (t === "rubric" || t === "heading") return RUBRIC_FILL;
  if (t === "gloss") return GLOSS_FILL;
  if (t === "language_span") return FOREIGN_FILL;
  return PROSE_FILL;
}

function applyTokenEnvLayers(s: Seg, tok: Token, blockType: ManuscriptBlock["type"]): Seg {
  if (tok.envLayers?.some((l) => l.type === "heading")) {
    return { ...s, fill: RUBRIC_FILL, bold: true, fs: FS * 1.15 };
  }
  if (tok.envLayers?.some((l) => l.type === "rubric")) {
    return { ...s, fill: RUBRIC_FILL, bold: true };
  }
  if (tok.envLayers?.some((l) => l.type === "language_span")) {
    return { ...s, fill: FOREIGN_FILL, italic: true };
  }
  if (blockType === "heading") return { ...s, fill: RUBRIC_FILL, bold: true, fs: FS * 1.15 };
  if (blockType === "rubric") return { ...s, fill: RUBRIC_FILL, bold: true };
  if (blockType === "language_span") return { ...s, fill: FOREIGN_FILL, italic: true };
  if (blockType === "gloss") return { ...s, fill: GLOSS_FILL, italic: true, fs: FS * 0.85 };
  return s;
}

function tokenDisplayValue(tok: Token, s: DisplaySettings): string {
  if (s.useNormalizedDiacritics && tok.normalized) return tok.normalized;
  return tok.value ?? "";
}

function applyMufiDisplay(text: string, s: DisplaySettings, raw?: string): string {
  if (!s.useMufiGraphemes) return text;
  return formatTokenDisplayGrapheme(text, s, raw);
}

/**
 * Consume a paleographic HSMS pattern starting at `start` by matching concatenated
 * `token.raw` values (text + <expansions> + <<supers>>). Returns glyph + tokens used.
 */
function matchMufiPatternAt(
  tokens: Token[],
  start: number,
  s: DisplaySettings,
): { glyph: string; consume: number } | null {
  if (!s.useMufiGraphemes) return null;
  let window = "";
  const maxLook = Math.min(tokens.length, start + 6);
  for (let end = start; end < maxLook; end++) {
    window += tokens[end].raw ?? tokens[end].value ?? "";
    for (const pattern of PATTERN_KEYS_LONGEST_FIRST) {
      if (window === pattern && MUFI_PALEOGRAPHIC_MAP[pattern]) {
        const entry = MUFI_PALEOGRAPHIC_MAP[pattern];
        const glyph = (s.usePuaFont ?? true) ? entry.char : entry.decomposed;
        return { glyph, consume: end - start + 1 };
      }
    }
    // Prefix check — if no pattern starts with window, stop early
    if (!PATTERN_KEYS_LONGEST_FIRST.some((p) => p.startsWith(window))) break;
  }
  return null;
}

export function tokenToSegs(
  tok: Token,
  blockType: ManuscriptBlock["type"],
  s: DisplaySettings,
): Seg[] {
  const base = blockFill(blockType);
  let v = tokenDisplayValue(tok, s);
  if (s.useNormalizedDiacritics) {
    v = normalizeDisplayDiacritics(v);
  }
  v = applyMufiDisplay(v, s, tok.raw);

  switch (tok.type) {
    case "text": {
      const out = seg({ text: v, fill: base });
      return [applyTokenEnvLayers(out, tok, blockType)];
    }
    case "citation_wrap":
      return [seg({ text: v, fill: FAINT_FILL, italic: true, fs: FS * 0.95 })];
    case "scribal_punctuation": {
      const punct = v === "$." || v === "$;" ? ";" : v;
      return [seg({ text: punct, fill: RUBRIC_FILL })];
    }
    case "expansion":
      if (s.showExpanded) {
        return [
          applyTokenEnvLayers(
            seg({
              text: v,
              fill: "#804000",
              italic: true,
              super: true,
              fs: FS * 0.72,
            }),
            tok,
            blockType,
          ),
        ];
      }
      return [];
    case "superscript":
      return [seg({ text: v, fill: base, fs: FS * 0.68, super: true })];
    case "scribal_deletion":
      if (!s.showDeletions) return [];
      return [seg({ text: `(${v})`, fill: FAINT_FILL, strike: true })];
    case "editorial_deletion":
      if (!s.showDeletions) return [];
      return [seg({ text: v, fill: EDITORIAL_FILL, strike: true })];
    case "scribal_insertion":
      return [seg({ text: `/${v}\\_`, fill: INSERT_FILL })];
    case "reconstructed_text":
      return [
        applyTokenEnvLayers(
          seg({ text: `[${v}]`, fill: INSERT_FILL, italic: true }),
          tok,
          blockType,
        ),
      ];
    case "illegible_text":
      return [seg({ text: "\u25A1\u25A1", fill: FAINT_FILL })];
    case "missing_fragment":
      return [seg({ text: "\u2026", fill: FAINT_FILL, italic: true })];
    case "mechanical_lacuna":
      return [seg({ text: " ", fill: base })];
    case "editorial_insertion":
    case "prefix_separator":
    case "non_sequitur":
      return [seg({ text: `[${v}]`, fill: EDITORIAL_FILL, italic: true })];
    case "calderon":
      return [seg({ text: "¶", fill: RUBRIC_FILL, bold: true })];
    case "calderon_two":
      return [];
    case "calderon_three":
      return [seg({ text: "¶¶¶", fill: RUBRIC_FILL, bold: true })];
    case "blank_space":
      return [seg({ text: /^\[\s*\]$/.test(tok.raw ?? "") ? " " : "   ", fill: base })];
    case "otiose_mark":
      if (s.suppressOtioseMarks) return [];
      return [seg({ text: "~", fill: FAINT_FILL })];
    case "hyphen":
      return [seg({ text: "-", fill: base })];
    case "drop_initial":
    case "figure_anchor":
    case "env_open":
    case "env_close":
      return [];
    default:
      return v ? [seg({ text: v, fill: base })] : [];
  }
}

function segStyleKey(s: Seg): string {
  return `${s.fill}|${s.fs}|${s.italic}|${s.bold}|${s.strike}|${s.underline}|${s.super}`;
}

/**
 * Removes a duplicated drop-cap grapheme from the start of the first body segment(s).
 * Guards against lines where lexical tokens still carry the initial letter cluster.
 */
export function stripDropCapPrefixFromSegs(segs: Seg[], capGrapheme: string): Seg[] {
  if (!capGrapheme || segs.length === 0) return segs;

  const cloned = segs.map((s) => ({ ...s }));
  let toStrip = capGrapheme;

  for (let i = 0; i < cloned.length && toStrip.length > 0; i++) {
    const text = cloned[i].text;
    if (!text) continue;

    if (text.startsWith(toStrip)) {
      cloned[i].text = text.slice(toStrip.length);
      toStrip = "";
      break;
    }
    if (toStrip.startsWith(text)) {
      toStrip = toStrip.slice(text.length);
      cloned[i].text = "";
    }
  }

  const trimmed = cloned.filter((s) => s.text.length > 0);
  if (trimmed.length > 0) {
    trimmed[0] = { ...trimmed[0], text: trimmed[0].text.trimStart() };
  }
  return trimmed;
}

export function coalesceSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s.text) continue;
    const prev = out[out.length - 1];
    if (prev && segStyleKey(prev) === segStyleKey(s)) {
      out[out.length - 1] = { ...prev, text: prev.text + s.text };
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function blockToSegs(block: ManuscriptBlock, settings: DisplaySettings): Seg[] {
  const bodyToks = block.tokens.filter(
    (t) => t.type !== "drop_initial" && t.type !== "figure_anchor",
  );
  const lineSegs: Seg[] = [];

  for (let i = 0; i < bodyToks.length; ) {
    const mufiHit = matchMufiPatternAt(bodyToks, i, settings);
    if (mufiHit) {
      lineSegs.push(
        applyTokenEnvLayers(
          seg({ text: mufiHit.glyph, fill: blockFill(block.type) }),
          bodyToks[i],
          block.type,
        ),
      );
      i += mufiHit.consume;
      continue;
    }
    lineSegs.push(...tokenToSegs(bodyToks[i], block.type, settings));
    i += 1;
  }

  if (block.type === "rubric") {
    return lineSegs.map((s) => ({ ...s, fill: RUBRIC_FILL, bold: true }));
  }
  if (block.type === "heading") {
    return lineSegs.map((s) => ({ ...s, fill: RUBRIC_FILL, bold: true, fs: FS * 1.15 }));
  }
  return lineSegs;
}

/** Re-export for callers / tests that convert whole HSMS lines for canvas display. */
export { convertHsmsToMufiGlyphs };
