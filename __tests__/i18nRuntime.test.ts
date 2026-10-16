import { formatMessage } from "../i18n/messageFormat";
import { pluralCategory, pluralCategoryFallback } from "../i18n/plural";
import {
  FALLBACK_CHAINS,
  getFallbackChain,
  LOCALE_STORAGE_KEY,
  registerCatalog,
  resolveLocale,
  SUPPORTED_LOCALES,
  translate,
} from "../i18n/core";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt.json";
import { collectMessageKeys } from "../scripts/i18n-types";

describe("i18n fallback chains", () => {
  it("defines a chain for every supported locale ending in en", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const chain = getFallbackChain(locale);
      expect(chain[0]).toBe(locale);
      expect(chain[chain.length - 1]).toBe("en");
    }
  });

  it("matches the spec chains", () => {
    expect(FALLBACK_CHAINS["es-ES"]).toEqual(["es-ES", "es", "en"]);
    expect(FALLBACK_CHAINS["es-419"]).toEqual(["es-419", "es", "en"]);
    expect(FALLBACK_CHAINS["pt-PT"]).toEqual(["pt-PT", "pt", "en"]);
    expect(FALLBACK_CHAINS["pt-BR"]).toEqual(["pt-BR", "pt", "en"]);
    expect(FALLBACK_CHAINS.ca).toEqual(["ca", "es", "en"]);
    expect(FALLBACK_CHAINS.gl).toEqual(["gl", "es", "en"]);
    expect(FALLBACK_CHAINS.eu).toEqual(["eu", "es", "en"]);
  });

  it("uses the persistence key from the spec", () => {
    expect(LOCALE_STORAGE_KEY).toBe("hsms.i18n.locale.v1");
  });

  it("resolves device tags with BCP 47 lookup", () => {
    expect(resolveLocale("es-MX")).toBe("es-MX");
    expect(resolveLocale("es-CO")).toBe("es-419");
    expect(resolveLocale("es-AR")).toBe("es-AR");
    expect(resolveLocale("ca-ES-valencia")).toBe("ca-ES-valencia");
    expect(resolveLocale("quz-PE")).toBe("qu");
    expect(resolveLocale("gn-PY")).toBe("gn");
    expect(resolveLocale("es-ES")).toBe("es-ES");
    expect(resolveLocale("es")).toBe("es");
    expect(resolveLocale("pt-AO")).toBe("pt-PT");
    expect(resolveLocale("pt_BR")).toBe("pt-BR");
    expect(resolveLocale("ca-ES")).toBe("ca");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });
});

describe("i18n translate", () => {
  it("translates through the base catalog", () => {
    expect(translate("es", "common.close")).toBe("Cerrar");
    expect(translate("pt", "common.close")).toBe("Fechar");
  });

  it("applies regional overrides before the base", () => {
    expect(translate("pt-BR", "common.save")).toBe("Salvar");
    expect(translate("pt-PT", "common.save")).toBe("Guardar");
    expect(translate("es-ES", "common.close")).toBe("Cerrar");
  });

  it("falls back to en for keys missing from the chain", () => {
    registerCatalog("eu", { "common.close": "Itxi" });
    expect(translate("eu", "common.close")).toBe("Itxi");
    expect(translate("eu", "common.cancel")).toBe("Cancelar");
    expect(translate("gl", "common.cancel")).toBe("Cancelar");
    const withoutEs = { ...es } as Record<string, string>;
    delete withoutEs["common.retry"];
    registerCatalog("es", withoutEs);
    try {
      expect(translate("es-ES", "common.retry")).toBe("Retry");
    } finally {
      registerCatalog("es", es);
    }
  });

  it("returns the key when it is missing everywhere", () => {
    expect(translate("es-419", "nope.missing" as never)).toBe("nope.missing");
  });

  it("interpolates named params", () => {
    expect(translate("en", "studio.stat.lines", { count: 12 })).toBe("Lines: 12");
    expect(translate("es", "validation.UNCLOSED_ENV", { mnemonic: "{RUB.", line: 4 })).toBe(
      "{RUB. sin cerrar en la línea 4.",
    );
  });

  it("resolves glossary terms through the chain", () => {
    expect(translate("en", "hsms.term.catchword")).toBe("catchword");
    expect(translate("es-419", "hsms.term.catchword")).toBe("reclamo");
    expect(translate("pt-BR", "hsms.term.signature")).toBe("assinatura");
  });

  it("keeps es and pt base catalogs in step with en", () => {
    const keys = collectMessageKeys(en);
    for (const key of keys) {
      expect(typeof (es as Record<string, string>)[key]).toBe("string");
      expect(typeof (pt as Record<string, string>)[key]).toBe("string");
    }
  });
});

describe("i18n plural formatting", () => {
  it("formats one/other in en", () => {
    expect(translate("en", "copilot.passagesFound", { count: 1, intent: "search" })).toBe(
      "1 passage · search",
    );
    expect(translate("en", "copilot.passagesFound", { count: 3, intent: "search" })).toBe(
      "3 passages · search",
    );
  });

  it("formats one/other in es and pt", () => {
    expect(translate("es", "validation.summary", { count: 1 })).toBe("1 incidencia");
    expect(translate("es", "validation.summary", { count: 2 })).toBe("2 incidencias");
    expect(translate("pt-BR", "validation.summary", { count: 1 })).toBe("1 problema");
    expect(translate("pt-BR", "validation.summary", { count: 5 })).toBe("5 problemas");
  });

  it("supports exact matches, many, and select", () => {
    const msg = "{n, plural, =0 {none} one {# item} many {# of items} other {# items}}";
    expect(formatMessage(msg, { n: 0 }, { locale: "en" })).toBe("none");
    expect(formatMessage(msg, { n: 1 }, { locale: "en" })).toBe("1 item");
    expect(formatMessage(msg, { n: 1_000_000 }, { locale: "es" })).toMatch(/items?$/);
    const select = "{g, select, f {She} m {He} other {They}} left";
    expect(formatMessage(select, { g: "f" })).toBe("She left");
    expect(formatMessage(select, { g: "x" })).toBe("They left");
  });

  it("leaves unknown params visible", () => {
    expect(formatMessage("Hi {name}")).toBe("Hi {name}");
  });

  it("static fallback table covers Tier 1 locales", () => {
    expect(pluralCategoryFallback("en", 1)).toBe("one");
    expect(pluralCategoryFallback("en", 2)).toBe("other");
    expect(pluralCategoryFallback("es-419", 1)).toBe("one");
    expect(pluralCategoryFallback("es-ES", 1_000_000)).toBe("many");
    expect(pluralCategoryFallback("pt-BR", 0)).toBe("one");
    expect(pluralCategoryFallback("pt-PT", 0)).toBe("other");
    expect(pluralCategoryFallback("ca", 2)).toBe("other");
    expect(pluralCategoryFallback("eu", 1)).toBe("one");
    expect(pluralCategoryFallback("xx", 1)).toBe("one");
  });

  it("pluralCategory always returns a category", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(["zero", "one", "two", "few", "many", "other"]).toContain(pluralCategory(locale, 1));
    }
  });
});
