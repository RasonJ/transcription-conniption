import type { ManuscriptBlock, Token } from "../constants/manuscript";

const SKIP_TYPES = new Set([
  "scribal_deletion",
  "editorial_deletion",
  "calderon",
  "calderon_two",
  "calderon_three",
  "otiose_mark",
  "hyphen",
  "superscript",
  "scribal_punctuation",
]);

const LEGACY_DIACRITIC_MARKS = /@\??['‘'’~`^]/g;
/** Stray @ or prime stacks before structural markup (lexer/parser guard). */
const MALFORMED_DIACRITIC_RUN = /@[@'~^]{2,}|[a-zA-Z]{2,}@[a-zA-Z]/;
const EXTRA_WHITESPACE_RE = /\s+/g;
const TEXT_V_RE = /\bv\b/g;
const TEXT_I_RE = /\bi\b(?=[aeiouáéíóú])/gi;
const TEXT_UU_RE = /uu/g;
const TEXT_NN_RE = /nn/g;

function cleanDiplomaticResidual(text: string): string {
  return text.replace(LEGACY_DIACRITIC_MARKS, "").replace(MALFORMED_DIACRITIC_RUN, "");
}

/** Strip malformed nested diacritic markers before normalized reading export. */
export function sanitizeMalformedDiacriticRuns(text: string): string {
  return text.replace(MALFORMED_DIACRITIC_RUN, "");
}

/** Modernized reading string from a token stream (expansions inline, markup stripped). */
export function renderNormalizedText(tokens: Token[]): string {
  const buffer: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const type = token.type;

    if (type === "scribal_deletion" || type === "editorial_deletion" || SKIP_TYPES.has(type)) {
      continue;
    }
    if (type === "figure_anchor") {
      buffer.push(` [${token.value}] `);
      continue;
    }
    if (type === "blank_space") {
      buffer.push(" [...] ");
      continue;
    }
    if (type === "scribal_punctuation") {
      buffer.push(" ");
      continue;
    }
    if (type === "citation_wrap") {
      continue;
    }
    if (type === "drop_initial" || type === "expansion") {
      buffer.push(token.value);
      continue;
    }
    if (type === "reconstructed_text") {
      buffer.push(token.value);
      continue;
    }
    if (type === "illegible_text") {
      buffer.push(" □□ ");
      continue;
    }
    if (type === "missing_fragment") {
      continue;
    }
    if (type === "mechanical_lacuna") {
      buffer.push(" ");
      continue;
    }
    if (type === "scribal_insertion" || type === "editorial_insertion") {
      buffer.push(` ${token.value} `);
      continue;
    }

    let val = token.normalized ?? token.value;
    if (type === "text") {
      val = cleanDiplomaticResidual(val);
      if (!token.normalized && token.raw !== token.value) {
        val = cleanDiplomaticResidual(token.raw);
      }
    }
    buffer.push(normalizeOrthography(val));
  }

  return buffer.join("").replace(EXTRA_WHITESPACE_RE, " ").trim();
}

export function renderNormalizedBlock(block: ManuscriptBlock): string {
  if (block.type === "diagram" || block.type === "initial_container") {
    return "";
  }
  return renderNormalizedText(block.tokens);
}

/** Project-specific paleographic normalizations for student editions. */
export function normalizeOrthography(text: string): string {
  return text
    .replace(TEXT_V_RE, "u")
    .replace(TEXT_I_RE, (m) => m.toLowerCase())
    .replace(TEXT_UU_RE, "v")
    .replace(TEXT_NN_RE, "ñ");
}
