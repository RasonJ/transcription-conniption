#!/usr/bin/env npx tsx
/**
 * Full preflight before shipping a web dist:
 *   HSMS generated assets → i18n → Copilot catalog → agent memory →
 *   library / corpus sidecars (when out/ exists) → tier + size gates →
 *   lint + unit tests → optional Expo web export.
 *
 * Usage:
 *   npm run preflight              # assets + checks (no web export)
 *   npm run build:all              # preflight then build:web
 *   npx tsx scripts/preflight.ts --web
 *   npx tsx scripts/preflight.ts --skip-tests --skip-lint
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasCliFlag } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outDir = path.join(projectRoot, "out");
const hsmsToolsSettings = path.join(projectRoot, "assets", "legacy_hsms_settings.ini");
const mufiCharsJson = path.join(projectRoot, "assets", "mufi", "mufi-chars.json");

type Step = {
  name: string;
  /** npm script name under package.json "scripts" */
  script: string;
  /** Soft-skip when predicate is false (still counts as OK). */
  when?: () => boolean;
  skipReason?: string;
};

const includeWeb = hasCliFlag("--web");
const skipTests = hasCliFlag("--skip-tests");
const skipLint = hasCliFlag("--skip-lint");
const skipLibrary = hasCliFlag("--skip-library");

const steps: Step[] = [
  {
    name: "HSMS diacritic map (legacy settings.ini)",
    script: "generate:diacritics",
    when: () => existsSync(hsmsToolsSettings),
    skipReason:
      "assets/legacy_hsms_settings.ini missing — keep existing utils/generated/hsmsDiacriticMap.ts",
  },
  {
    name: "MUFI 3-way char map + ornate inventory",
    script: "generate:mufi",
    when: () => existsSync(mufiCharsJson),
    skipReason:
      "assets/mufi/mufi-chars.json missing — run npm run fetch:mufi (keep existing generated maps)",
  },
  { name: "HSMS lemma + POS dictionary indexes", script: "generate:dictionary" },
  { name: "i18n TypeScript catalogs", script: "i18n:types" },
  { name: "i18n locale parity check", script: "i18n:check" },
  { name: "Copilot / MCP intent catalog", script: "compile:copilot" },
  { name: "Agent memory rule export", script: "export:agent-memory" },
  {
    name: "Library catalog + corpus embeddings / facets",
    script: "build:library",
    when: () => !skipLibrary && existsSync(outDir),
    skipReason: skipLibrary
      ? "--skip-library"
      : "out/ missing (run npm run batch:osta first for corpus sidecars)",
  },
  {
    name: "Sync library sidecars → public/ + assets/",
    script: "sync:library",
    when: () => !skipLibrary && existsSync(path.join(outDir, "library-catalog.json")),
    skipReason: skipLibrary
      ? "--skip-library"
      : "out/library-catalog.json missing",
  },
  { name: "Tier boundary (LW-1) gate", script: "check:tiers" },
];

if (!skipLint) {
  steps.push({ name: "ESLint", script: "lint" });
}
if (!skipTests) {
  steps.push({ name: "Unit tests", script: "test" });
}
if (includeWeb) {
  // Size gate needs dist/ from the export — run export first, then check.
  steps.push({ name: "Expo web export (dist)", script: "build:web" });
  steps.push({ name: "Bundle size budget gate", script: "size:check" });
} else {
  steps.push({
    name: "Bundle size budget gate",
    script: "size:check",
    when: () => existsSync(path.join(projectRoot, "dist")),
    skipReason: "dist/ missing — included automatically in npm run build:all",
  });
}

function runNpmScript(script: string): number {
  // Hardcoded step names only — reject anything unexpected before shell fallback.
  if (!/^[a-zA-Z0-9:_-]+$/.test(script)) {
    console.error(`Refusing unsafe npm script name: ${script}`);
    return 1;
  }

  // Prefer npm_execpath (set when launched via npm/npx) so we never need
  // shell:true + args — that combo triggers Node DEP0190 on Windows.
  const npmExecPath = process.env.npm_execpath;
  const nodeExecPath = process.env.npm_node_execpath || process.execPath;
  const result = npmExecPath
    ? spawnSync(nodeExecPath, [npmExecPath, "run", script], {
        cwd: projectRoot,
        stdio: "inherit",
        env: process.env,
      })
    : spawnSync(process.platform === "win32" ? `npm.cmd run ${script}` : `npm run ${script}`, {
        cwd: projectRoot,
        stdio: "inherit",
        env: process.env,
        shell: true,
      });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status ?? 1;
}

function main(): void {
  console.log("");
  console.log("══════════════════════════════════════════════════════════");
  console.log(" Transcription Conniption — full preflight");
  console.log(
    includeWeb
      ? " Mode: assets + checks + web dist (build:all)"
      : " Mode: assets + checks only (preflight)",
  );
  console.log("══════════════════════════════════════════════════════════");
  console.log("");

  const started = Date.now();
  let failed: string | null = null;
  let skipped = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = `[${i + 1}/${steps.length}] ${step.name}`;
    if (step.when && !step.when()) {
      console.log(`↷  ${label}`);
      console.log(`   skipped — ${step.skipReason ?? "condition not met"}`);
      console.log("");
      skipped++;
      continue;
    }

    console.log(`→  ${label}`);
    console.log(`   npm run ${step.script}`);
    const code = runNpmScript(step.script);
    if (code !== 0) {
      failed = step.name;
      console.error(`✗  failed: ${step.name} (exit ${code})`);
      break;
    }
    console.log(`✓  ${step.name}`);
    console.log("");
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log("──────────────────────────────────────────────────────────");
  if (failed) {
    console.error(`Preflight aborted after ${elapsedSec}s — failed at: ${failed}`);
    process.exit(1);
  }
  console.log(
    `Preflight OK in ${elapsedSec}s (${steps.length - skipped} ran, ${skipped} skipped).`,
  );
  if (!includeWeb) {
    console.log("Next: npm run build:web   or   npm run build:all");
  } else {
    console.log("Web dist export completed (see Expo export output above).");
  }
  console.log("");
}

main();
