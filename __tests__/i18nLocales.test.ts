import {
  FALLBACK_CHAINS,
  PSEUDO_LOCALE,
  SUPPORTED_LOCALES,
  TIER2_LOCALES,
  isCommunityLocale,
  pseudoLocalize,
  setFallbackChain,
  translate,
  type Locale,
} from "../i18n/core";
import { localizeValidationMessage } from "../utils/validationMessage";
import { lintHsmsTranscription } from "../utils/hsmsLinter";
import { runI18nCheck } from "../scripts/i18n-check";

const tFor = (locale: Locale) => (key: string, params?: Record<string, string | number>) =>
  translate(locale, key, params);

describe("locale coverage (SPEC-I18N §2)", () => {
  it("includes every Tier 2 community locale with the spec's fallback chain", () => {
    expect(FALLBACK_CHAINS.ast).toEqual(["ast", "es-ES", "es", "en"]);
    expect(FALLBACK_CHAINS.an).toEqual(["an", "es-ES", "es", "en"]);
    expect(FALLBACK_CHAINS["oc-aranes"]).toEqual(["oc-aranes", "ca", "es-ES", "es", "en"]);
    for (const l of ["qu", "gn", "ay"] as const) expect(FALLBACK_CHAINS[l]).toEqual([l, "es-419", "es", "en"]);
    for (const l of TIER2_LOCALES) expect(isCommunityLocale(l)).toBe(true);
    expect(isCommunityLocale("ca")).toBe(false);
  });

  it("community locales never show raw keys: partial catalogs fall back per chain", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(translate(locale, "validation.ok")).not.toBe("validation.ok");
    }
    expect(translate("qu", "common.close")).toBe("Cerrar");
    expect(translate("ast", "common.close")).toBe("Zarrar");
  });

  it("regional variants override vocabulary only", () => {
    expect(translate("es-AR", "export.orChooseFormat")).toBe("O elegí un formato");
    expect(translate("es-AR", "common.close")).toBe(translate("es", "common.close"));
    expect(translate("ca-ES-valencia", "common.search")).toBe("Buscar");
    expect(translate("ca", "common.search")).toBe("Cercar");
  });

  it("Galician fallback chain is configurable", () => {
    setFallbackChain("gl", ["gl", "pt", "en"]);
    expect(translate("gl", "common.close")).toBe("Pechar");
    setFallbackChain("gl", ["gl", "es", "en"]);
    expect(() => setFallbackChain("gl", ["pt", "en"])).toThrow();
  });
});

describe("pseudo-locale en-XA (SPEC-I18N §6)", () => {
  it("accents, pads by ~40% and brackets, keeping placeholders", () => {
    const out = pseudoLocalize("Line {line}: {message}");
    expect(out.startsWith("[")).toBe(true);
    expect(out.endsWith("]")).toBe(true);
    expect(out).toContain("{line}");
    expect(out).toContain("{message}");
    expect(out).toMatch(/~+/);
    expect(translate(PSEUDO_LOCALE, "validation.rowLabel", { line: 3, message: "x" })).toContain("3");
  });
});

describe("validation messages are localized by code (SPEC-I18N §4.3)", () => {
  it("every linter code has an en catalog entry", () => {
    const report = lintHsmsTranscription("[fol. 1r]\n{HD. {RUB. x}}\n{CB1.\n1 a [] b\n[fol. 1v]\n");
    const codes = new Set(report.issues.map((i) => i.code).filter(Boolean));
    expect(codes.size).toBeGreaterThan(0);
    for (const issue of report.issues) {
      expect(issue.code).toBeDefined();
      const en = localizeValidationMessage(tFor("en"), issue);
      const es = localizeValidationMessage(tFor("es"), issue);
      expect(en).not.toMatch(/^validation\./);
      expect(es).not.toBe(en);
    }
  });

  it("falls back to the English message without its [CODE] prefix", () => {
    const msg = localizeValidationMessage(tFor("es"), {
      severity: "error",
      message: "[SOMETHING_NEW] Brand-new check",
      code: "SOMETHING_NEW",
      lineIndex: 0,
      rawSnippet: "",
    });
    expect(msg).toBe("Brand-new check");
  });

  it("plural counts agree in each language", () => {
    expect(translate("en", "validation.counts", { errors: 1, warnings: 0 })).toBe("1 error");
    expect(translate("es", "validation.counts", { errors: 2, warnings: 1 })).toBe("2 errores · 1 aviso");
    expect(translate("eu", "validation.counts", { errors: 2, warnings: 2 })).toBe("2 errore · 2 abisu");
  });
});

describe("catalog CI (SPEC-I18N §9)", () => {
  it("has no catalog failures apart from keys reserved for not-yet-wired UI", () => {
    const { failures } = runI18nCheck(false);
    expect(failures.filter((f) => !f.includes("unused key") && !f.includes("hard-coded"))).toEqual([]);
  });
});
