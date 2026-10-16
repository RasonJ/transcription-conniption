import { formatMessage, type MessageParams } from "./messageFormat";
import type { MessageKey } from "./generated/messageKeys";
import en from "./locales/en.json";
import termsEn from "./terms/en.json";

export type { MessageKey } from "./generated/messageKeys";
export type { MessageParams } from "./messageFormat";

export const LOCALE_STORAGE_KEY = "hsms.i18n.locale.v1";

/** Tier 1: complete, reviewed, release-blocking (SPEC-I18N §2). Regional variants included. */
export const TIER1_LOCALES = [
  "en",
  "es",
  "es-ES",
  "es-419",
  "es-MX",
  "es-AR",
  "pt",
  "pt-PT",
  "pt-BR",
  "ca",
  "ca-ES-valencia",
  "gl",
  "eu",
] as const;

/** Tier 2: community-maintained; missing keys resolve through the fallback chain. */
export const TIER2_LOCALES = ["ast", "an", "oc-aranes", "qu", "gn", "ay"] as const;

/** Development-only pseudo-locale: accented, ~40% longer, bracketed (SPEC-I18N §6). */
export const PSEUDO_LOCALE = "en-XA" as const;

export const SUPPORTED_LOCALES = [...TIER1_LOCALES, ...TIER2_LOCALES, PSEUDO_LOCALE] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

type Catalog = Record<string, string>;

export const FALLBACK_CHAINS: Record<Locale, readonly Locale[]> = {
  en: ["en"],
  es: ["es", "en"],
  "es-ES": ["es-ES", "es", "en"],
  "es-419": ["es-419", "es", "en"],
  "es-MX": ["es-MX", "es-419", "es", "en"],
  "es-AR": ["es-AR", "es-419", "es", "en"],
  pt: ["pt", "en"],
  "pt-PT": ["pt-PT", "pt", "en"],
  "pt-BR": ["pt-BR", "pt", "en"],
  ca: ["ca", "es", "en"],
  "ca-ES-valencia": ["ca-ES-valencia", "ca", "es", "en"],
  gl: ["gl", "es", "en"],
  eu: ["eu", "es", "en"],
  ast: ["ast", "es-ES", "es", "en"],
  an: ["an", "es-ES", "es", "en"],
  "oc-aranes": ["oc-aranes", "ca", "es-ES", "es", "en"],
  qu: ["qu", "es-419", "es", "en"],
  gn: ["gn", "es-419", "es", "en"],
  ay: ["ay", "es-419", "es", "en"],
  "en-XA": ["en-XA", "en"],
};

/**
 * Galician falls back to Spanish by default; some users prefer Portuguese (SPEC-I18N §12 Q1).
 * Overrides are applied on top of FALLBACK_CHAINS.
 */
const chainOverrides: Partial<Record<Locale, readonly Locale[]>> = {};

export function setFallbackChain(locale: Locale, chain: readonly Locale[]): void {
  if (chain[0] !== locale || chain[chain.length - 1] !== "en") {
    throw new Error(`Fallback chain for ${locale} must start with it and end with en`);
  }
  chainOverrides[locale] = chain;
}

/**
 * Catalog loaders. Only `en` is in the startup bundle; every other locale is a lazy chunk on
 * web (I18N-3) and a lazily-evaluated module on native. Literal paths keep Metro able to
 * split each file.
 */
const CATALOG_LOADERS: Partial<Record<Locale, () => Promise<{ default: Catalog }>>> = {
  es: () => import("./locales/es.json"),
  "es-ES": () => import("./locales/es-ES.json"),
  "es-419": () => import("./locales/es-419.json"),
  "es-MX": () => import("./locales/es-MX.json"),
  "es-AR": () => import("./locales/es-AR.json"),
  pt: () => import("./locales/pt.json"),
  "pt-PT": () => import("./locales/pt-PT.json"),
  "pt-BR": () => import("./locales/pt-BR.json"),
  ca: () => import("./locales/ca.json"),
  "ca-ES-valencia": () => import("./locales/ca-ES-valencia.json"),
  gl: () => import("./locales/gl.json"),
  eu: () => import("./locales/eu.json"),
  ast: () => import("./locales/ast.json"),
  an: () => import("./locales/an.json"),
  "oc-aranes": () => import("./locales/oc-aranes.json"),
  qu: () => import("./locales/qu.json"),
  gn: () => import("./locales/gn.json"),
  ay: () => import("./locales/ay.json"),
};

