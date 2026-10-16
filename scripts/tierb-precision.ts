/**
 * Tier B precision (SPEC-COPILOT §12).
 *
 *   npx tsx scripts/tierb-precision.ts sample   # write labeling sheets
 *   npx tsx scripts/tierb-precision.ts score    # read labeled sheets → utils/copilot/tierBPrecision.json
 *
 * `sample` runs every Tier B recipe on each golden witness and writes up to 100 evidence rows
 * (evenly spaced, deterministic) to reports/tierb-precision/<recipe>__<witness>.tsv with an
 * empty `correct` column. A reviewer marks each row y / n. `score` computes precision per
 * recipe over all labeled rows (unlabeled rows are ignored) and records it; the catalog
 * attaches it to the recipe and the answer card shows "~N% precision on reference set".
 */
import fs from "node:fs";
import path from "node:path";
import { RECIPES } from "../utils/copilot/catalog";
import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { parseHsMsText } from "../utils/manuscriptParser";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "reports", "tierb-precision");
const PRECISION_FILE = path.join(ROOT, "utils", "copilot", "tierBPrecision.json");
const WITNESSES = ["TEXT.CDP", "TEXT.GRM", "TEXT.PER"];
const SAMPLE = 100;
/** Fewer labeled rows than this and the number is not recorded. */
const MIN_LABELED = 20;

function tsvCell(v: unknown): string {
  return String(v ?? "").replace(/[\t\n\r]+/g, " ");
}

export function evenSample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor((i * items.length) / n)]);
  return out;
}

async function sample(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tierB = RECIPES.filter((r) => r.tier === "B");
  for (const name of WITNESSES) {
    const file = path.join(ROOT, "public", "library", "entries", `${name}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`skip ${name}: ${file} not found`);
      continue;
    }
    const parsed = parseHsMsText(JSON.parse(fs.readFileSync(file, "utf8")).transcriptionText);
    const facets = buildFacetIndex(parsed);
    for (const recipe of tierB) {
      const result = await recipe.run({ parsed, facets }, {});
      const rows = evenSample(result.rows, SAMPLE);
      if (!rows.length) continue;
      const lines = ["folio\tline\tlabel\tdetail\tcorrect"];
      for (const r of rows) lines.push([r.folioId, r.lineNumber ?? "", r.label, r.detail ?? "", ""].map(tsvCell).join("\t"));
      const out = path.join(OUT_DIR, `${recipe.id}__${name}.tsv`);
      if (fs.existsSync(out)) {
        console.log(`keep ${path.relative(ROOT, out)} (already exists; delete it to resample)`);
        continue;
      }
      fs.writeFileSync(out, lines.join("\n") + "\n");
      console.log(`wrote ${path.relative(ROOT, out)} (${rows.length} rows)`);
    }
  }
}

export function scoreSheets(sheets: Array<{ recipeId: string; text: string }>): Record<string, { precision: number; labeled: number }> {
  const tally = new Map<string, { yes: number; total: number }>();
  for (const { recipeId, text } of sheets) {
    const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
    const col = header.split("\t").indexOf("correct");
    if (col < 0) continue;
    const t = tally.get(recipeId) ?? { yes: 0, total: 0 };
    for (const row of rows) {
      const mark = (row.split("\t")[col] ?? "").trim().toLowerCase();
      if (!mark) continue;
      t.total++;
      if (mark === "y" || mark === "yes" || mark === "1" || mark === "s" || mark === "si") t.yes++;
    }
    tally.set(recipeId, t);
  }
  const out: Record<string, { precision: number; labeled: number }> = {};
  for (const [id, t] of [...tally.entries()].sort()) {
    if (t.total >= MIN_LABELED) out[id] = { precision: Number((t.yes / t.total).toFixed(3)), labeled: t.total };
  }
  return out;
}

function score(): void {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`No sheets in ${OUT_DIR}; run "sample" first.`);
    process.exit(1);
  }
  const sheets = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".tsv"))
    .map((f) => ({ recipeId: f.split("__")[0], text: fs.readFileSync(path.join(OUT_DIR, f), "utf8") }));
  const result = scoreSheets(sheets);
  fs.writeFileSync(PRECISION_FILE, JSON.stringify(result, null, 2) + "\n");
  for (const [id, r] of Object.entries(result)) console.log(`${id}: ${(r.precision * 100).toFixed(1)}% (${r.labeled} labeled)`);
  if (!Object.keys(result).length) console.log(`No recipe has ≥ ${MIN_LABELED} labeled rows yet.`);
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === "sample") void sample();
  else if (mode === "score") score();
  else {
    console.error("usage: tierb-precision.ts sample | score");
    process.exit(1);
  }
}
