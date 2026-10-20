/**
 * Witness-language features (SPEC-I18N §8). These depend on the manuscript's language, never
 * on the UI locale: stopword lists, language auto-detection, collation, accent-insensitive
 * search folding, and BCP 47 tags for screen readers.
 */
import type { ParsedManuscript } from "../constants/manuscript";
import { LANGUAGE_TAG_BCP47 } from "../constants/languageTags";
import { getStopwordsForLanguage } from "../constants/stopwords";

/** HSMS code for the witness's base language. `SPN` covers Old Castilian. */
export type WitnessLanguage = "SPN" | "PRT" | "GAL" | "CAT" | "LAT";

export const WITNESS_LANGUAGES: readonly WitnessLanguage[] = ["SPN", "PRT", "GAL", "CAT", "LAT"];

/** Distinctive high-frequency forms used only for detection (shared forms like "de" excluded). */
const DETECTION_MARKERS: Record<Exclude<WitnessLanguage, "GAL">, ReadonlySet<string>> = {
  SPN: new Set(["el", "los", "las", "del", "y", "con", "fue", "muy", "pero", "ella", "ellos", "dixo", "assi", "mucho", "esto", "este", "fizo", "auia", "seyendo"]),
  PRT: new Set(["o", "os", "do", "da", "dos", "das", "no", "na", "em", "com", "nom", "ao", "aos", "foy", "foi", "mui", "porem", "seu", "sua", "ou", "huum", "hua", "muyto", "pera"]),
  CAT: new Set(["dels", "ab", "als", "hi", "molt", "axi", "jo", "lur", "lurs", "perque", "aquells", "ço", "fo", "sens", "esser", "aquesta"]),
  LAT: new Set(["et", "est", "ad", "cum", "quod", "qui", "sunt", "enim", "autem", "sed", "ut", "eius", "atque", "quae", "sicut", "ergo"]),
};

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase and strip combining marks: "Rúbricas" → "rubricas" (search and matching only). */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

export function stopwordsFor(language: WitnessLanguage = "SPN"): ReadonlySet<string> {
  return getStopwordsForLanguage(language);
}

export function isWitnessLanguage(value: unknown): value is WitnessLanguage {
  return typeof value === "string" && (WITNESS_LANGUAGES as readonly string[]).includes(value);
}

export interface WitnessLanguageGuess {
  language: WitnessLanguage;
  /** Share of sampled words that are markers of the chosen language. */
  confidence: number;
  sampled: number;
}

const WORD_RE = /[\p{L}']+/gu;
const DEFAULT_SAMPLE = 2000;

/**
 * Guess the base language from the first ~2,000 words of the reading flow by counting
 * distinctive function words (cheap and deterministic). Galician and Portuguese share one
 * marker set and are reported as `PRT`; the user can override to `GAL`.
 */
export function detectWitnessLanguage(
  parsed: Pick<ParsedManuscript, "folios">,
  sampleSize: number = DEFAULT_SAMPLE,
): WitnessLanguageGuess {
  const scores: Record<string, number> = { SPN: 0, PRT: 0, CAT: 0, LAT: 0 };
  let sampled = 0;
  outer: for (const folio of parsed.folios) {
    const flow = folio.reconstructedFlow ?? "";
    WORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_RE.exec(flow)) !== null) {
      const w = foldForSearch(m[0]);
      sampled++;
      for (const lang of Object.keys(DETECTION_MARKERS) as Array<keyof typeof DETECTION_MARKERS>) {
        if (DETECTION_MARKERS[lang].has(w)) scores[lang]++;
      }
      if (sampled >= sampleSize) break outer;
    }
  }
  let best: WitnessLanguage = "SPN";
  let bestScore = -1;
  for (const lang of ["SPN", "PRT", "CAT", "LAT"] as const) {
    if (scores[lang] > bestScore) {
      best = lang;
      bestScore = scores[lang];
    }
  }
  return { language: best, confidence: sampled ? bestScore / sampled : 0, sampled };
}

/** BCP 47 tag for an HSMS language code (`LAT` → `la`), or undefined when unknown. */
export function bcp47ForHsmsCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return LANGUAGE_TAG_BCP47[code.toUpperCase()];
}

const collatorCache = new Map<string, (a: string, b: string) => number>();

/**
 * Sort comparator for lemma lists in the witness language (`Intl.Collator`, base sensitivity).
 * `traditional` treats "ch" and "ll" as letters (older Spanish reference works).
 */
export function witnessCollator(
  language: WitnessLanguage = "SPN",
  options: { traditional?: boolean } = {},
): (a: string, b: string) => number {
  const key = `${language}:${options.traditional ? "trad" : "std"}`;
  const cached = collatorCache.get(key);
  if (cached) return cached;
  const tag = bcp47ForHsmsCode(language) ?? "es";
  let compare: (a: string, b: string) => number;
  try {
    const collator = new Intl.Collator(
      options.traditional && language === "SPN" ? "es-u-co-trad" : tag,
      { sensitivity: "base" },
    );
    compare = collator.compare.bind(collator);
  } catch {
    compare = (a, b) => a.localeCompare(b);
  }
  collatorCache.set(key, compare);
  return compare;
}
