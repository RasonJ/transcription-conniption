/**
 * Localized answer cards (SPEC-COPILOT §11): every recipe's answer, breakdown, method and
 * server note render in all Tier 1 base locales with no unresolved placeholders; exports
 * are deterministic.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { formatNumber, hasMessage, translate, type Locale } from "../i18n/core";
import { RECIPES } from "../utils/copilot/catalog";
import { runRecipeById } from "../utils/copilot/ask";
import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { answerToDelimited, localizeParams, presentAnswer } from "../utils/copilot/present";
import { parseHsMsText } from "../utils/manuscriptParser";

const LOCALES: Locale[] = ["en", "es", "pt", "ca", "gl", "eu"];
const ENTRY = join(__dirname, "..", "public", "library", "entries", "TEXT.GRM.json");
const CATALOGS = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(__dirname, "..", "i18n", "locales", `${l}.json`), "utf8")) as Record<string, string>]),
);
const UNRESOLVED = /\{[a-z][A-Za-z0-9]*\}/;

const helpers = (locale: Locale) => ({
  t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
  fmt: (v: number, o?: Intl.NumberFormatOptions) => formatNumber(v, o, locale),
});

describe("copilot catalog strings", () => {
  it("every recipe has a chip, answer template and method in every base locale", () => {
    for (const r of RECIPES) {
      for (const kind of ["chip", "answer", "method"]) {
        expect(hasMessage(`copilot.recipe.${r.id}.${kind}`)).toBe(true);
        for (const l of LOCALES.slice(1)) expect([l, r.id, kind, `copilot.recipe.${r.id}.${kind}` in CATALOGS[l]]).toEqual([l, r.id, kind, true]);
      }
    }
  });

  it("formats ratios with the locale's decimal separator", () => {
    expect(localizeParams({ ttr: "0.142", n: 3 }, helpers("es").fmt)).toEqual({ ttr: "0,142", n: 3 });
    expect(localizeParams({ ttr: "0.142" }, helpers("en").fmt)).toEqual({ ttr: "0.142" });
  });
});

const parsed = existsSync(ENTRY)
  ? parseHsMsText((JSON.parse(readFileSync(ENTRY, "utf8")) as { transcriptionText: string }).transcriptionText)
  : null;
const maybe = parsed ? describe : describe.skip;

maybe("answer cards on TEXT.GRM", () => {
  const facets = parsed ? buildFacetIndex(parsed) : undefined;
  const answers = parsed
    ? RECIPES.map((r) => runRecipeById(r.id, parsed, { facets, params: { word: "rey", lemma: "rey" }, query: "rey" })!)
    : [];

  it("render every recipe in every locale without unresolved placeholders", () => {
    for (const a of answers) {
      for (const l of LOCALES) {
        const { t, fmt } = helpers(l);
        const p = presentAnswer(a, t, hasMessage, fmt);
        const where = `${a.recipeId} [${l}]`;
        expect([where, p.headline]).not.toEqual([where, expect.stringMatching(UNRESOLVED)]);
        for (const b of p.breakdown) expect([where, b.label]).not.toEqual([where, expect.stringMatching(UNRESOLVED)]);
        if (p.serverNote) expect(p.serverNote).not.toMatch(UNRESOLVED);
      }
    }
  });

  it("localizes headlines (Spanish differs from English and uses locale numbers)", () => {
    const ttr = answers.find((a) => a.recipeId === "stats.ttr_hapax")!;
    const es = presentAnswer(ttr, helpers("es").t, hasMessage, helpers("es").fmt);
    const en = presentAnswer(ttr, helpers("en").t, hasMessage, helpers("en").fmt);
    expect(es.headline).not.toBe(en.headline);
    expect(es.headline).toMatch(/TTR 0,\d{3}/);
    expect(en.headline).toMatch(/TTR 0\.\d{3}/);
    expect(es.headline).toMatch(/38\.484 ocurrencias|\d+(\.\d{3})* ocurrencias/);
  });

  it("exports deterministic CSV/TSV with the method line and expression", () => {
    const a = answers.find((x) => x.recipeId === "corr.deletions_scribal_vs_editorial")!;
    const { t, fmt } = helpers("en");
    const p = presentAnswer(a, t, hasMessage, fmt);
    const csv1 = answerToDelimited(a, p, t("copilot.export.header"));
    const csv2 = answerToDelimited(a, p, t("copilot.export.header"));
    expect(csv1).toBe(csv2);
    expect(csv1.split("\n")[0]).toBe("folio,line,label,detail");
    expect(csv1).toContain("# Counted scribal_deletion");
    expect(csv1).toContain("recipe corr.deletions_scribal_vs_editorial");
    expect(answerToDelimited(a, p, t("copilot.export.header"), "\t").split("\n")[0]).toBe("folio\tline\tlabel\tdetail");
  });
});

describe("Tier B precision sheets", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scoreSheets, evenSample } = require("../scripts/tierb-precision") as typeof import("../scripts/tierb-precision");
  it("samples evenly and scores labeled rows only", () => {
    expect(evenSample([...Array(10).keys()], 5)).toEqual([0, 2, 4, 6, 8]);
    const rows = Array.from({ length: 30 }, (_, i) => `1r\t\tx\ty\t${i < 24 ? "y" : i < 28 ? "n" : ""}`);
    const text = ["folio\tline\tlabel\tdetail\tcorrect", ...rows].join("\n");
    expect(scoreSheets([{ recipeId: "morph.enclisis", text }])).toEqual({ "morph.enclisis": { precision: 0.857, labeled: 28 } });
    expect(scoreSheets([{ recipeId: "x", text: "folio\tcorrect\n1r\ty" }])).toEqual({});
  });
});
