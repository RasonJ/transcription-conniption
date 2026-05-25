import type { FigureMnemonic, Token, TokenType } from "../constants/manuscript";
import { FIGURE_ANCHOR_SOURCE, type FigureIdAllocator } from "./figureAnchors";
import {
  CEDILLA_GRAPHEME_CLUSTER_SOURCE,
  DIACRITIC_CLUSTER_SOURCE,
  DIACRITIC_WITH_TAIL_EXPANSIONS_SOURCE,
  EMBEDDED_DIACRITIC_WORD_SOURCE,
  NASAL_GRAPHEME_CLUSTER_SOURCE,
  resolveDiacriticWord,
} from "./legacyDiacritics";
import { toStickyRegex } from "./regexUtils";

export const PAREN_OPEN_SENTINEL = "\u2016P_OPEN\u2016";
export const PAREN_CLOSE_SENTINEL = "\u2016P_CLOSE\u2016";

export function preprocessSentinels(line: string): string {
  return line
    .replace(/\(\s*\(/g, PAREN_OPEN_SENTINEL)
    .replace(/\)\s*\)/g, PAREN_CLOSE_SENTINEL);
}

type TokenRule = { type: TokenType; regex: RegExp; diacritic?: boolean; skipIfAngle?: boolean };

/**
 * Rule order matters: paleographic brackets and lacunae before diacritic clusters,
 * so patterns like `d[ ]estado` or `a[ ]que` are not split by greedy diacritic regexes.
 */
const TOKEN_RULES: TokenRule[] = [
  { type: "scribal_punctuation", regex: /\$;|\$\./ },
  { type: "figure_anchor", regex: new RegExp(FIGURE_ANCHOR_SOURCE) },
  { type: "blank_space", regex: /\[\s*\]/ },
  { type: "blank_space", regex: /\{BLNK(?:\.|:\s*([^}]*))?\}/ },
  { type: "superscript", regex: /<<([^>]+)>>/ },
  { type: "expansion", regex: /<([^>]+)>/ },
  { type: "reconstructed_text", regex: /\[\s*\*([^\]]+)\]/ },
  { type: "illegible_text", regex: /\[\s*(\?{2,3})\s*\]/ },
  { type: "missing_fragment", regex: /\?{2,3}/ },
  { type: "scribal_deletion", regex: /\(\^([^\)]+)\)/ },
  { type: "editorial_deletion", regex: /\(([^\)]+)\)/ },
  { type: "scribal_insertion", regex: /\[\^([^\]]+)\]/ },
  { type: "editorial_insertion", regex: /\[(?!\s*[\*\^])([^\]]+)\]/ },
  { type: "calderon_three", regex: /%3/ },
  { type: "calderon_two", regex: /%2/ },
  { type: "calderon", regex: /%/ },
  { type: "text", regex: new RegExp(DIACRITIC_WITH_TAIL_EXPANSIONS_SOURCE), diacritic: true },
  {
    type: "text",
    regex: new RegExp(EMBEDDED_DIACRITIC_WORD_SOURCE),
    diacritic: true,
    skipIfAngle: true,
  },
  { type: "text", regex: new RegExp(DIACRITIC_CLUSTER_SOURCE), diacritic: true },
  { type: "text", regex: new RegExp(NASAL_GRAPHEME_CLUSTER_SOURCE), diacritic: true },
  { type: "text", regex: new RegExp(CEDILLA_GRAPHEME_CLUSTER_SOURCE), diacritic: true },
  { type: "otiose_mark", regex: /~/ },
  { type: "hyphen", regex: /-/ },
  { type: "text", regex: /[A-Za-z][A-Za-z0-9@'.]*/ },
  { type: "text", regex: /[0-9]+/ },
  { type: "text", regex: /\s+/ },
  { type: "text", regex: /[^<>\(\)\[\]%\{\}~\-\$\u2016\sA-Za-z0-9]+/ },
];

const STICKY_RULES = TOKEN_RULES.map((r) => ({
  type: r.type,
  diacritic: r.diacritic,
  skipIfAngle: r.skipIfAngle,
  regex: toStickyRegex(r.regex.source, r.regex.flags),
}));

function pushToken(
  tokens: Token[],
  type: TokenType,
  value: string,
  raw: string,
  extras?: {
    hand?: string;
    normalized?: string;
    figureId?: string;
    figureType?: FigureMnemonic;
  },
): void {
  tokens.push({
    type,
    value,
    raw,
    ...(extras?.hand ? { hand: extras.hand } : {}),
    ...(extras?.normalized ? { normalized: extras.normalized } : {}),
    ...(extras?.figureId ? { figureId: extras.figureId } : {}),
    ...(extras?.figureType ? { figureType: extras.figureType } : {}),
  });
}

const RE_VOWEL_MATCH = /[aeiouAEIOUáàâãéêíóôõúnN]$/;
const RE_CONSONANT_MATCH = /[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]$/;

/**
 * Binds a trailing otiose tilde to the preceding vowel grapheme when word rules split early
 * (e.g. `ma` + `~` + `dar` → `mã` + `dar`). Mirrors hsms-tmp TextRun nasal merge.
 */
export function mergeDetachedDiacriticMarks(tokens: Token[]): Token[] {
  const out: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];

    if (
      tok.type === "text" &&
      next?.type === "otiose_mark" &&
      next.value === "~" &&
      tok.value.length > 0
    ) {
      const lastChar = tok.value.slice(-1);
      if (lastChar.length > 0 && RE_VOWEL_MATCH.test(lastChar)) {
        const prefix = tok.value.slice(0, -1);
        const cluster = `${lastChar}~`;
        const resolvedCluster = resolveDiacriticWord(cluster);
        const mergedValue = prefix + resolvedCluster;
        const mergedRaw = tok.raw + next.raw;
        out.push({
          ...tok,
          value: mergedValue,
          raw: mergedRaw,
          normalized: mergedValue,
        });
        i++;
        continue;
      }
    }

    if (
      tok.type === "text" &&
      next?.type === "text" &&
      next.value === "'" &&
      tok.value.length > 0
    ) {
      const lastChar = tok.value.slice(-1);
      if (lastChar.length > 0 && RE_CONSONANT_MATCH.test(lastChar)) {
        const prefix = tok.value.slice(0, -1);
        const cluster = `${lastChar}'`;
        const resolvedCluster = resolveDiacriticWord(cluster);
        const mergedValue = prefix + resolvedCluster;
        const mergedRaw = tok.raw + next.raw;
        out.push({
          ...tok,
          value: mergedValue,
          raw: mergedRaw,
          normalized: mergedValue,
        });
        i++;
        continue;
      }
    }

    out.push(tok);
  }

  return out;
}

