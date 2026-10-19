import { placeholders } from "../scripts/i18n-check";
import { isAllowed } from "../scripts/i18n-literals";
import { extractI18nTriggersForRecipe } from "../utils/copilot/i18nTriggerSeeds";
import { askCopilot } from "../utils/copilot/ask";
import { compileManuscriptTree } from "../utils/compiler";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt.json";
import en from "../i18n/locales/en.json";

describe("i18n multilingual support", () => {
  it("allows HSMS / paleographic tokens as non-UI literals", () => {
    expect(isAllowed("{CB1.}")).toBe(true);
    expect(isAllowed("{RUB.}")).toBe(true);
    expect(isAllowed("[fol. 1r]")).toBe(true);
    expect(isAllowed("[*text]")).toBe(true);
    expect(isAllowed("(^text)")).toBe(true);
    expect(isAllowed("&qmacr;")).toBe(true);
    expect(isAllowed("q<ue>")).toBe(true);
    expect(isAllowed("12px")).toBe(true);
    expect(isAllowed("Save manuscript")).toBe(false);
  });

  it("extracts ICU plural arg names without treating # as a placeholder", () => {
    const msg =
      'Occurrences of "{word}": {total, plural, one {# time} other {# times}} across {folios, plural, one {# folio} other {# folios}}.';
    expect(placeholders(msg)).toEqual(["folios", "total", "word"]);
  });

  it("matches placeholders across regional plural wording", () => {
    const enMsg = String(en["copilot.recipe.stats.term_frequency.answer"]);
    const esMsg = String(es["copilot.recipe.stats.term_frequency.answer"]);
    expect(placeholders(enMsg)).toEqual(placeholders(esMsg));
  });

  it("seeds Spanish chip labels as triggers", () => {
    const seeded = extractI18nTriggersForRecipe(
      "stats.term_frequency",
      {
        en: en as Record<string, string>,
        es: es as Record<string, string>,
        pt: pt as Record<string, string>,
      },
      { en: ["how many times is"] },
    );
    expect(seeded.es?.some((p) => /recuento|conteo|contagem|frecuencia/.test(p))).toBe(true);
    expect(seeded.es?.some((p) => p.startsWith("mostrar") || p.startsWith("ver"))).toBe(true);
  });

  it("routes Spanish count questions to stats.term_frequency", () => {
    const parsed = compileManuscriptTree(`[fol. 1r]\n{CB1.\n1 muito excelente\n}`);
    const answer = askCopilot("cuántas veces aparece muito", parsed);
    expect(answer.recipeId).toBe("stats.term_frequency");
  });
});

