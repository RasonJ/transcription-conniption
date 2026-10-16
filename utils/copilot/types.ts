import type { ParsedManuscript } from "../../constants/manuscript";
import type { Capability } from "../ingest/types";
import type { ManuscriptVectorIndex } from "../manuscriptVectorIndex";
import type { FacetIndex } from "./facetIndex";

export type EvidenceTier = "A" | "B" | "C" | "D";

export type RecipeCategory = "paleography" | "linguistics" | "corpus" | "navigation" | "ingest";

export type CopilotLocale = "en" | "es" | "pt" | "ca" | "gl" | "eu";

export type SlotSpec =
  | { name: "lemma" | "word"; type: "string"; required: boolean }
  | { name: "graphSet"; type: "enum"; values: string[] }
  | { name: "range"; type: "folioRange" }
  | { name: "window"; type: "int"; default: 5; min: 1; max: 10 }
  | { name: "lang"; type: "hsmsLang" }
  | { name: "hand"; type: "int" }
  | { name: "n"; type: "int"; default: 3; min: 2; max: 5 }
  | { name: "scope"; type: "enum"; values: ["witness", "registry"] };

export type PresentView = "count" | "table" | "kwic" | "distribution" | "chart";

/** Tappable evidence: resolves to a folio (and line) on the parchment. */
export interface EvidenceRow {
  folioId: string;
  lineNumber?: string;
  label: string;
  detail?: string;
}

export interface BreakdownEntry {
  label: string;
  value: number;
}

export interface RecipeResult {
  headline: string;
  /** Primary number, shown on Overview chips. */
  count: number;
  breakdown?: BreakdownEntry[];
  rows: EvidenceRow[];
  /** Set by navigation recipes. */
  navigate?: { folioId: string; lineNumber?: string };
}

export interface RecipeContext {
  parsed: ParsedManuscript;
  facets: FacetIndex;
  vectorIndex?: ManuscriptVectorIndex;
}

export interface Recipe<P = Record<string, unknown>> {
  id: string;
  /** Bump when output semantics change. */
  version: number;
  category: RecipeCategory;
  tier: EvidenceTier;
  /** Trigger phrases per locale; English is required. */
  triggers: Partial<Record<CopilotLocale, string[]>> & { en: string[] };
  slots: SlotSpec[];
  requires: Capability[];
  /** Eager recipes are zero-param and run at idle. */
  precompute: "eager" | "on_demand";
  run(ctx: RecipeContext, params: P): RecipeResult;  present: {
    view: PresentView;
    chipLabel: string;
  };
  /** Human-readable method line. */
  method: string;
  /** Equivalent DSL expression, when one exists. */
  dsl?: string;
}

export interface CopilotAnswer {
  recipeId: string;
  recipeVersion: number;
  tier: EvidenceTier;
  headline: string;
  breakdown?: BreakdownEntry[];
  rows: EvidenceRow[];
  method: string;
  dsl?: string;
  elapsedMs: number;
  /** Set when the answer is a folio jump. */
  navigate?: { folioId: string; lineNumber?: string };
  /** Recipes to offer when routing was not confident. */
  alternatives?: Array<{ recipeId: string; score: number; chipLabel: string }>;
  confidence?: number;
}
