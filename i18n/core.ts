import { formatMessage, type MessageParams } from "./messageFormat";
import type { MessageKey } from "./generated/messageKeys";
import en from "./locales/en.json";
import es from "./locales/es.json";
import es419 from "./locales/es-419.json";
import esES from "./locales/es-ES.json";
import ca from "./locales/ca.json";
import gl from "./locales/gl.json";
import eu from "./locales/eu.json";
import pt from "./locales/pt.json";
import ptBR from "./locales/pt-BR.json";
import ptPT from "./locales/pt-PT.json";
import termsEn from "./terms/en.json";
import termsEs from "./terms/es.json";
import termsPt from "./terms/pt.json";
import termsCa from "./terms/ca.json";
import termsGl from "./terms/gl.json";
import termsEu from "./terms/eu.json";

export type { MessageKey } from "./generated/messageKeys";
export type { MessageParams } from "./messageFormat";

export const LOCALE_STORAGE_KEY = "hsms.i18n.locale.v1";

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "es-ES",
  "es-419",
  "pt",
  "pt-PT",
  "pt-BR",
  "ca",
  "gl",
  "eu",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

type Catalog = Record<string, string>;

export const FALLBACK_CHAINS: Record<Locale, readonly Locale[]> = {
  en: ["en"],
  es: ["es", "en"],
  "es-ES": ["es-ES", "es", "en"],
  "es-419": ["es-419", "es", "en"],
  pt: ["pt", "en"],
  "pt-PT": ["pt-PT", "pt", "en"],
  "pt-BR": ["pt-BR", "pt", "en"],
  ca: ["ca", "es", "en"],
  gl: ["gl", "es", "en"],
  eu: ["eu", "es", "en"],
};

const catalogs: Partial<Record<Locale, Catalog>> = {
  en,
  es,
  "es-ES": esES,
  "es-419": es419,
  ca,
  gl,
  eu,
  pt,
  "pt-PT": ptPT,
  "pt-BR": ptBR,
};

const termCatalogs: Partial<Record<string, Catalog>> = {
  en: termsEn,
  es: termsEs,
  pt: termsPt,
  ca: termsCa,
  gl: termsGl,
  eu: termsEu,
};

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

/** BCP 47 lookup against the supported list (`es-MX` → `es-419`, `pt-AO` → `pt-PT`). */
export function resolveLocale(tag: string | null | undefined): Locale {
  if (!tag) return "en";
  const parts = tag.replace(/_/g, "-").split("-");
  const lang = parts[0].toLowerCase();
  const region = parts.find((p, i) => i > 0 && /^([A-Za-z]{2}|\d{3})$/.test(p))?.toUpperCase();

  switch (lang) {
    case "es":
      if (!region) return "es";
      return region === "ES" ? "es-ES" : LATAM_REGIONS.has(region) ? "es-419" : "es-ES";
    case "pt":
      if (!region) return "pt";
      return region === "BR" ? "pt-BR" : "pt-PT";
    case "ca":
    case "gl":
    case "eu":
    case "en":
      return lang;
    default:
      return "en";
  }
}

export function getFallbackChain(locale: Locale): readonly Locale[] {
  return FALLBACK_CHAINS[locale] ?? FALLBACK_CHAINS.en;
}

function languageOf(locale: Locale): string {
  return locale.split("-")[0];
}

function resolveTermFor(chain: readonly Locale[], id: string): string | undefined {
  for (const loc of chain) {
    const term = termCatalogs[loc]?.[id] ?? termCatalogs[languageOf(loc)]?.[id];
    if (term !== undefined) return term;
  }
  return undefined;
}

/** Resolve a message through the locale's fallback chain; unknown keys return the key itself. */
export function translate(locale: Locale, key: MessageKey | (string & {}), params?: MessageParams): string {
  const chain = getFallbackChain(locale);
  for (const loc of chain) {
    const message = catalogs[loc]?.[key];
    if (typeof message === "string") {
      return formatMessage(message, params, {
        locale: loc,
        resolveTerm: (id) => resolveTermFor(chain, id),
      });
    }
  }
  return key;
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

/** Translate with the active locale; for code outside React. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(activeLocale, key, params);
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
