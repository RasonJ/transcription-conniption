/**
 * Precompiled intent chains: offline graph subgraphs → flat Tier-1 execution recipes.
 * Matched deterministically (<1ms) without runtime GDB multi-hop traversal.
 */
import type { ReasoningGraphDoc, ReasoningNodeType, ReasoningRelation } from "../reasoningGraph/types";
import type { DoAction, ScriptoriumStage, TaxonomyIntent } from "./lifecycle";
import { normalizeQuery } from "./router";
import taxonomy from "../../assets/intent-taxonomy.json";
import precompiledBundle from "../../assets/precompiled-intent-chains.json";

export type PrecompiledChainAction =
  | "FETCH_FAQ_ANSWER"
  | "GET_PRIMARY_MANUSCRIPT"
  | "TRAVERSE_REFUTATIONS"
  | "SURFACE_CONTRADICTION_CHIP"
  | "INSPECT_BARRIER"
  | "JUMP_TO_FOLIO"
  | "DISPATCH_MCP_REPAIR"
  | "CLEAR_BARRIER"
  | "GET_CONCEPT_NODE"
  | "TRAVERSE_PREREQUISITES"
  | "FETCH_LAY_EXPLANATION"
  | string;

export interface PrecompiledChainStep {
  step: number;
  action: PrecompiledChainAction;
  node_type?: ReasoningNodeType | string;
  relation?: ReasoningRelation | string;
  target_type?: ReasoningNodeType | string;
  direction?: "OUTGOING" | "INCOMING";
  slot?: string;
  mcp_tool?: string;
  doAction?: DoAction | string;
  ui_target?: string;
  /** Bound node id from offline precompilation (optional). */
  bound_node_id?: string;
}

export interface PrecompiledIntentChain {
  intentId: string;
  recipeId: string;
  stage: ScriptoriumStage;
  precompute: "eager" | "on_demand";
  doActions: DoAction[];
  mcp_tool?: string;
  slots: string[];
  examples: string[];
  precompiled_chain: PrecompiledChainStep[];
  /** Graph pattern fingerprint for audit. */
  pattern_id?: string;
  source_graph_hash?: string;
}

export interface PrecompiledChainHit {
  chain: PrecompiledIntentChain;
  /** Slot fills extracted from `{slot|default}` templates / free text. */
  slots: Record<string, string>;
  matchedExample: string;
  score: number;
}

export interface ChainStepResult {
  step: number;
  action: string;
  ok: boolean;
  detail: string;
  nodeIds?: string[];
}

export interface PrecompiledChainExecution {
  intentId: string;
  recipeId: string;
  headline: string;
  steps: ChainStepResult[];
  doActions: DoAction[];
  navigate?: { folioId: string };
  mcp_tool?: string;
  elapsedMs: number;
}

type TaxonomyFile = {
  intents: Record<string, TaxonomyIntent & { precompute?: string; precompiled_chain?: PrecompiledChainStep[] }>;
};

type BundleFile = {
  version: number;
  generated_at?: string;
  chains: PrecompiledIntentChain[];
};

const TAX = taxonomy as TaxonomyFile;
const BUNDLE = precompiledBundle as BundleFile;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse `{slot|default}` placeholders from an example template. */
export function parseExampleTemplate(example: string): {
  pattern: RegExp;
  slots: string[];
  defaults: Record<string, string>;
} {
  const slots: string[] = [];
  const defaults: Record<string, string> = {};
  let regexSrc = "";
  let i = 0;
  while (i < example.length) {
    if (example[i] === "{") {
      const end = example.indexOf("}", i);
      if (end < 0) {
        regexSrc += escapeRegex(example[i]!);
        i += 1;
        continue;
      }
      const inner = example.slice(i + 1, end);
      const pipe = inner.indexOf("|");
      const name = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
      const def = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
      if (name) {
        slots.push(name);
        if (def) defaults[name] = def;
        regexSrc += "(.+?)";
      }
      i = end + 1;
    } else {
      regexSrc += escapeRegex(example[i]!);
      i += 1;
    }
  }
  return {
    pattern: new RegExp(`^${regexSrc}$`, "i"),
    slots,
    defaults,
  };
}

