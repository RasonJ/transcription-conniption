export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

type PluralRule = (n: number) => PluralCategory;

const isMillionMultiple = (n: number) => n !== 0 && Number.isInteger(n) && n % 1_000_000 === 0;

const oneOther: PluralRule = (n) => (n === 1 ? "one" : "other");

const romanceOneManyOther: PluralRule = (n) => {
  if (n === 1) return "one";
  if (isMillionMultiple(n)) return "many";
  return "other";
};

const ptBr: PluralRule = (n) => {
  if (n >= 0 && n < 2) return "one";
  if (isMillionMultiple(n)) return "many";
  return "other";
};

/**
 * Static CLDR rules used when `Intl.PluralRules` is missing or its `select` throws
 * (Hermes and other bare runtimes). Iberian locales use `one` / `many` / `other` only;
 * `few` and `two` are not categories for these languages.
 */
const FALLBACK_RULES: Record<string, PluralRule> = {
  en: oneOther,
  es: romanceOneManyOther,
  "es-ES": romanceOneManyOther,
  "es-419": romanceOneManyOther,
  "es-MX": romanceOneManyOther,
  "es-AR": romanceOneManyOther,
  pt: ptBr,
  "pt-BR": ptBr,
  "pt-PT": romanceOneManyOther,
  ca: romanceOneManyOther,
  "ca-ES-valencia": romanceOneManyOther,
  gl: oneOther,
  eu: oneOther,
  ast: oneOther,
  an: oneOther,
  oc: romanceOneManyOther,
  "oc-aranes": romanceOneManyOther,
  qu: oneOther,
  gn: oneOther,
  ay: oneOther,
};

const intlCache = new Map<string, Intl.PluralRules | null>();

function getIntlRules(locale: string): Intl.PluralRules | null {
  if (intlCache.has(locale)) return intlCache.get(locale) ?? null;
  let rules: Intl.PluralRules | null = null;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") {
      const supported = Intl.PluralRules.supportedLocalesOf([locale]);
      if (supported.length > 0) rules = new Intl.PluralRules(locale);
    }
  } catch {
    rules = null;
  }
  intlCache.set(locale, rules);
  return rules;
}

export function pluralCategoryFallback(locale: string, n: number): PluralCategory {
  const rule =
    FALLBACK_RULES[locale] ?? FALLBACK_RULES[locale.split("-")[0]] ?? FALLBACK_RULES.en;
  return rule(n);
}

export function pluralCategory(locale: string, n: number): PluralCategory {
  const rules = getIntlRules(locale);
  if (rules) {
    try {
      return rules.select(n) as PluralCategory;
    } catch {
      // Incomplete PluralRules data (common on Hermes) must not surface as a throw.
    }
  }
  return pluralCategoryFallback(locale, n);
}
