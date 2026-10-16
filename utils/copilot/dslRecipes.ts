/**
 * Recipe expressions (SPEC-COPILOT §10): every answer can be written as a short expression
 * that runs the same recipe with the same parameters, for copy/paste and citation.
 *
 *   recipe <id> [key=value …]                  generic form, any recipe
 *   stats ttr | stats zipf | stats lemmas [top=N]
 *   ngrams [n=3] [top=50]
 *   colloc word="rey" [window=5]               (lemma= also accepted)
 *   kwic "rey"
 *   count graphs set=<palatal_nasal|sibilants|sibilant_graphs|palatal_lateral> [group by quire]
 *
 * `count tokens where …` stays in dsl.ts. Keywords are English; values are free text.
 */
import type { RecipeParams } from "./types";

export interface RecipeExpression {
  recipeId: string;
  params: RecipeParams;
}

const GRAPH_SET_RECIPE: Record<string, string> = {
  palatal_nasal: "phon.palatal_nasal",
  sibilants: "phon.sibilants",
  sibilant_graphs: "chars.sibilant_graphs",
  palatal_lateral: "phon.palatal_lateral",
};

const KV_RE = /([a-z_]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s]+)/gi;

function parseKv(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  KV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KV_RE.exec(rest)) !== null) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[2];
  return out;
}

function toParams(kv: Record<string, string>): RecipeParams {
  const p: RecipeParams = {};
  for (const [k, v] of Object.entries(kv)) {
    if (["window", "n", "top", "hand"].includes(k) && /^\d+$/.test(v)) p[k] = Number(v);
    else if (k === "range") {
      const [from, to] = v.split(/[-–]/);
      if (from && to) p.range = { from, to };
    } else if (k === "scope") p.scope = v === "registry" ? "registry" : "witness";
    else p[k] = v;
  }
  return p;
}

/** Parse a recipe expression; null when the input is not one. */
export function parseRecipeExpression(input: string, knownIds?: ReadonlySet<string>): RecipeExpression | null {
  const src = input.trim();
  let m = src.match(/^recipe\s+([a-z]+(?:\.[a-z0-9_]+)+)\s*(.*)$/i);
  if (m) {
    if (knownIds && !knownIds.has(m[1])) return null;
    return { recipeId: m[1], params: toParams(parseKv(m[2])) };
  }
  m = src.match(/^stats\s+(ttr|zipf|lemmas)\b\s*(.*)$/i);
  if (m) {
    const id = { ttr: "stats.ttr_hapax", zipf: "stats.zipf", lemmas: "stats.top_lemmas" }[m[1].toLowerCase() as "ttr" | "zipf" | "lemmas"];
    return { recipeId: id, params: toParams(parseKv(m[2])) };
  }
  m = src.match(/^ngrams\b\s*(.*)$/i);
  if (m) return { recipeId: "ngrams.top", params: toParams(parseKv(m[1])) };
  m = src.match(/^colloc\b\s*(.*)$/i);
  if (m) {
    const params = toParams(parseKv(m[1]));
    if (params.lemma && !params.word) params.word = params.lemma as string;
    return { recipeId: "colloc.window", params };
  }
  m = src.match(/^kwic\s+["']?([^"']+?)["']?\s*$/i);
  if (m) return { recipeId: "search.kwic", params: { word: m[1] } };
  m = src.match(/^count\s+graphs\s+(.*)$/i);
  if (m) {
    const kv = parseKv(m[1]);
    const set = kv.set;
    if (!set || !GRAPH_SET_RECIPE[set]) return null;
    const byQuire = /group\s+by\s+quire/i.test(m[1]);
    return {
      recipeId: set === "palatal_nasal" && byQuire ? "abbr.nasal_tilde_vs_geminate" : GRAPH_SET_RECIPE[set],
      params: {},
    };
  }
  return null;
}

function formatValue(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "from" in v && "to" in v) {
    const r = v as { from: string; to: string };
    return `${r.from}-${r.to}`;
  }
  const s = String(v);
  return /^[\p{L}\p{N}_.]+$/u.test(s) ? s : `"${s.replace(/"/g, "'")}"`;
}

/** Canonical generic expression for a recipe run (shown on every answer card). */
export function formatRecipeExpression(recipeId: string, params: RecipeParams = {}): string {
  const parts = Object.entries(params)
    .filter(([k, v]) => k !== "query" && v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${formatValue(v)}`);
  return ["recipe", recipeId, ...parts].join(" ");
}
