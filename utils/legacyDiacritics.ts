import { HSMS_DIACRITIC_MAP } from "./generated/hsmsDiacriticMap";

const PRIME_CHARS = "'\u2018\u2019\u0060";
const PRIME_CLASS = `['${PRIME_CHARS}]`;
const PRIME_OR_TILDE_CLASS = `['${PRIME_CHARS}~.]`;
const VOWEL_MARK = "[aeijouyAEIJOUYnNjJpPqQgG]";
const CONSONANT = "[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]";

/** Extended vowels for nasal tilde grapheme clusters (hsms-tmp TextRun parity). */
export const VOWELS_EXTENDED = "aeiouAEIOUáàâãéêíóôõú";
export const NASAL_GRAPHEME_CLUSTER_SOURCE = `[${VOWELS_EXTENDED}nN]~`;
export const CEDILLA_GRAPHEME_CLUSTER_SOURCE = `${CONSONANT}${PRIME_CLASS}`;

export const DIACRITIC_CLUSTER_SOURCE = `(?:[Cc]${PRIME_CLASS}[aoeiouAEIOU]~|[Cc]${PRIME_CLASS}|${CONSONANT}?(?:<[^>]+>)?${VOWEL_MARK}(?:<[^>]+>)?@?\\^|${CONSONANT}?(?:<[^>]+>)?${VOWEL_MARK}(?:<[^>]+>)?@?${PRIME_OR_TILDE_CLASS}|${CONSONANT}${VOWEL_MARK}~|[A-Za-zÀ-ÿ]~)`;
/** Tail is alphanumeric only so `[` starts a separate paleographic token. */
export const EMBEDDED_DIACRITIC_WORD_SOURCE = `[A-Za-z0-9]*(?:${DIACRITIC_CLUSTER_SOURCE})[A-Za-z0-9]*`;
export const DIACRITIC_WITH_TAIL_EXPANSIONS_SOURCE = `${DIACRITIC_CLUSTER_SOURCE}(?:<[^>]+>)+[a-zA-Z]*`;

const DIACRITIC_MAP: Record<string, string> = HSMS_DIACRITIC_MAP;
const RE_GLOBAL_AT = /@/g;
const RE_PRIME_VARIANTS = /[\u2018\u2019\u0060]/g;

const RE_BRACKET_CHECK = /<[^>]+>/;
const RE_EXPANSION_STRIP = /<([^>]+)>/g;
const RE_TAG_STRIP = /<[^>]+>/g;
const RE_SEGMENT_CLEAN = new RegExp(`(${VOWEL_MARK})@?([~'\`^])`, "g");
const RE_CLUSTER_STATIC = new RegExp(DIACRITIC_CLUSTER_SOURCE, "g");
const RE_TAIL_EXPANSION = new RegExp(`^(${DIACRITIC_CLUSTER_SOURCE})((?:<[^>]+>)+[a-zA-Z]*)`);

const COMPOUND_DIACRITIC_MAP: Record<string, string> = {
  "c'o~": "çõ",
  "c'a~": "çã",
  "c‘o~": "çõ",
  "c’o~": "çõ",
  "c`o~": "çõ",
  "C'o~": "Çõ",
  "C'a~": "Çã",
  "c'oe": "çõe",
  "c'om": "çom",
  "c'am": "çam",
};

const WORD_REPLACEMENT_MAP: Record<string, string> = {
  "P@'": "Pedro",
  "p@'": "pedro",
  "P.'": "Pedro",
  "p.'": "pedro",
  "P'": "Pedro",
  "G@.": "Geral",
  "G.": "Geral",
  "q.": "que",
  "Q.": "Que",
};

export function normalizeDiacriticKey(raw: string): string {
  return raw.replace(RE_GLOBAL_AT, "").replace(RE_PRIME_VARIANTS, "'");
}

/** HSMS §3.215b — nasal/abbreviation tildes in Iberian vernacular prose. */
export function normalizeHistoricalNasalTildes(s: string): string {
  if (!s.includes("~")) return s;
  return s
    .replace(/a~/g, "ã")
    .replace(/A~/g, "Ã")
    .replace(/e~/g, "ẽ")
    .replace(/E~/g, "Ẽ")
    .replace(/o~/g, "õ")
    .replace(/O~/g, "Õ")
    .replace(/m~/g, "mm")
    .replace(/u~/g, "un");
}

/** Display-time normalization for attached nasal/cedilla grapheme clusters. */
export function normalizeDisplayDiacritics(v: string): string {
  return normalizeHistoricalNasalTildes(v)
    .replace(/c'/g, "ç")
    .replace(/C'/g, "Ç")
    .replace(/n~/g, "ñ")
    .replace(/N~/g, "Ñ");
}

function lookupDiacritic(key: string): string | undefined {
  const normalized = normalizeDiacriticKey(key);
  return (
    WORD_REPLACEMENT_MAP[key] ??
    WORD_REPLACEMENT_MAP[normalized] ??
    COMPOUND_DIACRITIC_MAP[key] ??
    COMPOUND_DIACRITIC_MAP[normalized] ??
    DIACRITIC_MAP[key] ??
    DIACRITIC_MAP[normalized]
  );
}

export function resolveLegacyDiacritic(raw: string): string {
  const bracketMatch = raw.match(RE_BRACKET_CHECK);
  if (bracketMatch) {
    const bracketContent = bracketMatch[0];
    const core = raw.replace(bracketContent, "");
    return `${resolveLegacyDiacritic(core)}${bracketContent}`;
  }

  let result = raw.replace(RE_SEGMENT_CLEAN, (segment) => {
    return lookupDiacritic(segment) ?? lookupDiacritic(segment.replace(RE_GLOBAL_AT, "")) ?? segment;
  });

  result = result.replace(RE_CLUSTER_STATIC, (segment) => {
    return lookupDiacritic(segment) ?? lookupDiacritic(normalizeDiacriticKey(segment)) ?? segment;
  });

  return lookupDiacritic(result) ?? lookupDiacritic(result.replace(RE_GLOBAL_AT, "")) ?? result;
}

export function resolveDiacriticWord(raw: string): string {
  const whole = lookupDiacritic(raw) ?? lookupDiacritic(normalizeDiacriticKey(raw));
  if (whole && whole !== raw) return whole;

  const tailMatch = raw.match(RE_TAIL_EXPANSION);
  if (tailMatch) {
    let resolved = resolveLegacyDiacritic(tailMatch[1]);
    const tail = tailMatch[2];
    const expansions = tail.match(RE_EXPANSION_STRIP) ?? [];

    for (let i = 0; i < expansions.length; i++) {
      resolved += expansions[i].slice(1, -1);
    }
    resolved += tail.replace(RE_TAG_STRIP, "");
    return resolved;
  }

  RE_CLUSTER_STATIC.lastIndex = 0;
  let result = RE_CLUSTER_STATIC.test(raw)
    ? raw.replace(RE_CLUSTER_STATIC, (segment) => {
        const historical = normalizeHistoricalNasalTildes(segment);
        if (historical !== segment) return historical;
        return (
          lookupDiacritic(segment) ??
          lookupDiacritic(normalizeDiacriticKey(segment)) ??
          resolveLegacyDiacritic(segment)
        );
      })
    : raw;

  result = resolveLegacyDiacritic(result);
  result = normalizeHistoricalNasalTildes(result);

  return (
    lookupDiacritic(result) ?? lookupDiacritic(normalizeDiacriticKey(result)) ?? result
  );
}

/** @alias resolveLegacyDiacritic */
export const normalizeDiacritic = resolveLegacyDiacritic;
