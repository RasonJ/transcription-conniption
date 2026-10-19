/**
 * Tier-2 MUFI paleographic map: HSMS ASCII interchange → MUFI glyph / decomposed Unicode.
 *
 * Tier 1 (HSMS ASCII) stays canonical for storage, lint, and Azure agents.
 * Tier 2/3 are display-only via convertHsmsToMufiGlyphs / formatTokenDisplayGrapheme.
 *
 * @see https://mufi.info/q.php?p=mufi/chars
 * @see assets/mufi/ (catalog) · utils/mufiFonts.ts (Andron / Junicode)
 */

export interface MufiEntry {
  /** MUFI / Menota-style entity name */
  entity: string;
  /** Primary code point (hex, no U+) */
  codePoint: string;
  /** Precomposed / PUA glyph string */
  char: string;
  /** Decomposed fallback (base + combining marks) */
  decomposed: string;
  /** Descriptive MUFI name */
  name: string;
}

/**
 * HSMS pattern → MUFI entry.
 * Longer keys must be matched first (see PATTERN_KEYS_LONGEST_FIRST).
 */
export const MUFI_PALEOGRAPHIC_MAP: Record<string, MufiEntry> = {
  // Cedilla / nasal (also in legacy RegexReplaces)
  "c'": {
    entity: "&ccedil;",
    codePoint: "00E7",
    char: "ç",
    decomposed: "c\u0327",
    name: "LATIN SMALL LETTER C WITH CEDILLA",
  },
  "C'": {
    entity: "&Ccedil;",
    codePoint: "00C7",
    char: "Ç",
    decomposed: "C\u0327",
    name: "LATIN CAPITAL LETTER C WITH CEDILLA",
  },
  "n~": {
    entity: "&ntilde;",
    codePoint: "00F1",
    char: "ñ",
    decomposed: "n\u0303",
    name: "LATIN SMALL LETTER N WITH TILDE",
  },
  "N~": {
    entity: "&Ntilde;",
    codePoint: "00D1",
    char: "Ñ",
    decomposed: "N\u0303",
    name: "LATIN CAPITAL LETTER N WITH TILDE",
  },
  "a~": {
    entity: "&atilde;",
    codePoint: "00E3",
    char: "ã",
    decomposed: "a\u0303",
    name: "LATIN SMALL LETTER A WITH TILDE",
  },
  "o~": {
    entity: "&otilde;",
    codePoint: "00F5",
    char: "õ",
    decomposed: "o\u0303",
    name: "LATIN SMALL LETTER O WITH TILDE",
  },
  "e~": {
    entity: "&etilde;",
    codePoint: "1EBD",
    char: "ẽ",
    decomposed: "e\u0303",
    name: "LATIN SMALL LETTER E WITH TILDE",
  },

  // Scribal abbreviation signs
  "q<ue>": {
    entity: "&qmacr;",
    codePoint: "E681",
    char: "\uE681",
    decomposed: "q\u0304",
    name: "LATIN SMALL LETTER Q WITH MACRON",
  },
  "p<er>": {
    entity: "&pbardes;",
    codePoint: "A751",
    char: "ꝑ",
    decomposed: "p\u0336",
    name: "LATIN SMALL LETTER P WITH STROKE THROUGH DESCENDER",
  },
  "p<or>": {
    entity: "&pflour;",
    codePoint: "A753",
    char: "ꝓ",
    decomposed: "p\u0315",
    name: "LATIN SMALL LETTER P WITH FLOURISH",
  },
  "p<ar>a": {
    entity: "&par;",
    codePoint: "A751",
    char: "ꝑa",
    decomposed: "p\u0336a",
    name: "LATIN SMALL LETTER P WITH STROKE THROUGH DESCENDER A",
  },
  "p<ro>": {
    entity: "&pro;",
    codePoint: "A753",
    char: "ꝓ",
    decomposed: "p\u0315",
    name: "LATIN SMALL LETTER P WITH FLOURISH",
  },
  "c<on>": {
    entity: "&conbase;",
    codePoint: "2184",
    char: "ↄ",
    decomposed: "ↄ",
    name: "LATIN SMALL LETTER REVERSED C",
  },
  "&": {
    entity: "&et;",
    codePoint: "204A",
    char: "⁊",
    decomposed: "⁊",
    name: "TIRONIAN SIGN ET",
  },
  "%2": {
    entity: "&parag2;",
    codePoint: "00B6",
    char: "¶2",
    decomposed: "¶2",
    name: "DOUBLE PARAGRAPHUS / CALDERON %2",
  },
  "%": {
    entity: "&parag;",
    codePoint: "00B6",
    char: "¶",
    decomposed: "¶",
    name: "PILCROW / CALDERON",
  },
  "s~": {
    entity: "&slong;",
    codePoint: "017F",
    char: "ſ",
    decomposed: "ſ",
    name: "LATIN SMALL LETTER LONG S",
  },
  "s<er>": {
    entity: "&slongbar;",
    codePoint: "1E9D",
    char: "ẜ",
    decomposed: "ſ\u0335",
    name: "LATIN SMALL LETTER LONG S WITH HIGH STROKE",
  },
  "m<en>t": {
    entity: "&mtailstrok;",
    codePoint: "A773",
    char: "m̃t",
    decomposed: "m\u0303t",
    name: "LATIN SMALL LETTER MUM",
  },
  "c<r><<i>>": {
    entity: "&csup;",
    codePoint: "0368",
    char: "c\u0368",
    decomposed: "c\u0368",
    name: "COMBINING LATIN SMALL LETTER C + I",
  },
  "q<u><<a>>": {
    entity: "&qasup;",
    codePoint: "0363",
    char: "q\u0363",
    decomposed: "q\u0363",
    name: "LATIN SMALL LETTER Q WITH SUPERSCRIPT A",
  },
  "q<u><<i>>": {
    entity: "&qisup;",
    codePoint: "0365",
    char: "q\u0365",
    decomposed: "q\u0365",
    name: "LATIN SMALL LETTER Q WITH SUPERSCRIPT I",
  },
  "<os>": {
    entity: "&usmod;",
    codePoint: "A770",
    char: "ꝰ",
    decomposed: "ꝰ",
    name: "MODIFIER LETTER US",
  },
  "r~": {
    entity: "&rrotunda;",
    codePoint: "A75B",
    char: "ꝛ",
    decomposed: "r",
    name: "LATIN SMALL LETTER R ROTUNDA",
  },
};

/** Longest HSMS keys first so `p<ar>a` wins over `p<ar>` / shorter prefixes. */
export const PATTERN_KEYS_LONGEST_FIRST: string[] = Object.keys(MUFI_PALEOGRAPHIC_MAP).sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

/**
 * Converts HSMS ASCII transcription markup into MUFI glyph rendering.
 * Does not alter structural braces `{…}` / foliation — only paleographic tokens.
 */
export function convertHsmsToMufiGlyphs(hsmsText: string, usePua: boolean = true): string {
  if (!hsmsText) return hsmsText;
  let output = hsmsText;
  for (const hsmsPattern of PATTERN_KEYS_LONGEST_FIRST) {
    const mufi = MUFI_PALEOGRAPHIC_MAP[hsmsPattern];
    if (!mufi || !output.includes(hsmsPattern)) continue;
    const glyph = usePua ? mufi.char : mufi.decomposed;
    output = output.split(hsmsPattern).join(glyph);
  }
  return output;
}

export function lookupPaleographicMufi(hsmsPattern: string): MufiEntry | undefined {
  return MUFI_PALEOGRAPHIC_MAP[hsmsPattern];
}
