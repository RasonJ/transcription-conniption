import { compileManuscriptTree } from "../utils/compiler";
import {
  buildLanguageAwareConcordance,
  formatConcordanceMethodLine,
} from "../utils/concordance";
import { mapMnemonicToWitnessLanguage, resolveEffectiveTokenLanguage } from "../utils/lemma/effectiveLanguage";
import { lemmaSourceRegistry } from "../utils/lemma/sources";
import type { ManuscriptBlock, Token } from "../constants/manuscript";

describe("lemmaSourceRegistry (LEX-1)", () => {
  it("registers OSTA only for SPN", () => {
    expect(lemmaSourceRegistry.getSourceForLanguage("SPN")?.id).toBe("osta-old-spanish");
    expect(lemmaSourceRegistry.getSourceForLanguage("PRT")).toBeNull();
    expect(lemmaSourceRegistry.getSourceForLanguage("GAL")).toBeNull();
    expect(lemmaSourceRegistry.getSourceForLanguage("CAT")).toBeNull();
    expect(lemmaSourceRegistry.getSourceForLanguage("LAT")).toBeNull();
  });
});

describe("resolveEffectiveTokenLanguage (LEX-2)", () => {
  const block = (language?: string): ManuscriptBlock => ({
    type: "prose",
    columns: 1,
    tokens: [],
    language,
  });

  it("maps mnemonics and prefers innermost env layer", () => {
    expect(mapMnemonicToWitnessLanguage("POR")).toBe("PRT");
    expect(mapMnemonicToWitnessLanguage("LAT")).toBe("LAT");

    const token: Token = {
      type: "text",
      value: "est",
      raw: "est",
      envLayers: [
        { type: "language_span", code: "PRT" },
        { type: "language_span", code: "LAT" },
      ],
    };
    expect(resolveEffectiveTokenLanguage(token, block("SPN"), "SPN")).toBe("LAT");
  });

  it("honors workspace override over spans", () => {
    const token: Token = {
      type: "text",
      value: "mundo",
      raw: "mundo",
      envLayers: [{ type: "language_span", code: "LAT" }],
    };
    expect(resolveEffectiveTokenLanguage(token, block(), "PRT", "SPN")).toBe("SPN");
  });
});

describe("language-gated concordance (LEX-3)", () => {
  it("groups Portuguese witness by word form (no Spanish haber lemma)", () => {
    const raw = `[fol. 1r]
{CB1.
a primeira he sustancial que he o primeyro mobile
DUas diuisoẽs ha no mundo
}`;
    const parsed = compileManuscriptTree(raw);
    const { index, meta } = buildLanguageAwareConcordance(parsed, { language: "PRT" });

    expect(meta.mode).toBe("form");
    expect(meta.sourceId).toBeUndefined();
    expect(formatConcordanceMethodLine(meta)).toMatch(/word forms/i);
    expect(formatConcordanceMethodLine(meta)).toMatch(/PRT/);

    // Must not collapse Portuguese *he* into Spanish lemma *haber*.
    expect(index.haber).toBeUndefined();
    const heKey = Object.keys(index).find((k) => k === "he" || index[k]?.variants?.he);
    expect(heKey).toBeTruthy();
    if (heKey) {
      expect(index[heKey].mode).toBe("word_form");
      expect(index[heKey].count).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows SPN witnesses to use the OSTA source when lemmas are available", () => {
    const raw = `[fol. 1r]
{CB1.
el omne fizo esto
}`;
    const parsed = compileManuscriptTree(raw);
    const { meta } = buildLanguageAwareConcordance(parsed, { language: "SPN" });
    expect(meta.sourceId).toBe("osta-old-spanish");
    // Without dictionary loaded, lookups return null → word_form entries still ok.
    expect(["lemma", "form", "mixed"]).toContain(meta.mode);
  });
});
