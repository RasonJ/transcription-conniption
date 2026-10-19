/**
 * Worker for eval-bilingual-desk.mjs — loads TypeScript copilot modules via tsx.
 * Prints one JSON line to stdout.
 */
import fs from "node:fs";
import { canonicalizeJargon } from "../utils/copilot/jargonLexicon";
import { taxonomyIntentIdForRecipe } from "../utils/copilot/lifecycle";
import { buildRouterIndex, routeQuery } from "../utils/copilot/router";
import { parseHsMsText } from "../utils/manuscriptParser";

const INTENT_MAP: Record<string, string[]> = {
  preflight_check: ["validate:lint:run_preflight", "validate:barrier:inspect", "search.passages"],
  term_frequency: ["analyze:stats:term_frequency", "analyze:stats:word_count", "stats.term_frequency"],
  kwic_search: ["analyze:concordance:kwic", "analyze:concordance:open", "search.kwic"],
  catchwords: ["codex:catchwords:list", "codex.catchwords"],
  folio_nav: ["edit:folio:navigate", "nav.folio"],
  orthography_toggle: ["edit:display:toggle_orthography", "ui.control"],
  shelfmark: ["meta:witness:shelfmark", "meta.witness"],
  illuminated_initials: ["paleography:illum:initials", "illum.initial_hierarchy"],
  scribal_deletions: ["paleography:corr:scribal_vs_editorial", "corr.deletions_scribal_vs_editorial"],
  nasal_tilde: ["paleography:abbr:nasal_tilde", "abbr.nasal_tilde_vs_geminate"],
};

const ID_TO_INTENT = new Map<string, string>();
for (const [intent, ids] of Object.entries(INTENT_MAP)) {
  for (const id of ids) ID_TO_INTENT.set(id, intent);
}
const toEvalIntent = (id: string | null) => (id ? ID_TO_INTENT.get(id) ?? `other:${id}` : "none");

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error("usage: tsx eval-bilingual-desk-runner.ts <fixture.jsonl>");
  process.exit(2);
}

const rows = fs
  .readFileSync(fixturePath, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { id: string; lang: string; text: string; expected_intent: string });

const LANGS = ["en", "es", "pt", "mixed"] as const;
type Lang = (typeof LANGS)[number];
const blank = () => ({ n: 0, jargonHit: 0, local: 0 });
const stats = Object.fromEntries(LANGS.map((l) => [l, blank()])) as Record<Lang, ReturnType<typeof blank>>;
const misses: Array<Record<string, unknown>> = [];

const router = buildRouterIndex(undefined, ["en", "es", "pt", "ca", "gl", "eu"]);
const parsed = parseHsMsText("[fol. 1r]\n{CB1.\n1 texto muy sabio\n}\n[fol. 1v]\n{CB1.\n1 otro\n}");

for (const r of rows) {
  const lang: Lang = LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : "mixed";
  const s = stats[lang];
  s.n += 1;
  const jargon = canonicalizeJargon(r.text);
  if (jargon.replacements.length > 0 || jargon.canonical !== r.text) s.jargonHit += 1;
  const q = jargon.canonical;
  const route = routeQuery(q, parsed, router);
  let gotId: string | null = null;
  if (route.kind === "folio") gotId = "nav.folio";
  else if (route.kind === "recipe" && route.top) {
    gotId = route.top.recipeId;
    const tax = taxonomyIntentIdForRecipe(gotId);
    if (tax && ID_TO_INTENT.has(tax)) gotId = tax;
  }
  const localIntent = toEvalIntent(gotId);
  if (localIntent === r.expected_intent) s.local += 1;
  else if (misses.length < 60) {
    misses.push({
      id: r.id,
      lang,
      text: r.text,
      canonical: q,
      expected: r.expected_intent,
      got: localIntent,
      recipe: gotId,
    });
  }
}

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
const summary = Object.fromEntries(
  LANGS.map((l) => {
    const s = stats[l];
    return [l, { n: s.n, jargonHitPct: pct(s.jargonHit, s.n), intentLocalPct: pct(s.local, s.n) }];
  }),
);

process.stdout.write(`${JSON.stringify({ summary, misses, stats })}\n`);
