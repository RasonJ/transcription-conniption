/**
 * Graph/grapheme pattern sets and closed word lists for Tier B recipes (SPEC-COPILOT §4, §9).
 * Patterns run on diplomatic word surfaces (legacy notation kept: `n~`, `c'`, `s~`).
 * Lists are per witness language; edit here to tune a corpus. Every Tier B answer shows
 * examples first so researchers can judge precision.
 */
import type { WitnessLanguage } from "../witnessLanguage";

export interface GraphVariant {
  key: string;
  label: string;
  /** Tested against one diplomatic word (lowercased). */
  pattern: RegExp;
}

export interface GraphSet {
  id: string;
  variants: GraphVariant[];
}

const V = "aeiouáéíóúàèìòù";

export const GRAPH_SETS: Record<string, GraphSet> = {
  /** /ɲ/ spellings (manual §3.215b: the tilde over n). */
  palatal_nasal: {
    id: "palatal_nasal",
    variants: [
      { key: "n_tilde", label: "n~ / ñ", pattern: /n~|ñ/ },
      { key: "nn", label: "nn", pattern: /nn/ },
      { key: "nh", label: "nh", pattern: new RegExp(`nh[${V}]`) },
      { key: "ny", label: "ny", pattern: new RegExp(`ny[${V}]`) },
    ],
  },
  /** Sibilant graphs on the diplomatic surface (sigma s', c-cedilla c', long s s~). */
  sibilant_graphs: {
    id: "sibilant_graphs",
    variants: [
      { key: "sigma", label: "s' (sigma)", pattern: /s'/ },
      { key: "cedilla", label: "c' / ç", pattern: /c'|ç/ },
      { key: "long_s", label: "s~ (long s)", pattern: /s~|ſ/ },
      { key: "z", label: "z", pattern: /z/ },
    ],
  },
  /** Intervocalic sibilants (devoicing studies). */
  sibilants: {
    id: "sibilants",
    variants: [
      { key: "s_intervocalic", label: "-s-", pattern: new RegExp(`[${V}]s[${V}]`) },
      { key: "ss_intervocalic", label: "-ss-", pattern: new RegExp(`[${V}]ss[${V}]`) },
      { key: "cedilla", label: "ç / c'", pattern: /c'|ç/ },
      { key: "z", label: "z", pattern: /z/ },
    ],
  },
  /** /ʎ/ spellings. `li` + vowel is noisy (filii, alien…): always read the examples. */
  palatal_lateral: {
    id: "palatal_lateral",
    variants: [
      { key: "ll", label: "ll", pattern: /ll/ },
      { key: "li_vowel", label: "li + vowel", pattern: new RegExp(`[^l]li[aeou]`) },
      { key: "lh", label: "lh", pattern: new RegExp(`lh[${V}]`) },
    ],
  },
};

/** Enclitic pronoun suffixes (Old Castilian / Galician-Portuguese). */
export const ENCLITICS: Record<WitnessLanguage, readonly string[]> = {
  SPN: ["los", "las", "les", "lo", "la", "le", "l", "me", "te", "se", "nos", "vos", "gelo", "gela"],
  PRT: ["lhe", "lhi", "lo", "la", "o", "a", "me", "te", "se", "nos", "vos"],
  GAL: ["lle", "lo", "la", "o", "a", "me", "te", "se", "nos", "vos"],
  CAT: ["lo", "la", "los", "les", "li", "me", "te", "se", "nos", "vos", "ne", "hi"],
  LAT: [],
};

export const CLITICS_STANDALONE: Record<WitnessLanguage, readonly string[]> = {
  SPN: ["lo", "la", "le", "los", "las", "les", "me", "te", "se", "nos", "vos", "gelo", "gela"],
  PRT: ["o", "a", "lhe", "lhi", "me", "te", "se", "nos", "vos"],
  GAL: ["o", "a", "lle", "me", "te", "se", "nos", "vos"],
  CAT: ["lo", "la", "los", "les", "li", "me", "te", "se", "nos", "vos"],
  LAT: [],
};

/** Elided clitic forms written as one unit, with their full two-word counterpart. */
export const ELIDED_CLITICS: Record<WitnessLanguage, ReadonlyArray<[string, string]>> = {
  SPN: [["yl", "y le"], ["quel", "que le"], ["nol", "no le"], ["sil", "si le"], ["quem", "que me"]],
  PRT: [["queo", "que o"], ["nono", "non o"], ["quelhe", "que lhe"]],
  GAL: [["queo", "que o"], ["nono", "non o"]],
  CAT: [["quel", "que el"], ["nol", "no el"]],
  LAT: [],
};

/** Merged preposition + article / pronoun forms and their separate counterparts. */
export const CONTRACTIONS: Record<WitnessLanguage, ReadonlyArray<[string, string]>> = {
  SPN: [
    ["enel", "en el"], ["enla", "en la"], ["enlos", "en los"], ["enlas", "en las"],
    ["delos", "de los"], ["delas", "de las"], ["dela", "de la"], ["dello", "de ello"],
    ["della", "de ella"], ["dellos", "de ellos"], ["deste", "de este"], ["desta", "de esta"],
    ["sobrel", "sobre el"], ["entressi", "entre si"], ["alos", "a los"], ["contral", "contra el"],
  ],
  PRT: [["no", "em o"], ["na", "em a"], ["nos", "em os"], ["do", "de o"], ["da", "de a"], ["dos", "de os"], ["das", "de as"], ["ao", "a o"]],
  GAL: [["no", "en o"], ["na", "en a"], ["do", "de o"], ["da", "de a"], ["ao", "a o"]],
  CAT: [["del", "de el"], ["dels", "de els"], ["al", "a el"], ["als", "a els"], ["pel", "per el"]],
  LAT: [],
};

/** Complex subordinators written as one unit or split. */
export const SUBORDINATORS: Record<WitnessLanguage, ReadonlyArray<[string, string]>> = {
  SPN: [["porque", "por que"], ["paraque", "para que"], ["anteque", "ante que"], ["puesque", "pues que"], ["desque", "des que"], ["aunque", "aun que"], ["comoquier", "como quier"]],
  PRT: [["porque", "por que"], ["poisque", "pois que"], ["ataque", "ata que"]],
  GAL: [["porque", "por que"], ["poisque", "pois que"]],
  CAT: [["perque", "per que"], ["perço", "per ço"]],
  LAT: [],
};

/** Learned (Latinate) vs vernacular doublets. */
export const LATINATE_DOUBLETS: ReadonlyArray<[string, string]> = [
  ["sancto", "santo"], ["sancta", "santa"], ["sanctos", "santos"], ["escripto", "escrito"],
  ["escriptura", "escritura"], ["regno", "reino"], ["dubda", "duda"], ["cibdad", "ciudad"],
  ["septiembre", "setiembre"], ["sciencia", "ciencia"], ["christiano", "cristiano"],
  ["nascer", "nacer"], ["omne", "ome"], ["doctor", "dotor"], ["fructo", "fruto"],
  ["sancti", "santi"], ["captivo", "cativo"], ["digno", "dino"], ["significar", "sinificar"],
];

/** Fossilized Greek character formulas (nomina sacra). */
export const GREEK_FORMULAS: ReadonlyArray<{ key: string; label: string; pattern: RegExp }> = [
  { key: "xp", label: "xp- (chr-)", pattern: /^xp/ },
  { key: "ih", label: "ih- (jhes-)", pattern: /^ih[su]/ },
  { key: "xps", label: "xps / xpo", pattern: /^xp[so]$/ },
];

/** Words introducing reported speech, for the calderón discourse heuristic. */
export const SPEECH_VERBS: Record<WitnessLanguage, readonly string[]> = {
  SPN: ["dixo", "dixieron", "respondio", "respondieron", "dize", "dizen", "fablo", "pregunto", "dixeron"],
  PRT: ["disse", "disseram", "respondeu", "responderam", "diz", "perguntou"],
  GAL: ["dixo", "disse", "respondeu", "pregunto"],
  CAT: ["dix", "dixe", "respos", "diu", "dien"],
  LAT: ["dixit", "respondit", "ait", "inquit"],
};

/** Roman numerals bounded by periods (`.xxxvij.`). */
export const ROMAN_NUMERAL_RE = /^\.[ivxlcdm]+j?\.$/i;
