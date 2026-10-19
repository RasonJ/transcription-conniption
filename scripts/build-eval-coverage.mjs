#!/usr/bin/env node
/**
 * Gap analysis: taxonomy intents vs bilingual eval / recipe coverage.
 * Writes reports/eval_coverage.json (dental gym_turns.report adapted).
 *
 *   node scripts/build-eval-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicSync } from "./lib/fsutil.mjs";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, "assets", "intent-taxonomy.json"), "utf8"));
const thresholds = JSON.parse(fs.readFileSync(path.join(root, "assets", "calibrated-thresholds.json"), "utf8"));
const evalPath = path.join(root, "__tests__", "fixtures", "bilingual_desk_eval.jsonl");

const coveredRecipes = new Set();
const coveredIntents = new Set();
if (fs.existsSync(evalPath)) {
  for (const line of fs.readFileSync(evalPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.expected_intent) coveredIntents.add(row.expected_intent);
  }
}

/** Eval label → taxonomy ids (mirrors eval-bilingual-desk-runner). */
const INTENT_MAP = {
  preflight_check: ["validate:lint:run_preflight", "validate:barrier:inspect"],
  term_frequency: ["analyze:stats:term_frequency", "analyze:stats:word_count"],
  kwic_search: ["analyze:concordance:kwic", "analyze:concordance:open"],
  catchwords: ["codex:catchwords:list"],
  folio_nav: ["edit:folio:navigate"],
  orthography_toggle: ["edit:display:toggle_orthography"],
  shelfmark: ["meta:witness:shelfmark"],
  illuminated_initials: ["paleography:illum:initials"],
  scribal_deletions: ["paleography:corr:scribal_vs_editorial"],
  nasal_tilde: ["paleography:abbr:nasal_tilde"],
};

const taxonomyIdsWithEval = new Set();
for (const label of coveredIntents) {
  for (const id of INTENT_MAP[label] ?? []) taxonomyIdsWithEval.add(id);
}

const allTaxonomyIds = Object.keys(taxonomy.intents ?? {});
const curatedWithoutEval = allTaxonomyIds.filter((id) => !taxonomyIdsWithEval.has(id)).sort();

const doActions = new Set();
for (const intent of Object.values(taxonomy.intents ?? {})) {
  for (const a of intent.doActions ?? []) doActions.add(a);
  if (intent.recipeId) coveredRecipes.add(intent.recipeId);
}

const promoted = Object.entries(thresholds.intents ?? {})
  .filter(([, v]) => v.promoted)
  .map(([k]) => k);
const unpromoted = Object.entries(thresholds.intents ?? {})
  .filter(([, v]) => !v.promoted)
  .map(([k]) => k);

const schemaPath = path.join(root, "schemas", "manuscript-reasoning-graph-v1.json");
const schema = fs.existsSync(schemaPath) ? JSON.parse(fs.readFileSync(schemaPath, "utf8")) : null;
const relationEnum = schema?.$defs?.ReasoningRelation?.enum ?? [];

const report = {
  generated_at: new Date().toISOString(),
  domain: "hsms_scriptorium",
  taxonomy_intent_count: allTaxonomyIds.length,
  intents_with_eval_coverage: taxonomyIdsWithEval.size,
  curated_intents_without_gym_turns: curatedWithoutEval,
  crosswalk: {
    by_status: {
      promoted: promoted.length,
      unpromoted: unpromoted.length,
      do_actions: doActions.size,
    },
    promoted,
    unpromoted,
    do_actions: [...doActions].sort(),
    unmapped_high_impact: unpromoted.filter((id) =>
      /export:|pass_two|barrier|library:/.test(id),
    ),
  },
  reasoning_graph: {
    schema: "schemas/manuscript-reasoning-graph-v1.json",
    schema_version: schema?.properties?.schema_version?.const ?? "1.0",
    relation_count: relationEnum.length,
    manuscript_attribute_keys: Object.keys(schema?.$defs?.ManuscriptAttributes?.properties ?? {}),
    author_attribute_keys: Object.keys(schema?.$defs?.AuthorAttributes?.properties ?? {}),
  },
  recipe_ids_bound: [...coveredRecipes].sort(),
};

const blob = JSON.stringify({
  intents: allTaxonomyIds,
  eval: [...coveredIntents].sort(),
  relations: relationEnum,
});
report.corpus_hash = createHash("sha256").update(blob, "utf8").digest("hex").slice(0, 16);

const outDir = path.join(root, "reports");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "eval_coverage.json");
writeJsonAtomicSync(outPath, report);

// Stamp calibrated thresholds corpus_hash when pending
if (thresholds.corpus_hash === "pending" || !thresholds.corpus_hash) {
  thresholds.corpus_hash = report.corpus_hash;
  thresholds.generated_at = report.generated_at;
  thresholds.gates_green = curatedWithoutEval.length < allTaxonomyIds.length * 0.5;
  writeJsonAtomicSync(path.join(root, "assets", "calibrated-thresholds.json"), thresholds);
  console.log(`[eval-coverage] stamped corpus_hash=${report.corpus_hash}`);
}

console.log(
  `[eval-coverage] intents=${report.taxonomy_intent_count} covered=${report.intents_with_eval_coverage} gaps=${curatedWithoutEval.length} → ${path.relative(root, outPath)}`,
);