/** Catalog chains: offline bundle ∪ taxonomy ∪ seeds. */
export function listPrecompiledChains(): PrecompiledIntentChain[] {
  const fromBundle = BUNDLE.chains ?? [];
  const seen = new Set(fromBundle.map((c) => c.intentId));
  const fromTaxonomy: PrecompiledIntentChain[] = [];
  for (const [intentId, intent] of Object.entries(TAX.intents)) {
    if (!intent.precompiled_chain?.length || seen.has(intentId)) continue;
    fromTaxonomy.push({
      intentId,
      recipeId: intent.recipeId,
      stage: intent.stage,
      precompute: (intent.precompute as "eager" | "on_demand") ?? "eager",
      doActions: (intent.doActions ?? []) as DoAction[],
      mcp_tool: intent.mcp_tool,
      slots: intent.slots ?? [],
      examples: intent.examples ?? [],
      precompiled_chain: intent.precompiled_chain,
    });
    seen.add(intentId);
  }
  const fromSeed = SEED_PRECOMPILED_CHAINS.filter((c) => !seen.has(c.intentId));
  return [...fromBundle, ...fromTaxonomy, ...fromSeed];
}

function extractSlotsFromQuery(query: string, example: string): Record<string, string> | null {
  const { pattern, slots, defaults } = parseExampleTemplate(example);
  const plain = normalizeQuery(example.replace(/\{([^}|]+)(?:\|[^}]*)?\}/g, "$1"));
  const nq = normalizeQuery(query);
  if (!slots.length) {
    if (nq === plain || nq.includes(plain) || plain.includes(nq)) {
      return { ...defaults };
    }
    // fuzzy: all significant tokens from example appear in query
    const tokens = plain.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length && tokens.every((t) => nq.includes(t))) return { ...defaults };
    return null;
  }
  const m = query.trim().match(pattern);
  if (m) {
    const out: Record<string, string> = { ...defaults };
    slots.forEach((s, idx) => {
      const v = m[idx + 1]?.trim();
      if (v) out[s] = v;
    });
    return out;
  }
  // Fallback: default fills when trigger keywords match
  const keyword = plain.split(/\s+/).filter((t) => t.length > 3).slice(0, 4);
  if (keyword.length >= 2 && keyword.every((t) => nq.includes(t))) {
    return { ...defaults };
  }
  return null;
}

/** Deterministic match against precompiled examples (Tier 1). */
export function matchPrecompiledIntent(query: string): PrecompiledChainHit | null {
  const q = query.trim();
  if (!q) return null;
  let best: PrecompiledChainHit | null = null;
  for (const chain of listPrecompiledChains()) {
    for (const example of chain.examples) {
      const slots = extractSlotsFromQuery(q, example);
      if (!slots) continue;
      const score = Object.keys(slots).length > 0 ? 0.95 : 0.9;
      if (!best || score > best.score) {
        best = { chain, slots, matchedExample: example, score };
      }
    }
  }
  return best;
}

function neighbors(
  graph: ReasoningGraphDoc,
  nodeId: string,
  relation: string,
  direction: "OUTGOING" | "INCOMING" = "OUTGOING",
): string[] {
  return graph.edges
    .filter((e) => {
      if (e.relation !== relation) return false;
      return direction === "OUTGOING" ? e.source === nodeId : e.target === nodeId;
    })
    .map((e) => (direction === "OUTGOING" ? e.target : e.source));
}

