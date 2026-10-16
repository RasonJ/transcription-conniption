import type { CopilotLocale } from "./types";
import { MANUSCRIPT_INTENT_PROTOTYPES } from "@/constants/manuscriptIntents";
import type { LibraryCatalog, LibraryCatalogEntry } from "@/utils/libraryCatalog";
import { RECIPES } from "@/utils/copilot/catalog";
import { buildRouterIndex, type RouterIndex } from "@/utils/copilot/router";

/** Large enough for OSTA + Celestina combined library catalogs. */
const MAX_VOCAB_CHARS = 12000;
const MAX_ENTRIES = 800;

/** Distinctive library vocabulary for intent / passage-search prototypes. */
export function libraryCatalogVocabulary(
  catalog: LibraryCatalog | null | undefined,
  limit = MAX_ENTRIES,
): string {
  if (!catalog?.entries?.length) return "";

  const parts: string[] = [];
  const seen = new Set<string>();
  let used = 0;

  for (let i = 0; i < catalog.entries.length && used < limit; i++) {
    const entry = catalog.entries[i];
    if (entry.status !== "ok") continue;
    used++;
    for (const raw of [
      entry.title,
      entry.author,
      entry.city,
      entry.printer,
      entry.year,
      entry.keywords,
      entry.baseName,
    ]) {
      const token = (raw ?? "").trim().toLowerCase();
      if (!token || token.length < 3 || seen.has(token)) continue;
      seen.add(token);
      parts.push(token);
    }
  }

  return parts.join(" ").slice(0, MAX_VOCAB_CHARS);
}

/**
 * Merge built-in library catalog terms into intent prototypes so routing and
 * passage search recognize witness titles, authors, printers, and shelfmarks.
 */
export function enrichIntentPrototypesFromCatalog(
  catalog: LibraryCatalog | null | undefined,
  base: Record<string, string> = { ...MANUSCRIPT_INTENT_PROTOTYPES },
): Record<string, string> {
  const vocab = libraryCatalogVocabulary(catalog);
  if (!vocab) return base;

  return {
    ...base,
    search_text: `${base.search_text ?? ""} ${vocab}`.trim().slice(0, MAX_VOCAB_CHARS + 400),
    find_gloss: `${base.find_gloss ?? ""} gloss glosa glosa marginal ${vocab}`.trim().slice(0, 2000),
    find_rubric: `${base.find_rubric ?? ""} rubric rúbrica titulo ${vocab}`.trim().slice(0, 2000),
  };
}

/** Find the catalog row that matches the open witness (by id / baseName / file). */
export function matchLibraryEntry(
  catalog: LibraryCatalog | null | undefined,
  sourceFileName: string | null | undefined,
  title?: string | null,
): LibraryCatalogEntry | null {
  if (!catalog?.entries?.length) return null;
  const file = (sourceFileName ?? "").toLowerCase();
  const base = file.replace(/\.(txt|hsms|json)$/i, "");
  const titleNeedle = (title ?? "").trim().toLowerCase();

  if (file) {
    const byFile = catalog.entries.find(
      (e) =>
        e.sourceFileName.toLowerCase() === file ||
        e.baseName.toLowerCase() === base ||
        e.id.toLowerCase() === base,
    );
    if (byFile) return byFile;
  }

  if (titleNeedle.length >= 4) {
    const byTitle = catalog.entries.find((e) => e.title.toLowerCase() === titleNeedle);
    if (byTitle) return byTitle;
  }

  return null;
}

/**
 * Recipe router whose `search.passages` triggers include distinctive library
 * catalog terms (titles, authors, printers) so Ask understands corpus vocabulary.
 */
export function buildLibraryAwareRouterIndex(
  catalog: LibraryCatalog | null | undefined,
  /** Router locales (UI ∪ en ∪ witness language); defaults to all Tier 1 copilot locales. */
  locales?: CopilotLocale[],
): RouterIndex {
  const vocab = libraryCatalogVocabulary(catalog);
  if (!vocab) return buildRouterIndex(undefined, locales);

  const extra = vocab
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 48);

  const recipes = RECIPES.map((recipe) => {
    if (recipe.id !== "search.passages" && recipe.id !== "lex.code_switching") {
      return recipe;
    }
    const en = [...(recipe.triggers.en ?? [])];
    for (const term of extra) {
      en.push(`find ${term}`, `search ${term}`);
    }
    return { ...recipe, triggers: { ...recipe.triggers, en } };
  });

  return buildRouterIndex(recipes, locales);
}