export function tokenizeString(str: string, figureAllocator?: FigureIdAllocator): Token[] {
  const workingString = preprocessSentinels(str);
  const tokens: Token[] = [];
  let index = 0;
  const len = workingString.length;

  while (index < len) {
    if (workingString.startsWith(PAREN_OPEN_SENTINEL, index)) {
      pushToken(tokens, "citation_wrap", "((", "((");
      index += PAREN_OPEN_SENTINEL.length;
      continue;
    }
    if (workingString.startsWith(PAREN_CLOSE_SENTINEL, index)) {
      pushToken(tokens, "citation_wrap", "))", "))");
      index += PAREN_CLOSE_SENTINEL.length;
      continue;
    }

    let matched = false;

    for (const rule of STICKY_RULES) {
      rule.regex.lastIndex = index;
      const match = rule.regex.exec(workingString);
      if (!match) {
        continue;
      }

      const raw = match[0];
      let value = match[1] ?? raw;
      let hand: string | undefined;
      let normalized: string | undefined;

      if (rule.diacritic) {
        if (rule.skipIfAngle && raw.includes("<")) {
          continue;
        }
        normalized = resolveDiacriticWord(raw);
        value = normalized;
        pushToken(tokens, rule.type, value, raw, { normalized });
        index += raw.length;
        matched = true;
        break;
      }

      if (rule.type === "figure_anchor") {
        const figureType = (match[1] ?? "ILL").toUpperCase() as FigureMnemonic;
        const captionText = (match[2] ?? "").trim();
        const figureId = figureAllocator?.next() ?? `unfoliated_fig_${tokens.length + 1}`;
        pushToken(tokens, "figure_anchor", captionText, raw, { figureId, figureType });
        index += raw.length;
        matched = true;
        break;
      }

      if (rule.type === "blank_space") {
        if (/^\[\s*\]$/.test(raw)) {
          pushToken(tokens, "blank_space", " ", raw);
        } else {
          const footprint = match[1]?.trim();
          value = footprint || "blank";
          pushToken(tokens, "blank_space", value, raw);
        }
        index += raw.length;
        matched = true;
        break;
      }

      if (rule.type === "otiose_mark" || rule.type === "scribal_punctuation") {
        pushToken(tokens, rule.type, raw, raw);
        index += raw.length;
        matched = true;
        break;
      }

      if (rule.type === "scribal_insertion" && value.includes("#")) {
        const handMatch = value.match(/^(\d+)#(.+)/);
        if (handMatch) {
          hand = handMatch[1];
          value = handMatch[2];
        }
      }

      pushToken(tokens, rule.type, value, raw, hand ? { hand } : undefined);
      index += raw.length;
      matched = true;
      break;
    }

    if (!matched) {
      const ch = workingString[index];
      if (ch !== "\u2016") {
        pushToken(tokens, "text", ch, ch);
      }
      index++;
    }
  }

  return mergeDetachedDiacriticMarks(tokens);
}