/** Execute a flat chain against an optional live graph (bound ids preferred). */
export function executePrecompiledChain(
  chain: PrecompiledIntentChain,
  slots: Record<string, string> = {},
  graph?: ReasoningGraphDoc,
): PrecompiledChainExecution {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const steps: ChainStepResult[] = [];
  let navigate: { folioId: string } | undefined;

  for (const step of chain.precompiled_chain) {
    const bound = step.bound_node_id;
    switch (step.action) {
      case "FETCH_FAQ_ANSWER":
      case "GET_PRIMARY_MANUSCRIPT":
      case "GET_CONCEPT_NODE":
      case "FETCH_LAY_EXPLANATION":
      case "INSPECT_BARRIER": {
        const ids = bound
          ? [bound]
          : graph
            ? graph.nodes.filter((n) => n.type === step.node_type).map((n) => n.id).slice(0, 3)
            : [];
        steps.push({
          step: step.step,
          action: step.action,
          ok: ids.length > 0 || !graph,
          detail: ids.length ? `resolved ${ids.join(", ")}` : `queued ${step.node_type ?? step.action}`,
          nodeIds: ids.length ? ids : undefined,
        });
        break;
      }
      case "TRAVERSE_REFUTATIONS":
      case "TRAVERSE_PREREQUISITES": {
        const rel = String(step.relation ?? "refuted");
        const dir = step.direction ?? "OUTGOING";
        const seed =
          bound ??
          steps.flatMap((s) => s.nodeIds ?? []).at(-1) ??
          graph?.nodes.find((n) => n.type === "Manuscript")?.id;
        const ids =
          graph && seed ? neighbors(graph, seed, rel, dir) : bound ? [bound] : [];
        steps.push({
          step: step.step,
          action: step.action,
          ok: true,
          detail: ids.length ? `${rel} → ${ids.join(", ")}` : `${rel} (${dir}) ready`,
          nodeIds: ids.length ? ids : undefined,
        });
        break;
      }
      case "JUMP_TO_FOLIO": {
        const folioId = slots[step.slot ?? "folio_id"] ?? slots.folio_id ?? "1r";
        navigate = { folioId };
        steps.push({
          step: step.step,
          action: step.action,
          ok: true,
          detail: `jump ${folioId}`,
        });
        break;
      }
      case "DISPATCH_MCP_REPAIR":
      case "CLEAR_BARRIER":
      case "SURFACE_CONTRADICTION_CHIP":
        steps.push({
          step: step.step,
          action: step.action,
          ok: true,
          detail: step.mcp_tool ?? step.doAction ?? step.ui_target ?? step.action,
        });
        break;
      default:
        steps.push({
          step: step.step,
          action: step.action,
          ok: true,
          detail: "executed",
        });
    }
  }

  const topic = slots.topic ?? slots.concept ?? slots.folio_id ?? chain.intentId;
  const headline = `Precompiled · ${chain.intentId} · ${topic}`;
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    intentId: chain.intentId,
    recipeId: chain.recipeId,
    headline,
    steps,
    doActions: chain.doActions,
    navigate,
    mcp_tool: chain.mcp_tool,
    elapsedMs: t1 - t0,
  };
}

/**
 * Offline: detect high-value subgraphs and emit bound precompiled chains.
 * Patterns: FAQ controversy, barrier repair, concept prerequisites.
 */
