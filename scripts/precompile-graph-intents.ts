#!/usr/bin/env npx tsx
/**
 * Offline batch: reasoning-graph subgraphs → assets/precompiled-intent-chains.json
 * and merge precompiled_chain fields into assets/intent-taxonomy.json.
 *
 *   npx tsx scripts/precompile-graph-intents.ts
 *   npx tsx scripts/precompile-graph-intents.ts --graph path/to/graph.json
 */
import fs from "node:fs";
import path from "node:path";
import {
  precompileChainsFromGraph,
  SEED_PRECOMPILED_CHAINS,
  type PrecompiledIntentChain,
} from "../utils/copilot/precompiledChains";
import { emptyReasoningGraph } from "../utils/reasoningGraph/builder";
import type { ReasoningGraphDoc } from "../utils/reasoningGraph/types";

const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "assets", "precompiled-intent-chains.json");
const TAX = path.join(root, "assets", "intent-taxonomy.json");

function loadGraph(argPath?: string): ReasoningGraphDoc {
  if (argPath && fs.existsSync(argPath)) {
    return JSON.parse(fs.readFileSync(argPath, "utf8")) as ReasoningGraphDoc;
  }
  // Minimal demo graph covering the three patterns.
  const g = emptyReasoningGraph();
  g.nodes.push(
    {
      id: "FAQ:catchwords",
      type: "FrequentQuestion",
      lod_tier: "MESO_DISCOURSE",
      attributes: { canonical_text: "What are catchwords in a manuscript?", question_id: "what-are-catchwords" },
    },
    {
      id: "ANS:catchwords",
      type: "AnswerSnippet",
      lod_tier: "MESO_DISCOURSE",
      attributes: { answer_text: "Catchwords mark quire boundaries." },
    },
    {
      id: "MANUSCRIPT:demo-a",
      type: "Manuscript",
      lod_tier: "MACRO_REASONING",
      attributes: { title: "Witness A", manuscript_id: "MANUSCRIPT:demo-a" },
    },
    {
      id: "MANUSCRIPT:demo-b",
      type: "Manuscript",
      lod_tier: "MACRO_REASONING",
      attributes: { title: "Witness B (refutation)", manuscript_id: "MANUSCRIPT:demo-b" },
    },
    {
      id: "BARRIER:EMPTY_COLUMN_ENVELOPE",
      type: "AdministrativeBarrierNode",
      lod_tier: "MESO_DISCOURSE",
      attributes: { barrier_type: "EMPTY_COLUMN_ENVELOPE", folioId: "3v", status: "OPEN" },
    },
    {
      id: "CONCEPT:catchwords",
      type: "Concept",
      lod_tier: "MACRO_REASONING",
      attributes: { canonical_name: "catchwords" },
    },
    {
      id: "CONCEPT:paleography",
      type: "Concept",
      lod_tier: "MACRO_REASONING",
      attributes: { canonical_name: "paleography" },
    },
    {
      id: "LAY:catchwords",
      type: "LayExplanation",
      lod_tier: "MESO_DISCOURSE",
      attributes: { analogy_text: "Think of catchwords as page-assembly glue." },
    },
  );
  g.edges.push(
    { source: "FAQ:catchwords", target: "ANS:catchwords", relation: "answered_by" },
    { source: "FAQ:catchwords", target: "MANUSCRIPT:demo-a", relation: "supported_by_manuscript" },
    { source: "MANUSCRIPT:demo-a", target: "MANUSCRIPT:demo-b", relation: "refuted" },
    {
      source: "MANUSCRIPT:demo-a",
      target: "BARRIER:EMPTY_COLUMN_ENVELOPE",
      relation: "stalled_by_barrier",
    },
    {
      source: "CONCEPT:paleography",
      target: "CONCEPT:catchwords",
      relation: "prerequisite_for",
    },
    { source: "FAQ:catchwords", target: "CONCEPT:catchwords", relation: "mapped_to_concept" },
  );
  return g;
}

function mergeTaxonomy(chains: PrecompiledIntentChain[]): void {
  const tax = JSON.parse(fs.readFileSync(TAX, "utf8")) as {
    intents: Record<string, Record<string, unknown>>;
  };
  for (const chain of chains) {
    const prev = tax.intents[chain.intentId] ?? {};
    tax.intents[chain.intentId] = {
      ...prev,
      recipeId: chain.recipeId,
      stage: chain.stage,
      doActions: chain.doActions,
      slots: chain.slots,
      mcp_tool: chain.mcp_tool,
      examples: chain.examples,
      precompute: chain.precompute,
      precompiled_chain: chain.precompiled_chain,
    };
  }
  fs.writeFileSync(TAX, `${JSON.stringify(tax, null, 2)}\n`);
}

function main(): void {
  const graphArg = process.argv.includes("--graph")
    ? process.argv[process.argv.indexOf("--graph") + 1]
    : undefined;
  const graph = loadGraph(graphArg);
  const fromGraph = precompileChainsFromGraph(graph);
  const byId = new Map<string, PrecompiledIntentChain>();
  for (const c of [...SEED_PRECOMPILED_CHAINS, ...fromGraph]) {
    byId.set(c.intentId, c);
  }
  const chains = [...byId.values()];
  const bundle = {
    version: 1,
    domain: "hsms_scriptorium",
    description:
      "Offline-precompiled intent chains derived from reasoning-graph subgraphs. Tier-1 deterministic match (<1ms).",
    generated_at: new Date().toISOString(),
    dag_hash: graph.dag_hash ?? null,
    chains,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(bundle, null, 2)}\n`);
  mergeTaxonomy(chains);
  console.log(
    `[precompile-graph-intents] wrote ${chains.length} chains → ${path.relative(root, OUT)} (+ taxonomy merge)`,
  );
}

main();
