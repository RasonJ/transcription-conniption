import type { ParsedManuscript } from "../../constants/manuscript";
import type { Capability } from "../ingest/types";
import type { ManuscriptVectorIndex } from "../manuscriptVectorIndex";
import type { FacetIndex } from "./facetIndex";
import type { HsmsFacsSidecar } from "../ingest/types";
import type { WitnessLanguage } from "../witnessLanguage";

export type EvidenceTier = "A" | "B" | "C" | "D";

export type RecipeCategory = "paleography" | "linguistics" | "corpus" | "navigation" | "ingest";

export type CopilotLocale = "en" | "es" | "pt" | "ca" | "gl" | "eu";

export type SlotSpec =
  | { name: "lemma" | "word"; type: "string"; required: boolean }
  | { name: "graphSet"; type: "enum"; values: string[] }
  | { name: "range"; type: "folioRange" }
  | { name: "window"; type: "int"; default: 5; min: 1; max: 10 }
  | { name: "lang"; type: "hsmsLang" }
  | { name: "hand"; type: "int"; default?: number; min?: number; max?: number }
  | { name: "n"; type: "int"; default: number; min: 2; max: 5 }
  | { name: "scope"; type: "enum"; values: ["witness", "registry"] }
  | { name: "top"; type: "int"; default: number; min: number; max: number }
  | { name: "query"; type: "string"; required: boolean };

/** Values a recipe receives after slot extraction (SPEC-COPILOT §8.3). */
export interface RecipeParams {
  query?: string;
  word?: string;
  lemma?: string;
  window?: number;
  n?: number;
  top?: number;
  hand?: number;
  lang?: string;
  graphSet?: string;
  range?: { from: string; to: string };
  scope?: "witness" | "registry";
  [key: string]: unknown;
}

export type PresentView = "count" | "table" | "kwic" | "distribution" | "chart";

/** Tappable evidence: resolves to a folio (and line) on the parchment. */
export interface EvidenceRow {
  folioId: string;
  lineNumber?: string;
  label: string;
  detail?: string;
}

export interface BreakdownEntry {
  /** English label (fallback, CSV header). */
  label: string;
  value: number;
  /** Stable id; the UI shows `copilot.label.<key>` when the catalog has it. */
  key?: string;
  /** Interpolation values for the localized label (e.g. `{ hand: 2 }`). */
  labelParams?: Record<string, string | number>;
}

export interface RecipeResult {
  /** English headline; the UI prefers `copilot.recipe.<id>.answer` with `params`. */
  headline: string;
  /** Values for the localized answer template (counts, names). */
  params?: Record<string, string | number>;
  /** Overrides the answer template key (e.g. empty-result variants). */
  messageKey?: string;
  /** Tier D portion that needs server processing (shown as a note). */
  needsServer?: string;
  /** Primary number, shown on Overview chips. */
  count: number;
  breakdown?: BreakdownEntry[];
  rows: EvidenceRow[];
  /** Set by navigation recipes. */
  navigate?: { folioId: string; lineNumber?: string };
}

/** A batch-compiled witness available for corpus-scope recipes (SPEC-COPILOT §9.3). */
export interface RegistryWitness {
  name: string;
  parsed: ParsedManuscript;
  /** Year of the witness (from `{RMK:}` imprint or the library catalog), when known. */
  year?: number;
  /** Genre label (library catalog or `{RMK: genre …}`), when known. */
  genre?: string;
}

export interface RecipeContext {
  parsed: ParsedManuscript;
  facets: FacetIndex;
  vectorIndex?: ManuscriptVectorIndex;
  /** Base language of the witness (stopwords, contraction lists). Detected when absent. */
  witnessLanguage?: WitnessLanguage;
  /** User collation formula, e.g. "1-8^8 9^10" — overrides catchword-inferred quires. */
  collation?: string;
  /** Batch-compiled witnesses for `scope = registry`. */
  registry?: RegistryWitness[];
  /** Ingest sidecar (machine-transcribed witnesses): confidence and review state. */
  sidecar?: HsmsFacsSidecar;
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
  run(ctx: RecipeContext, params: P): RecipeResult;
  present: {
    view: PresentView;
    chipLabel: string;
  };
  /** Human-readable method line. */
  method: string;
  /** Equivalent DSL expression, when one exists. */
  dsl?: string;
  /**
   * Tier B only: precision measured on the hand-labeled reference sample
   * (`scripts/tierb-precision.ts`); undefined until a sample has been labeled.
   */
  precision?: number;
}

export interface CopilotAnswer {
  recipeId: string;
  recipeVersion: number;
  tier: EvidenceTier;
  headline: string;
  params?: Record<string, string | number>;
  messageKey?: string;
  needsServer?: string;
  /**
   * Optional long-form body (e.g. raw HSMS from vision OCR).
   * Rendered as a monospace block in the assistant drawer.
   */
  body?: string;
  breakdown?: BreakdownEntry[];
  /** Primary numeric answer (word counts, hit totals). */
  count?: number;
  rows: EvidenceRow[];
  method: string;
  /** Parameters actually used (slots), for the method line and exports. */
  usedParams?: Record<string, string | number>;
  dsl?: string;
  elapsedMs: number;
  /** Set when the answer is a folio jump. */
  navigate?: { folioId: string; lineNumber?: string };
  /** Recipes to offer when routing was not confident. */
  alternatives?: Array<{ recipeId: string; score: number; chipLabel: string }>;
  confidence?: number;
  /** Required slot the question did not provide (the UI asks for it). */
  slotPrompt?: string;
  /** The fallback answered because no recipe matched confidently. */
  lowConfidence?: boolean;
  /**
   * Executable follow-ups bound to the taxonomy intent (dental-RCM doActions adapted).
   * UI chips invoke these without another LLM turn.
   */
  doActions?: string[];
  /** Taxonomy id `domain:entity:action` when one maps to this recipe. */
  taxonomyId?: string;
  /** Jargon / multilingual aliases applied before routing. */
  jargonApplied?: Array<{ from: string; to: string }>;
  /**
   * Calibrated threshold gate refused auto-dispatch of doActions
   * (unpromoted intent or score below calibrated cutoff).
   */
  dispatchBlocked?: {
    reason: string;
    detail: string;
    threshold: number;
  };
  /** Tier-1 precompiled graph chain (zero GDB multi-hop at runtime). */
  precompiledChain?: {
    intentId: string;
    patternId?: string;
    steps: Array<{ step: number; action: string; detail: string; ok: boolean }>;
    mcp_tool?: string;
  };
}
