/**
 * Intent threshold calibration (dental-RCM calibrated_thresholds adapted).
 * High-impact / low-support taxonomy intents stay unpromoted → clarification chips.
 */
import thresholds from "../../assets/calibrated-thresholds.json";
import { taxonomyIntentIdForRecipe } from "./lifecycle";

export interface IntentCalibration {
  current: number;
  calibrated: number | null;
  promoted: boolean;
  reason: string;
  support: number;
}

export interface ThresholdCatalog {
  backend: string;
  corpus_hash: string;
  gates_green: boolean;
  defaults: {
    min_support: number;
    min_precision: number;
    fallback_threshold: number;
  };
  intents: Record<string, IntentCalibration>;
}

const CATALOG = thresholds as ThresholdCatalog;

export function thresholdCatalog(): ThresholdCatalog {
  return CATALOG;
}

export function calibrationForTaxonomyId(taxonomyId: string): IntentCalibration | undefined {
  return CATALOG.intents[taxonomyId];
}

export function calibrationForRecipe(recipeId: string): IntentCalibration | undefined {
  const taxId = taxonomyIntentIdForRecipe(recipeId);
  return taxId ? CATALOG.intents[taxId] : undefined;
}

/** Effective score cutoff for auto-dispatch (calibrated when present). */
export function effectiveThreshold(taxonomyId: string): number {
  const row = CATALOG.intents[taxonomyId];
  if (row?.calibrated != null) return row.calibrated;
  if (row?.current != null) return row.current;
  return CATALOG.defaults.fallback_threshold;
}

export type DispatchDecision =
  | { allow: true; taxonomyId?: string; threshold: number }
  | {
      allow: false;
      taxonomyId?: string;
      threshold: number;
      reason: "unpromoted" | "below_threshold" | "gates_red_high_impact";
      detail: string;
    };

/**
 * Gate auto-dispatch of doActions / tool calls.
 * Unpromoted or below-threshold intents fall back to clarification chips.
 */
export function decideAutoDispatch(
  recipeId: string,
  score: number,
  options?: { requirePromoted?: boolean },
): DispatchDecision {
  const taxonomyId = taxonomyIntentIdForRecipe(recipeId);
  const threshold = taxonomyId
    ? effectiveThreshold(taxonomyId)
    : CATALOG.defaults.fallback_threshold;
  const row = taxonomyId ? CATALOG.intents[taxonomyId] : undefined;
  const requirePromoted = options?.requirePromoted ?? true;

  if (row && requirePromoted && !row.promoted) {
    return {
      allow: false,
      taxonomyId,
      threshold,
      reason: "unpromoted",
      detail: row.reason,
    };
  }
  if (score < threshold) {
    return {
      allow: false,
      taxonomyId,
      threshold,
      reason: "below_threshold",
      detail: `score ${score.toFixed(3)} < ${threshold.toFixed(3)}`,
    };
  }
  return { allow: true, taxonomyId, threshold };
}
