import type { ManuscriptBlock, Token } from "@/constants/manuscript";
import { foldForSearch, type WitnessLanguage } from "@/utils/witnessLanguage";

/**
 * Common Ibero-Romance 16th-century surface forms → modern orthography
 * for line-by-line synoptic preview (Portuguese / Galician / Castilian).
 * Exported so Copilot KWIC can reverse-map modern query terms → diplomatic variants.
 */
export const MODERN_SPELLING_MAP: Record<string, string> = {
  // Portuguese / Galician
  ho: "o",
  hos: "os",
  ha: "a",
  has: "as",
  liuro: "livro",
  liuros: "livros",
  meyo: "meio",
  terceyro: "terceiro",
  terceyra: "terceira",
  nauegacao: "navegação",
  nauegaçao: "navegação",
  nouamente: "novamente",
  pella: "pela",
  pellas: "pelas",
  pello: "pelo",
  pellos: "pelos",
  nam: "não",
  nom: "não",
  he: "é",
  hua: "uma",
  huas: "umas",
  hum: "um",
  huns: "uns",
  huum: "um",
  poys: "pois",
  tam: "tão",
  tambem: "também",
  mays: "mais",
  muyto: "muito",
  mui: "muito",
  assi: "assim",
  foy: "foi",
  fez: "fez",
  faco: "faço",
  faca: "faça",
  sciencia: "ciência",
  sciẽcia: "ciência",
  lingoagem: "linguagem",
  auenturado: "aventurado",
  auenturada: "aventurada",
  sancto: "santo",
  sancta: "santa",
  // Castilian
  dixo: "dijo",
  fizo: "hizo",
  fizieron: "hicieron",
  omne: "hombre",
  omnes: "hombres",
  mugier: "mujer",
  mugieres: "mujeres",
  assaz: "asaz",
  agora: "ahora",
  estonce: "entonces",
  estonces: "entonces",
  otrossi: "otrosí",
  yuso: "abajo",
  suso: "arriba",
  fablar: "hablar",
  fablava: "hablaba",
  cauallero: "caballero",
  caualleros: "caballeros",
  naue: "nave",
};

const SKIP_TYPES = new Set<Token["type"]>([
  "scribal_deletion",
  "editorial_deletion",
  "env_open",
  "env_close",
  "figure_anchor",
  "calderon",
  "calderon_two",
  "calderon_three",
  "otiose_mark",
  "hyphen",
  "citation_wrap",
  "prefix_separator",
  "missing_fragment",
]);

/** Accept HSMS codes (PRT/POR) and WitnessLanguage tags. */
export type ModernLanguageHint = WitnessLanguage | "POR" | "SPN" | string;

function normalizeLang(hint: ModernLanguageHint): "PRT" | "SPN" | "GAL" | "CAT" | "LAT" | "OTHER" {
  const u = String(hint || "PRT").toUpperCase();
  if (u === "POR" || u === "PRT" || u === "PT") return "PRT";
  if (u === "SPA" || u === "SPN" || u === "ES" || u === "CAST") return "SPN";
  if (u === "GAL" || u === "GL") return "GAL";
  if (u === "CAT" || u === "CA") return "CAT";
  if (u === "LAT" || u === "LA") return "LAT";
  return "OTHER";
}

function preserveCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Apply shared nasal / cedilla / u~v modernization once per word. */
export function applyRomanceOrthographyRules(raw: string, lang: ModernLanguageHint): string {
  const family = normalizeLang(lang);
  if (family === "LAT" || family === "OTHER") return raw;

  let val = raw;
  // HSMS c' → ç (fac'o → faço)
  val = val.replace(/c'/gi, (m) => (m[0] === "C" ? "Ç" : "ç"));
  // Combining / ASCII tilde nasals: a~o → ão, o~ → õ, e~ → ẽ (then ãe when word-final e~)
  val = val.replace(/([AaEeIiOoUuYy])~/g, (_, v: string) => {
    const map: Record<string, string> = {
      a: "ã",
      A: "Ã",
      e: "ẽ",
      E: "Ẽ",
      i: "ĩ",
      I: "Ĩ",
      o: "õ",
      O: "Õ",
      u: "ũ",
      U: "Ũ",
      y: "ỹ",
      Y: "Ỹ",
    };
    return map[v] ?? `${v}~`;
  });
  // ã + o cluster → ão (nauegaçã + o already joined as navegação via map; aõ → ão)
  val = val.replace(/ãõ/gi, (m) => (m[0] === "Ã" ? "ÃO" : "ão"));
  val = val.replace(/ã[oо]/gi, (m) => (m[0] === "Ã" ? "ÃO" : "ão"));
  val = val.replace(/ẽ[eе]/gi, (m) => (m[0] === "Ẽ" ? "ÃE" : "ãe"));

  if (family === "PRT" || family === "GAL") {
    // Historical u/v in medial position: naue → nave (word-level map covers many; light rule)
    val = val.replace(/([aeiouáéíóúãõ])u([aeiouáéíóú])/gi, "$1v$2");
  }

  return val;
}

/**
 * Modernizes a single token's text for line-by-line synoptic reading.
 */
export function modernizeTokenText(token: Token, languageHint: ModernLanguageHint = "PRT"): string {
  if (SKIP_TYPES.has(token.type)) return "";

  if (token.type === "blank_space" || token.type === "mechanical_lacuna") return "…";
  if (token.type === "illegible_text") return "□□";
  if (token.type === "non_sequitur") return "—";

  let val = token.normalized ?? token.value ?? "";
  if (!val && token.raw) val = token.raw;
  val = val.replace(/\{[^}]+\}/g, "").trim();
  if (!val) return "";

  // Drop initials / expansions / insertions: keep surface, then orthography rules
  if (
    token.type === "drop_initial" ||
    token.type === "expansion" ||
    token.type === "superscript" ||
    token.type === "scribal_insertion" ||
    token.type === "editorial_insertion" ||
    token.type === "reconstructed_text"
  ) {
    return applyRomanceOrthographyRules(val, languageHint);
  }

  const lower = val.toLowerCase().normalize("NFC");
  const folded = lower.replace(/ç/g, "c").replace(/ã/g, "a").replace(/õ/g, "o");
  const mapped =
    MODERN_SPELLING_MAP[lower] ??
    MODERN_SPELLING_MAP[folded] ??
    MODERN_SPELLING_MAP[lower.replace(/'/g, "")];

  if (mapped) {
    return preserveCase(val, mapped);
  }

  return applyRomanceOrthographyRules(val, languageHint);
}

function needsSpaceBefore(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (/[\s([{¿¡]$/.test(prev)) return false;
  if (/^[.,;:!?…)'”\]%]/.test(next)) return false;
  return true;
}

/**
 * Reconstructs a clean modern line string from a block's token stream.
 * Drop-cap graphemes stay glued to the remainder of the opening word.
 */
export function modernizeBlockLine(
  block: ManuscriptBlock,
  languageHint: ModernLanguageHint = "PRT",
): string {
  if (block.type === "diagram" || block.type === "initial_container") {
    return "";
  }

  let out = "";
  let gluedAfterDrop = false;

  for (const tok of block.tokens) {
    if (SKIP_TYPES.has(tok.type)) continue;

    const modern = modernizeTokenText(tok, languageHint);
    if (!modern) continue;

    if (tok.type === "drop_initial") {
      out += modern;
      gluedAfterDrop = true;
      continue;
    }

    if (gluedAfterDrop) {
      out += modern;
      gluedAfterDrop = false;
      continue;
    }

    if (needsSpaceBefore(out, modern)) out += " ";
    out += modern;
  }

  return out.replace(/\s+/g, " ").trim();
}

export interface ModernLineRow {
  lineNumber: string;
  modernText: string;
  isRubric: boolean;
}

/** Line-numbered modern rows for a folio (skips empty structural blocks). */
export function modernizeFolioLines(
  blocks: readonly ManuscriptBlock[],
  languageHint: ModernLanguageHint = "PRT",
): ModernLineRow[] {
  const lines: ModernLineRow[] = [];
  for (const block of blocks) {
    const text = modernizeBlockLine(block, languageHint);
    if (!text) continue;
    lines.push({
      lineNumber: block.lineNumber ?? "",
      modernText: text,
      isRubric: block.type === "rubric" || block.type === "heading",
    });
  }
  return lines;
}

/** Fold accents and strip HSMS nasal/tilde markup for variant set membership. */
export function variantMatchKey(word: string): string {
  return foldForSearch(word)
    .replace(/~/g, "")
    .replace(/'/g, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Static memoized reverse lookup index for O(1) modern→historical expansions. */
const REVERSE_SPELLING = (() => {
  const map = new Map<string, Set<string>>();
  for (const [historical, modern] of Object.entries(MODERN_SPELLING_MAP)) {
    const key = variantMatchKey(modern);
    if (!key) continue;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = new Set<string>();
      map.set(key, bucket);
    }
    bucket.add(historical);
    bucket.add(modern.toLowerCase());
  }
  return map;
})();

/** Per-query caches — KWIC / frequency loops hit the same tokens repeatedly. */
const VARIANT_EXPAND_CACHE = new Map<string, string[]>();
const VARIANT_KEY_CACHE = new Map<string, Set<string>>();

/** Extra nasal / tilde spellings for common modern Portuguese endings. */
function nasalOrthographyVariants(foldedStemless: string): string[] {
  const out: string[] = [];
  if (foldedStemless.endsWith("ao") || foldedStemless.endsWith("ão")) {
    const stem = foldedStemless.replace(/ão$/i, "").replace(/ao$/i, "");
    out.push(`${stem}am`, `${stem}a~o`, `${stem}a~`, `${stem}ao`, `${stem}ão`, `${stem}õ`);
  } else if (foldedStemless.endsWith("ae") || foldedStemless.endsWith("ãe")) {
    const stem = foldedStemless.replace(/ãe$/i, "").replace(/ae$/i, "");
    out.push(`${stem}a~e`, `${stem}ae`, `${stem}ãe`);
  }
  return out;
}

/**
 * Expand a modern (or mixed) query word into diplomatic / historical surface variants
 * for concordance / KWIC lookup (e.g. não → nam, na~o, nao, …).
 * Cached — subsequent identical queries are O(1).
 */
export function expandHistoricalVariants(queryWord: string): string[] {
  const raw = queryWord.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase().normalize("NFC");
  const cached = VARIANT_EXPAND_CACHE.get(lower);
  if (cached) return cached;

  const key = variantMatchKey(lower);
  const out = new Set<string>([lower, key].filter(Boolean));

  const fromMap = REVERSE_SPELLING.get(key);
  if (fromMap) {
    for (const v of fromMap) out.add(v);
  }

  // If the query is already a historical key in the forward map, include its modern form + siblings.
  const modernOfHist = MODERN_SPELLING_MAP[lower] ?? MODERN_SPELLING_MAP[key];
  if (modernOfHist) {
    out.add(modernOfHist.toLowerCase());
    const siblings = REVERSE_SPELLING.get(variantMatchKey(modernOfHist));
    if (siblings) for (const v of siblings) out.add(v);
  }

  for (const v of nasalOrthographyVariants(key)) out.add(v);

  // Always keep the exact diplomatic-looking forms with ASCII tilde.
  if (key.endsWith("ao")) {
    const stem = key.slice(0, -2);
    out.add(`${stem}a~o`);
    out.add(`${stem}a~`);
  }

  const result = [...out].filter(Boolean);
  VARIANT_EXPAND_CACHE.set(lower, result);
  return result;
}

/** Match keys for KWIC / frequency scans over an expanded variant set. */
export function historicalVariantMatchKeys(queryWord: string): Set<string> {
  const raw = queryWord.trim().toLowerCase().normalize("NFC");
  if (!raw) return new Set();
  const cached = VARIANT_KEY_CACHE.get(raw);
  if (cached) return cached;

  const keys = new Set<string>();
  const variants = expandHistoricalVariants(queryWord);
  for (let i = 0; i < variants.length; i++) {
    const k = variantMatchKey(variants[i]);
    if (k) keys.add(k);
  }
  VARIANT_KEY_CACHE.set(raw, keys);
  return keys;
}
