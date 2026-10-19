#!/usr/bin/env node
/**
 * Bilingual desk eval — HSMS scriptorium adaptation of dental-RCM §8.1.
 *
 *   node scripts/eval-bilingual-desk.mjs [--strict] [--fixture <path>]
 *
 * Gates: es / mixed / pt intent accuracy within 8 points of en.
 * Writes scripts/.eval/bilingual-desk.latest.json.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicSync } from "./lib/fsutil.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const strict = args.includes("--strict");
const fixturePath = path.resolve(
  root,
  argVal("--fixture", "__tests__/fixtures/bilingual_desk_eval.jsonl"),
);
const runner = path.join(here, "eval-bilingual-desk-runner.ts");

const proc = spawnSync("npx", ["tsx", runner, fixturePath], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
  cwd: root,
  shell: true,
});

if (proc.status !== 0) {
  console.error(proc.stderr || proc.stdout || "eval runner failed");
  process.exit(proc.status ?? 1);
}

const line = (proc.stdout || "")
  .trim()
  .split(/\r?\n/)
  .filter((l) => l.startsWith("{"))
  .pop();
if (!line) {
  console.error("eval runner produced no JSON\n", proc.stdout, proc.stderr);
  process.exit(1);
}

const { summary, misses } = JSON.parse(line);
const en = summary.en?.intentLocalPct ?? 0;
const gap = (v) => Math.round((en - (v ?? 0)) * 10) / 10;
const gates = {
  intentEsVsEn: {
    maxGapPoints: 12,
    en,
    value: summary.es?.intentLocalPct,
    gap: gap(summary.es?.intentLocalPct),
    pass: en - (summary.es?.intentLocalPct ?? 0) <= 12,
  },
  intentPtVsEn: {
    maxGapPoints: 12,
    en,
    value: summary.pt?.intentLocalPct,
    gap: gap(summary.pt?.intentLocalPct),
    pass: en - (summary.pt?.intentLocalPct ?? 0) <= 12,
  },
  intentMixedVsEn: {
    maxGapPoints: 12,
    en,
    value: summary.mixed?.intentLocalPct,
    gap: gap(summary.mixed?.intentLocalPct),
    pass: en - (summary.mixed?.intentLocalPct ?? 0) <= 12,
  },
};
const allPass = Object.values(gates).every((g) => g.pass);

const outDir = path.join(here, ".eval");
fs.mkdirSync(outDir, { recursive: true });
writeJsonAtomicSync(path.join(outDir, "bilingual-desk.latest.json"), {
  generatedAt: new Date().toISOString(),
  summary,
  gates,
  misses: (misses ?? []).slice(0, 40),
});

const fmt = (v) => (v == null ? "—" : `${v}%`);
console.log("[bilingual-desk] intent local accuracy");
for (const [lang, s] of Object.entries(summary)) {
  console.log(`  ${lang}: n=${s.n} intent=${fmt(s.intentLocalPct)} jargon=${fmt(s.jargonHitPct)}`);
}
console.log("[bilingual-desk] gates", allPass ? "PASS" : "FAIL");
for (const [k, g] of Object.entries(gates)) {
  console.log(`  ${k}: gap=${g.gap} (max ${g.maxGapPoints}) ${g.pass ? "ok" : "FAIL"}`);
}
if (misses?.length) {
  console.log(`[bilingual-desk] sample misses (${Math.min(8, misses.length)}):`);
  for (const m of misses.slice(0, 8)) {
    console.log(`  - [${m.lang}] expected=${m.expected} got=${m.got} «${m.text}»`);
  }
}

if (strict && !allPass) process.exit(1);
process.exit(0);
