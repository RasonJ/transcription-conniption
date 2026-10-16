/**
 * Localized presentation of copilot answers (SPEC-COPILOT §11, SPEC-I18N §5).
 *
 * Executors return English headlines plus structured `params`; the UI renders
 * `copilot.recipe.<id>.<messageKey|answer>` with those params in the active locale and
 * falls back to the English headline only when no template exists. Breakdown rows use
 * `copilot.label.<key>` (or a recipe-specific `copilot.recipe.<id>.label.<key>`).
 */
import type { CopilotAnswer, BreakdownEntry, Recipe } from "./types";

export type Translate = (key: string, params?: Record<string, string | number>) => string;
export type HasMessage = (key: string) => boolean;
export type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

export interface PresentedAnswer {
  headline: string;
  chip?: string;
  method: string;
  serverNote?: string;
  breakdown: Array<{ label: string; value: number }>;
  /** Accessible summary: headline plus tier name. */
  accessibilityLabel: string;
}

const DECIMAL_RE = /^-?\d+\.\d+$/;

/**
 * Executors pass ratios as fixed-precision strings ("0.142"); render them with the locale's
 * decimal separator while keeping the precision. Integers stay numbers (plural selection).
 */
export function localizeParams(
  params: Record<string, unknown> | undefined,
  formatNumber: FormatNumber,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === "number") out[k] = v;
    else if (typeof v === "string" && DECIMAL_RE.test(v)) {
      const digits = v.split(".")[1].length;
      out[k] = formatNumber(Number(v), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } else if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

function lookup(t: Translate, has: HasMessage, keys: string[], params: Record<string, string | number>): string | null {
  for (const key of keys) if (has(key)) return t(key, params);
  return null;
}

export function presentHeadline(answer: CopilotAnswer, t: Translate, has: HasMessage, formatNumber: FormatNumber): string {
  const params = localizeParams(answer.params, formatNumber);
  const id = answer.recipeId;
  const mk = answer.messageKey;
  const keys: string[] = [];
  if (mk) keys.push(`copilot.recipe.${id}.${mk}`, `copilot.msg.${mk}`);
  // Templates that need params only apply when the executor supplied them.
  if (!mk && answer.params) keys.push(`copilot.recipe.${id}.answer`);
  let headline = lookup(t, has, keys, params) ?? answer.headline;
  if (answer.params?.lowExpected && has(`copilot.recipe.${id}.lowExpected`)) {
    headline = `${headline} ${t(`copilot.recipe.${id}.lowExpected`)}`;
  }
  if (answer.lowConfidence && has("copilot.lowConfidence")) {
    headline = t("copilot.lowConfidence", { headline });
  }
  return headline;
}

export function presentBreakdownLabel(
  recipeId: string,
  entry: BreakdownEntry,
  t: Translate,
  has: HasMessage,
  formatNumber: FormatNumber,
): string {
  if (!entry.key) return entry.label;
  const params = localizeParams(entry.labelParams, formatNumber);
  // Nested labels (accent mark names) resolve through their own key.
  if (typeof params.mark === "string" && has(`copilot.label.${params.mark}`)) {
    params.mark = t(`copilot.label.${params.mark}`);
  }
  return (
    lookup(t, has, [`copilot.recipe.${recipeId}.label.${entry.key}`, `copilot.label.${entry.key}`], params) ?? entry.label
  );
}

export function presentChip(recipe: Pick<Recipe, "id" | "present">, t: Translate, has: HasMessage): string {
  const key = `copilot.recipe.${recipe.id}.chip`;
  return has(key) ? t(key) : recipe.present.chipLabel;
}

export function presentAnswer(
  answer: CopilotAnswer,
  t: Translate,
  has: HasMessage,
  formatNumber: FormatNumber,
): PresentedAnswer {
  const id = answer.recipeId;
  const headline = presentHeadline(answer, t, has, formatNumber);
  const methodKey = `copilot.recipe.${id}.method`;
  const method = has(methodKey) ? t(methodKey) : answer.method;
  let serverNote: string | undefined;
  if (answer.needsServer) {
    const detailKey = `copilot.recipe.${id}.server`;
    const detail = has(detailKey) ? t(detailKey) : answer.needsServer;
    serverNote = has("copilot.needsServer") ? t("copilot.needsServer", { detail }) : detail;
  }
  const chipKey = `copilot.recipe.${id}.chip`;
  const tierKey = `copilot.tier.${answer.tier}`;
  return {
    headline,
    chip: has(chipKey) ? t(chipKey) : undefined,
    method,
    serverNote,
    breakdown: (answer.breakdown ?? []).map((b) => ({
      label: presentBreakdownLabel(id, b, t, has, formatNumber),
      value: b.value,
    })),
    accessibilityLabel: has(tierKey) ? `${headline} (${t(tierKey)})` : headline,
  };
}

function csvCell(value: string | number, sep: string): string {
  const s = String(value);
  return s.includes(sep) || s.includes("\"") || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV/TSV export of an answer (SPEC-COPILOT §11): evidence rows, then breakdown, then the
 * method line and recipe expression, so a pasted table is self-describing. Deterministic.
 */
export function answerToDelimited(
  answer: CopilotAnswer,
  presented: Pick<PresentedAnswer, "headline" | "method" | "breakdown">,
  header: string,
  sep: "," | "\t" = ",",
): string {
  const lines: string[] = [];
  lines.push(header.split(",").map((h) => csvCell(h, sep)).join(sep));
  for (const row of answer.rows) {
    lines.push([row.folioId, row.lineNumber ?? "", row.label, row.detail ?? ""].map((c) => csvCell(c, sep)).join(sep));
  }
  if (presented.breakdown.length) {
    lines.push("");
    for (const b of presented.breakdown) lines.push([csvCell(b.label, sep), b.value].join(sep));
  }
  lines.push("");
  lines.push(csvCell(`# ${presented.headline}`, sep));
  lines.push(csvCell(`# ${presented.method}`, sep));
  lines.push(csvCell(`# ${answer.dsl ?? `recipe ${answer.recipeId}`} (v${answer.recipeVersion}, tier ${answer.tier})`, sep));
  return lines.join("\n") + "\n";
}
