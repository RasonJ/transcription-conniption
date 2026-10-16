/**
 * Slot extraction (SPEC-COPILOT §8.3): pull recipe parameters out of a question in any
 * Tier 1 language. Quoted strings always win for word/lemma; HSMS notation in the query
 * ({LAT.}, fol. 3r) is recognized directly.
 */
import { normalizeQuery } from "./router";
import type { Recipe, RecipeParams, SlotSpec } from "./types";

const QUOTED_RE = /["“”«»‘’']([^"“”«»‘’']{1,40})["“”«»‘’']/;

/** Words that introduce the target word: "collocates of rey", "kwic de dios", "hitzaren …". */
const WORD_INTRO = /\b(?:of|for|around|near|word|de|del|da|do|para|per|palabra|palavra|paraula|sobre)\s+([\p{L}][\p{L}'~ç]*)/gu;
const NOT_A_TARGET = new Set([
  "the", "a", "la", "el", "los", "las", "o", "os", "as", "a", "les", "els", "un", "una", "words", "word",
  "palabras", "palavras", "paraules", "palabra", "palavra", "paraula", "context", "contexto", "context",
  "text", "texto", "manuscript", "manuscrito", "manuscrit", "witness", "testimonio", "testemunho",
  "occurrence", "occurrences", "aparicion", "apariciones", "ocorrencias", "every", "all", "todas", "todos",
  "window", "ventana", "janela", "finestra", "xanela", "spelling", "grafia", "lemma", "lema",
]);

const WINDOW_RE = /(?:±|\+\/-|window of|ventana de|janela de|finestra de|xanela de|within|en|em|dins)\s*(\d{1,2})\s*(?:words?|palabras?|palavras?|paraules?|hitz)?|(\d{1,2})\s*(?:-|\s)?(?:word|palabra|palavra|paraula|hitz)(?:s|es)?\s*(?:window|ventana|janela|finestra|xanela|leiho)/i;

const NGRAM_WORDS: Record<string, number> = {
  bigram: 2, bigrams: 2, bigrama: 2, bigramas: 2, bigrames: 2,
  trigram: 3, trigrams: 3, trigrama: 3, trigramas: 3, trigrames: 3,
  tetragram: 4, tetragrams: 4, tetragrama: 4, tetragramas: 4, tetragrames: 4, "4gram": 4,
  pentagram: 5, pentagrama: 5, pentagramas: 5,
};
const NGRAM_RE = /(\d)\s*-?\s*(?:grams?|gramas?|grames?)\b/;
const TOP_RE = /\b(?:top|los|las|os|as|els|les|the|first|primeros|primeiros|primers|lehen)\s+(\d{1,3})\b/;
const HAND_RE = /\b(?:hand|mano|mao|ma|man|eskua)\s*(\d)\b|\b(\d)\.?\s*(?:hand|eskua)\b/;
const FOLIO_ID = "([0-9]+[rv][a-d]?|[ivxlcdm]+[rv])";
const RANGE_RE = new RegExp(
  `(?:fols?\\.?\\s*)?${FOLIO_ID}\\s*(?:-|–|—|to|a|ata|fins a|ate|until)\\s*(?:fol\\.?\\s*)?${FOLIO_ID}`,
  "i",
);
const REGISTRY_RE = /\b(registry|corpus|batch|all witnesses|across witnesses|todos los testimonios|todos os testemunhos|tots els testimonis|todos os testemuños|lekuko guztiak|lote)\b/;

const LANGUAGE_NAMES: Array<[RegExp, string]> = [
  [/\b(latin|latina|latim|llati|latinezko|latinera)\b/, "LAT"],
  [/\b(arabic|arabe|arab|arabiera|arabierazko)\b/, "ARB"],
  [/\b(hebrew|hebreo|hebraico|hebreu|hebreera)\b/, "HEB"],
  [/\b(greek|griego|grego|grec|greziera)\b/, "GRK"],
  [/\b(aragonese|aragones|aragonesa|aragonesos|aragoiera)\b/, "ARG"],
  [/\b(catalan|catala|catalao|katalana)\b/, "CAT"],
  [/\b(french|frances|francesa|frantsesa)\b/, "FRN"],
  [/\b(italian|italiano|italia|italiera)\b/, "ITL"],
];
const MNEMONIC_RE = /\{([a-z]{3})[.:]/;

function clampInt(value: number, slot: Extract<SlotSpec, { type: "int" }>): number {
  const min = slot.min ?? Number.MIN_SAFE_INTEGER;
  const max = slot.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, value));
}

export function extractWord(query: string): string | undefined {
  const quoted = query.match(QUOTED_RE);
  if (quoted) return quoted[1].trim();
  const q = normalizeQuery(query);
  let last: string | undefined;
  WORD_INTRO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_INTRO.exec(q)) !== null) {
    const w = m[1];
    if (w.length >= 2 && !NOT_A_TARGET.has(w) && !/^\d/.test(w)) last = w;
  }
  return last;
}

/** Fill the recipe's slots from the question. Unknown slots are left undefined. */
export function extractSlots(query: string, recipe: Pick<Recipe, "slots">): RecipeParams {
  const q = normalizeQuery(query);
  const params: RecipeParams = { query };
  for (const slot of recipe.slots) {
    switch (slot.name) {
      case "word":
      case "lemma": {
        const w = extractWord(query);
        if (w) params[slot.name] = w;
        break;
      }
      case "window": {
        const m = q.match(WINDOW_RE);
        const n = m ? Number(m[1] ?? m[2]) : NaN;
        if (Number.isFinite(n) && slot.type === "int") params.window = clampInt(n, slot);
        break;
      }
      case "n": {
        const word = q.split(/\s+/).find((w) => NGRAM_WORDS[w.replace(/-/g, "")] !== undefined);
        const m = q.match(NGRAM_RE);
        const n = m ? Number(m[1]) : word ? NGRAM_WORDS[word.replace(/-/g, "")] : NaN;
        if (Number.isFinite(n) && slot.type === "int") params.n = clampInt(n, slot);
        break;
      }
      case "top": {
        const m = q.match(TOP_RE);
        if (m && slot.type === "int") params.top = clampInt(Number(m[1]), slot);
        break;
      }
      case "hand": {
        const m = q.match(HAND_RE);
        if (m) params.hand = Number(m[1] ?? m[2]);
        break;
      }
      case "range": {
        const m = q.match(RANGE_RE);
        if (m) params.range = { from: m[1], to: m[2] };
        break;
      }
      case "lang": {
        const mn = q.match(MNEMONIC_RE);
        if (mn) params.lang = mn[1].toUpperCase();
        else {
          const hit = LANGUAGE_NAMES.find(([re]) => re.test(q));
          if (hit) params.lang = hit[1];
        }
        break;
      }
      case "scope": {
        if (REGISTRY_RE.test(q)) params.scope = "registry";
        break;
      }
      default:
        break;
    }
  }
  // A folio range applies to any recipe (the witness is narrowed before it runs).
  if (!params.range) {
    const m = q.match(RANGE_RE);
    if (m && /fol|[0-9][rv]/.test(m[0])) params.range = { from: m[1], to: m[2] };
  }
  return params;
}

/** Required slots still missing after extraction (the UI asks for them). */
export function missingSlots(recipe: Pick<Recipe, "slots">, params: RecipeParams): string[] {
  return recipe.slots
    .filter((s) => (s.name === "word" || s.name === "lemma") && "required" in s && s.required)
    .filter(() => !params.word && !params.lemma)
    .map((s) => s.name)
    .slice(0, 1);
}
