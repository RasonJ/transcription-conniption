/**
 * Stage-aware lifecycle for the HSMS scriptorium (dental-RCM cascade adapted).
 * Filters intents / doActions by the active workstation stage.
 */
import taxonomy from "../../assets/intent-taxonomy.json";

export type ScriptoriumStage =
  | "INGEST"
  | "VALIDATE"
  | "EDIT"
  | "ANALYZE"
  | "EXPORT"
  | "LIBRARY";

export type DoAction =
  | "JUMP_FOLIO"
  | "OPEN_KWIC"
  | "OPEN_CONCORDANCE"
  | "OPEN_VALIDATION"
  | "OPEN_INGEST_PANEL"
  | "OPEN_LIBRARY"
  | "RUN_LINT"
  | "PASS_TWO_REPAIR"
  | "TOGGLE_ORTHOGRAPHY"
  | "TOGGLE_LINE_NUMBERS"
  | "HIGHLIGHT_TOKENS"
  | "ZOOM_INITIAL"
  | "EXPORT_TEI"
  | "EXPORT_HTML"
  | "EXPORT_SVG"
  | "EXPORT_CSV"
  | "MARK_REVIEWED"
  /** Precompiled graph-chain UI jumps */
  | "OPEN_DISCOURSE_VIEW"
  | "HIGHLIGHT_REFUTATION_NODE"
  | "OPEN_LEARNING_PATH"
  | "HIGHLIGHT_CONCEPT";

export interface PrecompiledChainStepSpec {
  step: number;
  action: string;
  node_type?: string;
  relation?: string;
  target_type?: string;
  direction?: "OUTGOING" | "INCOMING";
  slot?: string;
  mcp_tool?: string;
  doAction?: string;
  ui_target?: string;
  bound_node_id?: string;
}

export interface TaxonomyIntent {
  recipeId: string;
  stage: ScriptoriumStage;
  doActions?: DoAction[];
  slots?: string[];
  mcp_tool?: string;
  examples?: string[];
  /** Eager = offline-precompiled Tier-1 chain. */
  precompute?: "eager" | "on_demand";
  /** Flat zero-latency execution steps (graph multi-hop collapsed). */
  precompiled_chain?: PrecompiledChainStepSpec[];
}

export interface TaxonomyBarrier {
  stage: ScriptoriumStage;
  severity: string;
  blocks: string[];
}

type TaxonomyFile = {
  version: number;
  lifecycle: ScriptoriumStage[];
  intents: Record<string, TaxonomyIntent>;
  barriers: Record<string, TaxonomyBarrier>;
};

const TAX = taxonomy as TaxonomyFile;

/** First taxonomy id wins when several intents share a recipe (primary before extras). */
const RECIPE_TO_TAXONOMY = new Map<string, string>();
for (const [id, intent] of Object.entries(TAX.intents)) {
  if (!RECIPE_TO_TAXONOMY.has(intent.recipeId)) {
    RECIPE_TO_TAXONOMY.set(intent.recipeId, id);
  }
}

export function lifecycleOrder(): readonly ScriptoriumStage[] {
  return TAX.lifecycle;
}

export function taxonomyIntentIdForRecipe(recipeId: string): string | undefined {
  return RECIPE_TO_TAXONOMY.get(recipeId);
}

export function taxonomyIntent(id: string): TaxonomyIntent | undefined {
  return TAX.intents[id];
}

export function doActionsForRecipe(recipeId: string): DoAction[] {
  const taxId = RECIPE_TO_TAXONOMY.get(recipeId);
  if (!taxId) return [];
  return (TAX.intents[taxId]?.doActions ?? []) as DoAction[];
}

/** Intents allowed on (or before) the active stage in the lifecycle order. */
export function intentsForStage(stage: ScriptoriumStage): string[] {
  const order = TAX.lifecycle;
  const idx = order.indexOf(stage);
  if (idx < 0) return Object.keys(TAX.intents);
  const allowed = new Set(order.slice(0, idx + 1));
  return Object.entries(TAX.intents)
    .filter(([, intent]) => allowed.has(intent.stage))
    .map(([id]) => id);
}

export function barriersForStage(stage: ScriptoriumStage): Array<{ id: string } & TaxonomyBarrier> {
  return Object.entries(TAX.barriers)
    .filter(([, b]) => b.stage === stage)
    .map(([id, b]) => ({ id, ...b }));
}

/** Whether a doAction is blocked by any active barrier ids. */
export function isActionBlocked(action: DoAction, activeBarrierIds: readonly string[]): boolean {
  for (const id of activeBarrierIds) {
    const b = TAX.barriers[id];
    if (b?.blocks.includes(action)) return true;
  }
  return false;
}