const TERM_LOADERS: Record<string, () => Promise<{ default: Catalog }>> = {
  es: () => import("./terms/es.json"),
  pt: () => import("./terms/pt.json"),
  ca: () => import("./terms/ca.json"),
  gl: () => import("./terms/gl.json"),
  eu: () => import("./terms/eu.json"),
};

const catalogs: Partial<Record<Locale, Catalog>> = { en };
const termCatalogs: Partial<Record<string, Catalog>> = { en: termsEn };
const pending = new Map<string, Promise<void>>();

const LATAM_REGIONS = new Set([
  "419", "MX", "AR", "CO", "CL", "PE", "VE", "UY", "PY", "BO", "EC", "CR", "PA", "GT", "HN",
  "NI", "SV", "DO", "CU", "PR", "US",
]);

/** Add or replace a catalog at runtime (community locales, tests). */
export function registerCatalog(locale: Locale, catalog: Catalog): void {
  catalogs[locale] = catalog;
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isCommunityLocale(locale: Locale): boolean {
  return (TIER2_LOCALES as readonly string[]).includes(locale);
}

/**
 * BCP 47 lookup against the supported list (`es-MX` → `es-MX`, `es-CO` → `es-419`,
 * `pt-AO` → `pt-PT`, `ca-ES-valencia` → `ca-ES-valencia`, `quz-PE` → `qu`).
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  if (!tag) return "en";
  const normalized = tag.replace(/_/g, "-");
  const parts = normalized.split("-");
  const lang = parts[0].toLowerCase();
  const region = parts.find((p, i) => i > 0 && /^([A-Za-z]{2}|\d{3})$/.test(p))?.toUpperCase();
  const variants = parts.slice(1).map((p) => p.toLowerCase());

  switch (lang) {
    case "es":
      if (!region) return "es";
      if (region === "ES") return "es-ES";
      if (region === "MX") return "es-MX";
      if (region === "AR") return "es-AR";
      return LATAM_REGIONS.has(region) ? "es-419" : "es-ES";
    case "pt":
      if (!region) return "pt";
      return region === "BR" ? "pt-BR" : "pt-PT";
    case "ca":
      return variants.includes("valencia") ? "ca-ES-valencia" : "ca";
    case "oc":
      return variants.includes("aranes") || region === "ES" ? "oc-aranes" : "en";
    case "qu":
    case "quz":
    case "quy":
      return "qu";
    case "gn":
    case "gug":
      return "gn";
    case "ay":
    case "ayr":
      return "ay";
    case "gl":
    case "eu":
    case "ast":
    case "an":
    case "en":
      return lang;
    default:
      return "en";
  }
}

export function getFallbackChain(locale: Locale): readonly Locale[] {
  return chainOverrides[locale] ?? FALLBACK_CHAINS[locale] ?? FALLBACK_CHAINS.en;
}

function languageOf(locale: Locale): string {
  return locale.split("-")[0];
}

/** Pseudo-localize English: accents, ~40% padding, brackets; placeholders left intact. */
export function pseudoLocalize(message: string): string {
  const MAP: Record<string, string> = {
    a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", y: "ý",
    A: "Å", E: "É", I: "Î", O: "Ø", U: "Ü", C: "Ç", N: "Ñ", Y: "Ý",
  };
  let depth = 0;
  let out = "";
  let letters = 0;
  for (const ch of message) {
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && MAP[ch]) {
      out += MAP[ch];
      letters++;
    } else {
      out += ch;
      if (depth === 0 && /[A-Za-z]/.test(ch)) letters++;
    }
  }
  const pad = "~".repeat(Math.ceil(letters * 0.4));
  return `[${out}${pad ? ` ${pad}` : ""}]`;
}

