/**
 * Seed Copilot recipe triggers from i18n chip / label strings so Tier 1
 * natural-language queries (ES/PT/CA/GL/EU) resolve locally without Azure.
 *
 * Intentionally does not import the router/catalog (avoids circular init).
 */
import type { CopilotLocale } from "./types";

const TIER1 = ["en", "es", "pt", "ca", "gl", "eu"] as const satisfies readonly CopilotLocale[];

/** Locale-appropriate “show / list …” prefixes for chip-label seeding. */
const SHOW_PREFIX: Record<(typeof TIER1)[number], string[]> = {
  en: ["show", "list", "open"],
  es: ["mostrar", "ver", "lista de"],
  pt: ["mostrar", "ver", "listar"],
  ca: ["mostrar", "veure", "llista de"],
  gl: ["mostrar", "ver", "lista de"],
  eu: ["erakutsi", "ikusi", "zerrendatu"],
};

export type LocaleCatalog = Record<string, string>;

/** Lightweight normalize (mirrors router.normalizeQuery; no catalog import). */
function normalizeSeed(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build extra trigger phrases for one recipe from i18n catalogs
 * (`copilot.recipe.<id>.chip` and related labels).
 */
export function extractI18nTriggersForRecipe(
  recipeId: string,
  catalogs: Partial<Record<CopilotLocale, LocaleCatalog>>,
  existing?: Partial<Record<CopilotLocale, readonly string[]>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  for (const loc of TIER1) {
    const phrases = new Set<string>();
    for (const p of existing?.[loc] ?? []) {
      const n = normalizeSeed(p);
      if (n) phrases.add(n);
    }

    const catalog = catalogs[loc] ?? {};
    const chip = catalog[`copilot.recipe.${recipeId}.chip`];
    if (typeof chip === "string" && chip.trim()) {
      const chipNorm = normalizeSeed(chip);
      if (chipNorm) {
        phrases.add(chipNorm);
        for (const prefix of SHOW_PREFIX[loc]) {
          const seeded = normalizeSeed(`${prefix} ${chip}`);
          if (seeded) phrases.add(seeded);
        }
      }
    }

    const tail = recipeId.includes(".") ? recipeId.slice(recipeId.lastIndexOf(".") + 1) : recipeId;
    const label = catalog[`copilot.label.${tail}`];
    if (typeof label === "string" && label.trim()) {
      const labelNorm = normalizeSeed(label);
      if (labelNorm) phrases.add(labelNorm);
    }

    out[loc] = [...phrases];
  }

  return out;
}

/** Merge i18n seeds into a recipe triggers map (additive). */
export function mergeI18nTriggerSeeds(
  recipeId: string,
  triggers: Partial<Record<CopilotLocale, string[]>>,
  catalogs: Partial<Record<CopilotLocale, LocaleCatalog>>,
): Partial<Record<CopilotLocale, string[]>> {
  const seeded = extractI18nTriggersForRecipe(recipeId, catalogs, triggers);
  const merged: Partial<Record<CopilotLocale, string[]>> = { ...triggers };
  for (const loc of TIER1) {
    const set = new Set([...(merged[loc] ?? []), ...(seeded[loc] ?? [])]);
    merged[loc] = [...set];
  }
  return merged;
}
