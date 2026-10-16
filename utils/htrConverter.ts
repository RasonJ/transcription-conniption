/**
 * HTR → HSMS conversion rules ported from gu/HSMS-tools/HTR_to_HSMS/HTR_to_HSMS.R
 * (ordered Perl-compatible substitutions for Transkribus / eScriptorium exports).
 *
 * Rules apply sequentially — order matters (specific expansions before general marks).
 */

export type HtrRule = {
  id: number;
  pattern: RegExp;
  replacement: string;
  description: string;
  /** When set, skip the regex if this character is absent from the input. */
  triggerChar?: string;
};

/** Core glyph / abbreviation substitutions (ordered). */
export const HTR_SUBSTITUTION_RULES: HtrRule[] = [
  {
    id: 0,
    pattern: /--------------- .* ---------------\r?\n/g,
    replacement: "",
    description: "Eliminar la línea separadora de sección",
    triggerChar: "-",
  },
  {
    id: 1,
    pattern: /\{CB([0-9]+)\./g,
    replacement: "\n{CB$1.\n",
    description: "Añadir saltos de línea antes y después de la etiqueta CB",
    triggerChar: "{",
  },
  {
    id: 2,
    pattern: /\{HD([0-9]*)\./g,
    replacement: "\n{HD$1.",
    description: "Añadir saltos de línea antes de la etiqueta HD",
    triggerChar: "{",
  },
  {
    id: 3,
    pattern: /(\[fol\.[^\r\n\]]*\])/g,
    replacement: "\n$1\n",
    description: "Colocar la etiqueta [fol.] en una línea independiente",
    triggerChar: "[",
  },
  { id: 4, pattern: /⊂/g, replacement: "<", description: "Convertir ⊂ en <", triggerChar: "⊂" },
  { id: 5, pattern: /⊃/g, replacement: ">", description: "Convertir ⊃ en >", triggerChar: "⊃" },
  { id: 6, pattern: /＜/g, replacement: "<", description: "Convertir ＜ fullwidth en <", triggerChar: "＜" },
  { id: 7, pattern: /＞/g, replacement: ">", description: "Convertir ＞ fullwidth en >", triggerChar: "＞" },
  { id: 8, pattern: /\(\(/g, replacement: "≺", description: "Convertir (( en ≺", triggerChar: "(" },
  { id: 9, pattern: /\)\)/g, replacement: "≻", description: "Convertir )) en ≻", triggerChar: ")" },
  { id: 10, pattern: /%/g, replacement: "¶", description: "Convertir % en ¶", triggerChar: "%" },
  { id: 11, pattern: /¶2/g, replacement: "%2", description: "Convertir ¶2 en %2", triggerChar: "¶" },
  { id: 12, pattern: /¶3/g, replacement: "%3", description: "Convertir ¶3 en %3", triggerChar: "¶" },
  {
    id: 13,
    pattern: /([a-z])`/g,
    replacement: "<<$1>>",
    description: "Marcar una letra volada (grave HTR → <<…>>)",
    triggerChar: "`",
  },
  { id: 14, pattern: /c'/g, replacement: "ç", description: "c' → ç", triggerChar: "'" },
  { id: 15, pattern: /C'/g, replacement: "Ç", description: "C' → Ç", triggerChar: "'" },
  { id: 16, pattern: /n~/g, replacement: "ñ", description: "n~ → ñ", triggerChar: "~" },
  { id: 17, pattern: /n\u0303/g, replacement: "ñ", description: "n + combining tilde → ñ", triggerChar: "\u0303" },
  { id: 18, pattern: /N~/g, replacement: "Ñ", description: "N~ → Ñ", triggerChar: "~" },
  { id: 19, pattern: /cͥ/g, replacement: "c<r><<i>>", description: "c with superscript i" },
  {
    id: 20,
    pattern: /qͥs/g,
    replacement: "q<u><<i>>s",
    description: "q with superscript i + s (before general ͥ)",
  },
  { id: 21, pattern: /ͥ/g, replacement: "<r><<i>>", description: "General superscript i mark" },
  { id: 22, pattern: /oẽ/g, replacement: "o<mn>e", description: "oe tilde → o<mn>e" },
  { id: 23, pattern: /tiẽp/g, replacement: "tie<n>p", description: "tiẽp before general ẽ" },
  { id: 24, pattern: /ẽ/g, replacement: "e<n>", description: "ẽ → e<n>" },
  { id: 25, pattern: / õe/g, replacement: " o<mn>e", description: " õe before general õ" },
  { id: 26, pattern: / õs/g, replacement: " o<mne>s", description: " õs before general õ" },
  { id: 27, pattern: /õ/g, replacement: "o<n>", description: "õ → o<n>" },
  { id: 28, pattern: /ã/g, replacement: "a<n>", description: "ã → a<n>" },
  { id: 29, pattern: /ĩ/g, replacement: "i<n>", description: "ĩ → i<n>" },
  { id: 30, pattern: /ũ/g, replacement: "u<n>", description: "ũ → u<n>" },
  { id: 31, pattern: /q̃r/g, replacement: "q<u><<a>>r", description: "q̃r before general q̃" },
  { id: 32, pattern: /q̃/g, replacement: "q<ue>", description: "q̃ → q<ue>" },
  { id: 33, pattern: / om̃e/g, replacement: " om<n>e", description: " om̃e" },
  { id: 34, pattern: / om̃s/g, replacement: " om<ne>s", description: " om̃s" },
  { id: 35, pattern: /m̃t/g, replacement: "m<en>t", description: "m̃t → m<en>t" },
  { id: 36, pattern: /ꝰ/g, replacement: "<os>", description: "ꝰ → <os>" },
  { id: 37, pattern: /⁊/g, replacement: "&", description: "Tironian et → &" },
  { id: 38, pattern: /at̾/g, replacement: "at<ur>", description: "at̾ before general ̾" },
  { id: 39, pattern: /̾/g, replacement: "<er>", description: "̾ → <er>" },
  { id: 40, pattern: /Qnͣ/g, replacement: "Q<u><<a>>n", description: "Qnͣ before general ͣ" },
  { id: 41, pattern: /qnͣd/g, replacement: "q<u><<a>>nd", description: "qnͣd before general ͣ" },
  { id: 42, pattern: /qͣ/g, replacement: "q<u><<a>>", description: "qͣ before general ͣ" },
  { id: 43, pattern: /tͣ/g, replacement: "t<r><<a>>", description: "tͣ before general ͣ" },
  { id: 44, pattern: /ͣ/g, replacement: "<<a>>", description: "General superscript a" },
  { id: 45, pattern: /ꝑa/g, replacement: "p<ar>a", description: "ꝑa before general ꝑ" },
  { id: 46, pattern: /ꝑd/g, replacement: "p<er>d", description: "ꝑd before general ꝑ" },
  { id: 47, pattern: /ꝑ/g, replacement: "p<or>", description: "ꝑ → p<or>" },
  { id: 48, pattern: /ç/g, replacement: "ç", description: "c + combining cedilla → ç" },
  { id: 49, pattern: / ꝯ/g, replacement: " c<on>", description: " ꝯ →  c<on>" },
  { id: 50, pattern: /ꝯ /g, replacement: "<os> ", description: "ꝯ  → <os> " },
  { id: 51, pattern: /ꝓ/g, replacement: "p<ro>", description: "ꝓ → p<ro>" },
  { id: 52, pattern: /głi/g, replacement: "gl<es>i", description: "głi → gl<es>i" },
  { id: 53, pattern: /cłi/g, replacement: "cl<er>i", description: "cłi → cl<er>i" },
  { id: 54, pattern: /cłp/g, replacement: "c<u>lp", description: "cłp → c<u>lp" },
  { id: 55, pattern: /q̈/g, replacement: "q<u><<a>>", description: "q̈ → q<u><<a>>" },
  { id: 56, pattern: /ñ/g, replacement: "ñ", description: "ñ → ñ" },
  { id: 57, pattern: /ẜ/g, replacement: "s<er>", description: "ẜ → s<er>" },
  { id: 58, pattern: /pła/g, replacement: "pl<anet>a", description: "pła → pl<anet>a" },
  { id: 59, pattern: /ᷤ/g, replacement: "<<s>>", description: "Tiny s → <<s>>" },
  { id: 60, pattern: /ͦ/g, replacement: "<<o>>", description: "Tiny o → <<o>>" },
  { id: 61, pattern: /a\u0300/g, replacement: "à", description: "a + grave → à" },
  { id: 62, pattern: /e\u0300/g, replacement: "è", description: "e + grave → è" },
  { id: 63, pattern: /i\u0300/g, replacement: "ì", description: "i + grave → ì" },
  { id: 64, pattern: /o\u0300/g, replacement: "ò", description: "o + grave → ò" },
  { id: 65, pattern: /u\u0300/g, replacement: "ù", description: "u + grave → ù" },
  { id: 66, pattern: /a\u0301/g, replacement: "á", description: "a + acute → á" },
  { id: 67, pattern: /e\u0301/g, replacement: "é", description: "e + acute → é" },
  { id: 68, pattern: /i\u0301/g, replacement: "í", description: "i + acute → í" },
  { id: 69, pattern: /o\u0301/g, replacement: "ó", description: "o + acute → ó" },
  { id: 70, pattern: /u\u0301/g, replacement: "ú", description: "u + acute → ú" },
  { id: 71, pattern: /a\u0302/g, replacement: "â", description: "a + circumflex → â" },
  { id: 72, pattern: /e\u0302/g, replacement: "ê", description: "e + circumflex → ê" },
  { id: 73, pattern: /i\u0302/g, replacement: "î", description: "i + circumflex → î" },
  { id: 74, pattern: /o\u0302/g, replacement: "ô", description: "o + circumflex → ô" },
  { id: 75, pattern: /u\u0302/g, replacement: "û", description: "u + circumflex → û" },
  { id: 76, pattern: /¬/g, replacement: "-", description: "¬ soft hyphen → -" },
];

/** Whitespace cleanup pass (after glyph rules). */
export const HTR_SPACE_RULES: HtrRule[] = [
  {
    id: 100,
    pattern: /\x09/g,
    replacement: " ",
    description: "TAB → space",
  },
  {
    id: 101,
    pattern: /\u200B/g,
    replacement: " ",
    description: "ZWSP → space",
  },
  {
    id: 102,
    pattern: / {2,}/g,
    replacement: " ",
    description: "Collapse consecutive spaces",
  },
  {
    id: 103,
    pattern: / +(\r?\n)/g,
    replacement: "$1",
    description: "Strip spaces before newline",
  },
  {
    id: 104,
    pattern: /(\r?\n) +/g,
    replacement: "$1",
    description: "Strip spaces after newline",
  },
  {
    id: 105,
    pattern: /(\r?\n)(?:\r?\n)+/g,
    replacement: "$1",
    description: "Collapse consecutive blank lines",
  },
];

export type ConvertHtrOptions = {
  /** Skip whitespace cleanup pass (default false). */
  skipSpaceCleanup?: boolean;
};

export type ConvertHtrResult = {
  hsmsText: string;
  rulesApplied: number;
  ruleCount: number;
};

function applyRules(text: string, rules: HtrRule[]): { text: string; applied: number } {
  let out = text;
  let applied = 0;
  for (const rule of rules) {
    if (rule.triggerChar && !out.includes(rule.triggerChar)) continue;
    const before = out;
    out = out.replace(rule.pattern, rule.replacement);
    if (out !== before) applied++;
  }
  return { text: out, applied };
}

/**
 * Convert raw HTR/OCR export text into cleaner HSMS ASCII using the ordered rule table.
 */
export function convertHtrToHsms(
  htrText: string,
  options: ConvertHtrOptions = {},
): ConvertHtrResult {
  const all = options.skipSpaceCleanup
    ? HTR_SUBSTITUTION_RULES
    : [...HTR_SUBSTITUTION_RULES, ...HTR_SPACE_RULES];
  const { text, applied } = applyRules(htrText, all);
  return {
    hsmsText: text.replace(/^\n+/, "").replace(/\n+$/, "\n"),
    rulesApplied: applied,
    ruleCount: all.length,
  };
}

/** Alias matching MCP / CLI naming. */
export const convert_htr_to_hsms = convertHtrToHsms;
