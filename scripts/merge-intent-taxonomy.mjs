#!/usr/bin/env node
/**
 * Idempotent merge of HSMS scriptorium intents into assets/intent-taxonomy.json.
 * Existing intent fields win; missing keys and example strings are filled in.
 *
 *   node scripts/merge-intent-taxonomy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicSync } from "./lib/fsutil.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "assets", "intent-taxonomy.json");
const cur = JSON.parse(fs.readFileSync(file, "utf8"));

/** Extra / restored intents — dental RCM cascade adapted to HSMS transcription. */
const EXTRA = {
  "validate:barrier:inspect": {
    recipeId: "search.passages",
    stage: "VALIDATE",
    doActions: ["OPEN_VALIDATION", "RUN_LINT"],
    slots: ["query"],
    mcp_tool: "audit_hsms_syntax",
    examples: [
      "why is this witness blocked from export",
      "inspect empty column envelope barriers",
      "show validation blockers before TEI export",
    ],
  },
  "edit:pass_two:repair": {
    recipeId: "ingest.low_confidence",
    stage: "EDIT",
    doActions: ["PASS_TWO_REPAIR", "JUMP_FOLIO"],
    slots: ["folio_id"],
    mcp_tool: "pass_two_repair_folio",
    examples: [
      "run pass two repair on low confidence lines",
      "repair recognition errors on folio 1v",
      "fix machine transcription with pass-two",
    ],
  },
  "analyze:stats:word_count": {
    recipeId: "stats.term_frequency",
    stage: "ANALYZE",
    doActions: ["OPEN_KWIC", "JUMP_FOLIO"],
    slots: ["word"],
    examples: [
      "how many times appears {word|muito}",
      "cuántas veces aparece {word|dios}",
      "contagem de {word|principe}",
    ],
  },
  "analyze:concordance:open": {
    recipeId: "search.kwic",
    stage: "ANALYZE",
    doActions: ["OPEN_CONCORDANCE", "JUMP_FOLIO"],
    slots: ["word", "window"],
    examples: [
      "open concordance for {word|sancto}",
      "donde aparece {word|rey}",
      "kwic window for {word|deus}",
    ],
  },
  "library:corpus:search": {
    recipeId: "meta.witness",
    stage: "LIBRARY",
    doActions: ["OPEN_LIBRARY"],
    slots: ["query"],
    mcp_tool: "library_search_corpus",
    examples: [
      "search the library corpus for this shelfmark",
      "find related witnesses in the catalog",
      "open library graph for this manuscript",
    ],
  },
  "export:csv:download": {
    recipeId: "ui.control",
    stage: "EXPORT",
    doActions: ["EXPORT_CSV"],
    slots: [],
    examples: [
      "export hapax list as csv",
      "download concordance csv",
      "export token frequency table",
    ],
  },
  "analyze:controversy:explain": {
    recipeId: "discourse.explain_controversy",
    stage: "ANALYZE",
    precompute: "eager",
    doActions: ["OPEN_DISCOURSE_VIEW", "HIGHLIGHT_REFUTATION_NODE"],
    mcp_tool: "query_codicological_graph",
    slots: ["topic"],
    examples: [
      "is there a debate about {topic|catchwords}",
      "why do studies conflict on {topic|scribal hands}",
      "show contesting papers for {topic|quire structure}",
    ],
  },
  "validate:barrier:repair_flow": {
    recipeId: "diag.audit_hsms_syntax",
    stage: "VALIDATE",
    precompute: "eager",
    doActions: ["OPEN_VALIDATION", "RUN_LINT", "PASS_TWO_REPAIR", "JUMP_FOLIO"],
    mcp_tool: "audit_hsms_syntax",
    slots: ["folio_id"],
    examples: [
      "why is folio {folio_id|3v} blocked from export",
      "fix validation errors on {folio_id|3v}",
      "clear export barriers for {folio_id|3v}",
    ],
  },
  "learn:prerequisite:pathway": {
    recipeId: "learn.prerequisite_pathway",
    stage: "LIBRARY",
    precompute: "eager",
    doActions: ["OPEN_LEARNING_PATH", "HIGHLIGHT_CONCEPT"],
    slots: ["concept"],
    examples: [
      "what should I read before studying {concept|catchwords}",
      "prerequisites for understanding {concept|paleography}",
      "explain {concept|drop initials} in plain terms",
    ],
  },
};

function unionUnique(a = [], b = []) {
  return [...new Set([...a, ...b])];
}

/**
 * Deep-merge taxonomy intents: prev wins for scalars already set; arrays are unioned
 * without duplicates; missing keys from EXTRA are filled in.
 */
function mergeIntent(prev, next) {
  if (!prev || typeof prev !== "object") return { ...next };
  if (!next || typeof next !== "object") return { ...prev };

  const out = { ...next, ...prev };

  for (const key of ["examples", "doActions", "slots"]) {
    if (Array.isArray(prev[key]) || Array.isArray(next[key])) {
      out[key] = unionUnique(prev[key], next[key]);
    }
  }

  // Prefer an existing precompiled_chain (may carry bound_node_ids from offline compile).
  if (Array.isArray(prev.precompiled_chain) && prev.precompiled_chain.length) {
    out.precompiled_chain = prev.precompiled_chain;
  } else if (Array.isArray(next.precompiled_chain)) {
    out.precompiled_chain = next.precompiled_chain;
  }

  for (const [key, value] of Object.entries(next)) {
    if (key === "examples" || key === "doActions" || key === "slots" || key === "precompiled_chain") {
      continue;
    }
    if (out[key] == null || out[key] === "") {
      out[key] = value;
    }
  }

  out.recipeId = prev.recipeId ?? next.recipeId;
  out.stage = prev.stage ?? next.stage;
  out.mcp_tool = prev.mcp_tool ?? next.mcp_tool;
  out.precompute = prev.precompute ?? next.precompute;

  return out;
}

const intents = { ...(cur.intents ?? {}) };
let added = 0;
let merged = 0;
for (const [id, intent] of Object.entries(EXTRA)) {
  if (intents[id]) {
    intents[id] = mergeIntent(intents[id], intent);
    merged += 1;
  } else {
    intents[id] = intent;
    added += 1;
  }
}

const out = { ...cur, intents, version: Math.max(Number(cur.version) || 1, 1) };
writeJsonAtomicSync(file, out);
console.log(
  `[merge-intent-taxonomy] intents=${Object.keys(intents).length} added=${added} merged=${merged}`,
);