export function precompileChainsFromGraph(
  graph: ReasoningGraphDoc,
  opts?: { dagHash?: string },
): PrecompiledIntentChain[] {
  const out: PrecompiledIntentChain[] = [];
  const hash = opts?.dagHash ?? graph.dag_hash;

  // Pattern A: FrequentQuestion → answered_by → AnswerSnippet, + Manuscript refuted
  for (const faq of graph.nodes.filter((n) => n.type === "FrequentQuestion")) {
    const answers = neighbors(graph, faq.id, "answered_by", "OUTGOING");
    const answerNode = answers[0];
    const manuscripts = graph.edges
      .filter(
        (e) =>
          (e.relation === "supported_by_manuscript" || e.relation === "supports") &&
          (e.source === faq.id || e.source === answerNode),
      )
      .map((e) => e.target);
    const primary = manuscripts[0] ?? graph.nodes.find((n) => n.type === "Manuscript")?.id;
    const refutations = primary ? neighbors(graph, primary, "refuted", "OUTGOING") : [];
    if (!answerNode && !refutations.length) continue;
    const qText = String(faq.attributes.canonical_text ?? faq.id);
    out.push({
      intentId: "analyze:controversy:explain",
      recipeId: "discourse.explain_controversy",
      stage: "ANALYZE",
      precompute: "eager",
      doActions: ["OPEN_DISCOURSE_VIEW", "HIGHLIGHT_REFUTATION_NODE"],
      mcp_tool: "query_codicological_graph",
      slots: ["topic"],
      examples: [
        `is there a debate about {topic|${qText.slice(0, 40)}}`,
        "why do studies conflict on {topic|catchwords}",
        "show contesting papers for {topic|scribal hands}",
      ],
      precompiled_chain: [
        {
          step: 1,
          action: "FETCH_FAQ_ANSWER",
          node_type: "AnswerSnippet",
          bound_node_id: answerNode,
        },
        {
          step: 2,
          action: "GET_PRIMARY_MANUSCRIPT",
          node_type: "Manuscript",
          bound_node_id: primary,
        },
        {
          step: 3,
          action: "TRAVERSE_REFUTATIONS",
          relation: "refuted",
          target_type: "Manuscript",
          bound_node_id: refutations[0],
        },
        {
          step: 4,
          action: "SURFACE_CONTRADICTION_CHIP",
          ui_target: "discourse_panel",
        },
      ],
      pattern_id: "faq_answered_by_refuted",
      source_graph_hash: hash,
    });
  }

  // Pattern B: Manuscript → stalled_by_barrier → AdministrativeBarrierNode
  for (const barrier of graph.nodes.filter((n) => n.type === "AdministrativeBarrierNode")) {
    const stalled = graph.edges.filter(
      (e) => e.relation === "stalled_by_barrier" && e.target === barrier.id,
    );
    const msId = stalled[0]?.source;
    const folioHint =
      String(barrier.attributes.folioId ?? barrier.attributes.folio_id ?? "3v");
    out.push({
      intentId: "validate:barrier:repair_flow",
      recipeId: "diag.audit_hsms_syntax",
      stage: "VALIDATE",
      precompute: "eager",
      doActions: ["OPEN_VALIDATION", "RUN_LINT", "PASS_TWO_REPAIR", "JUMP_FOLIO"],
      mcp_tool: "audit_hsms_syntax",
      slots: ["folio_id"],
      examples: [
        `why is folio {folio_id|${folioHint}} blocked from export`,
        `fix validation errors on {folio_id|${folioHint}}`,
        `clear export barriers for {folio_id|${folioHint}}`,
      ],
      precompiled_chain: [
        {
          step: 1,
          action: "INSPECT_BARRIER",
          node_type: "AdministrativeBarrierNode",
          bound_node_id: barrier.id,
        },
        { step: 2, action: "JUMP_TO_FOLIO", slot: "folio_id" },
        {
          step: 3,
          action: "DISPATCH_MCP_REPAIR",
          mcp_tool: "pass_two_repair_folio",
        },
        {
          step: 4,
          action: "CLEAR_BARRIER",
          doAction: "PASS_TWO_REPAIR",
          bound_node_id: msId,
        },
      ],
      pattern_id: "manuscript_stalled_by_barrier",
      source_graph_hash: hash,
    });
  }

  // Pattern C: Concept ← prerequisite_for ← Concept (+ FAQ mapped_to_concept)
  for (const concept of graph.nodes.filter((n) => n.type === "Concept")) {
    const prereqs = neighbors(graph, concept.id, "prerequisite_for", "INCOMING");
    if (!prereqs.length) continue;
    const label = String(concept.attributes.canonical_name ?? concept.id.replace(/^CONCEPT:/, ""));
    const lay = graph.nodes.find((n) => n.type === "LayExplanation")?.id;
    out.push({
      intentId: "learn:prerequisite:pathway",
      recipeId: "learn.prerequisite_pathway",
      stage: "LIBRARY",
      precompute: "eager",
      doActions: ["OPEN_LEARNING_PATH", "HIGHLIGHT_CONCEPT"],
      slots: ["concept"],
      examples: [
        `what should I read before studying {concept|${label}}`,
        `prerequisites for understanding {concept|${label}}`,
        `explain {concept|${label}} in plain terms`,
      ],
      precompiled_chain: [
        {
          step: 1,
          action: "GET_CONCEPT_NODE",
          node_type: "Concept",
          bound_node_id: concept.id,
        },
        {
          step: 2,
          action: "TRAVERSE_PREREQUISITES",
          relation: "prerequisite_for",
          direction: "INCOMING",
          bound_node_id: prereqs[0],
        },
        {
          step: 3,
          action: "FETCH_LAY_EXPLANATION",
          node_type: "LayExplanation",
          bound_node_id: lay,
        },
      ],
      pattern_id: "concept_prerequisite_pathway",
      source_graph_hash: hash,
    });
  }

  return dedupeChains(out);
}