function pseudoCatalog(): Catalog {
  const out: Catalog = {};
  for (const [key, value] of Object.entries(en as Catalog)) {
    // Plural/select bodies are left in English so ICU syntax stays valid.
    out[key] = /\{\s*\w+\s*,\s*(plural|select)/.test(value) ? `[${value}]` : pseudoLocalize(value);
  }
  return out;
}

function loadCatalog(locale: Locale): Promise<void> {
  if (catalogs[locale]) return Promise.resolve();
  if (locale === PSEUDO_LOCALE) {
    catalogs[locale] = pseudoCatalog();
    return Promise.resolve();
  }
  const key = `catalog:${locale}`;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const loader = CATALOG_LOADERS[locale];
  if (!loader) return Promise.resolve();
  const p = loader()
    .then((m) => {
      catalogs[locale] = (m.default ?? m) as Catalog;
    })
    .catch(() => {
      // A missing chunk degrades to the next locale in the chain; never block the UI.
      catalogs[locale] = {};
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

function loadTerms(lang: string): Promise<void> {
  if (termCatalogs[lang] || !TERM_LOADERS[lang]) return Promise.resolve();
  const key = `terms:${lang}`;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const p = TERM_LOADERS[lang]()
    .then((m) => {
      termCatalogs[lang] = (m.default ?? m) as Catalog;
    })
    .catch(() => undefined)
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** True once every catalog in the locale's chain is in memory (switching to it is then synchronous). */
export function isLocaleLoaded(locale: Locale): boolean {
  return getFallbackChain(locale).every((l) => catalogs[l] !== undefined);
}

/** Load the catalogs (and glossary terms) for a locale's whole fallback chain. */
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  const chain = getFallbackChain(locale);
  await Promise.all([
    ...chain.map(loadCatalog),
    ...chain.map((l) => loadTerms(languageOf(l))),
  ]);
}

/** Idle-time prefetch of all Tier 1 catalogs so the first switch is instant (I18N-4). */
export function prefetchTier1Locales(): Promise<void> {
  return Promise.all(TIER1_LOCALES.map((l) => ensureLocaleLoaded(l))).then(() => undefined);
}

/** Load every catalog (tests, Node scripts). */
export function ensureAllLocalesLoaded(): Promise<void> {
  return Promise.all(SUPPORTED_LOCALES.map((l) => ensureLocaleLoaded(l))).then(() => undefined);
}

function resolveTermFor(chain: readonly Locale[], id: string): string | undefined {
  for (const loc of chain) {
    const term = termCatalogs[loc]?.[id] ?? termCatalogs[languageOf(loc)]?.[id];
    if (term !== undefined) return term;
  }
  return undefined;
}

/**
 * Resolve a message through the locale's fallback chain. Catalogs not yet loaded are skipped,
 * so a message falls through to English rather than showing a raw key. Unknown keys return
 * the key itself.
 */
export function translate(locale: Locale, key: MessageKey | (string & {}), params?: MessageParams): string {
  const chain = getFallbackChain(locale);
  for (const loc of chain) {
    const message = catalogs[loc]?.[key];
    if (typeof message === "string") {
      return formatMessage(message, params, {
        locale: loc === PSEUDO_LOCALE ? "en" : loc,
        resolveTerm: (id) => resolveTermFor(chain, id),
      });
    }
  }
  return key;
}

/** True when `key` exists in the source (en) catalog, so `translate` will not return the raw key. */
export function hasMessage(key: string): boolean {
  return typeof (en as Catalog)[key] === "string";
}

let activeLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  if (locale === activeLocale) return;
  activeLocale = locale;
  listeners.forEach((fn) => fn(locale));
}

export function subscribeActiveLocale(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Translate with the active locale; for code outside React (alerts, non-component helpers). */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(activeLocale, key, params);
}

/** Number formatting in the UI locale (copilot statistics, counts). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale: Locale = activeLocale): string {
  const tag = locale === PSEUDO_LOCALE ? "en" : locale === "oc-aranes" ? "oc" : locale;
  try {
    return new Intl.NumberFormat(tag, options).format(value);
  } catch {
    return String(value);
  }
}

export function detectDeviceLocale(): Locale {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const tags = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
    for (const tag of tags) {
      const resolved = resolveLocale(tag);
      if (resolved !== "en" || tag.toLowerCase().startsWith("en")) return resolved;
    }
    return resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "en";
  }
}

export async function loadStoredLocale(): Promise<Locale | null> {
  try {
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function persistLocale(locale: Locale): Promise<void> {
  try {
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort; the in-memory locale still applies.
  }
}

export type TFunction = (key: MessageKey, params?: MessageParams) => string;