function dedupeChains(chains: PrecompiledIntentChain[]): PrecompiledIntentChain[] {
  const byId = new Map<string, PrecompiledIntentChain>();
  for (const c of chains) {
    const prev = byId.get(c.intentId);
    if (!prev || (c.precompiled_chain[0]?.bound_node_id && !prev.precompiled_chain[0]?.bound_node_id)) {
      byId.set(c.intentId, c);
    }
  }
  return [...byId.values()];
}

/** Static seed chains (always available even before offline compile). */
export const SEED_PRECOMPILED_CHAINS: PrecompiledIntentChain[] = [
  {
    intentId: "analyze:controversy:explain",
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
      "hay un debate sobre {topic|reclamos}",
      "há controvérsia sobre {topic|catchwords}",
    ],
    precompiled_chain: [
      { step: 1, action: "FETCH_FAQ_ANSWER", node_type: "AnswerSnippet" },
      { step: 2, action: "GET_PRIMARY_MANUSCRIPT", node_type: "Manuscript" },
      {
        step: 3,
        action: "TRAVERSE_REFUTATIONS",
        relation: "refuted",
        target_type: "Manuscript",
      },
      {
        step: 4,
        action: "SURFACE_CONTRADICTION_CHIP",
        ui_target: "discourse_panel",
      },
    ],
    pattern_id: "faq_answered_by_refuted",
  },
  {
    intentId: "validate:barrier:repair_flow",
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
      "por qué el folio {folio_id|3v} bloquea la exportación",
      "corrigir erros de validação no folio {folio_id|3v}",
    ],
    precompiled_chain: [
      { step: 1, action: "INSPECT_BARRIER", node_type: "AdministrativeBarrierNode" },
      { step: 2, action: "JUMP_TO_FOLIO", slot: "folio_id" },
      {
        step: 3,
        action: "DISPATCH_MCP_REPAIR",
        mcp_tool: "pass_two_repair_folio",
      },
      { step: 4, action: "CLEAR_BARRIER", doAction: "PASS_TWO_REPAIR" },
    ],
    pattern_id: "manuscript_stalled_by_barrier",
  },
  {
    intentId: "learn:prerequisite:pathway",
    recipeId: "learn.prerequisite_pathway",
    stage: "LIBRARY",
    precompute: "eager",
    doActions: ["OPEN_LEARNING_PATH", "HIGHLIGHT_CONCEPT"],
    slots: ["concept"],
    examples: [
      "what should I read before studying {concept|catchwords}",
      "prerequisites for understanding {concept|paleography}",
      "explain {concept|drop initials} in plain terms",
      "qué debo leer antes de {concept|paleografía}",
      "pré-requisitos para {concept|iniciais ornadas}",
    ],
    precompiled_chain: [
      { step: 1, action: "GET_CONCEPT_NODE", node_type: "Concept" },
      {
        step: 2,
        action: "TRAVERSE_PREREQUISITES",
        relation: "prerequisite_for",
        direction: "INCOMING",
      },
      { step: 3, action: "FETCH_LAY_EXPLANATION", node_type: "LayExplanation" },
    ],
    pattern_id: "concept_prerequisite_pathway",
  },
];
