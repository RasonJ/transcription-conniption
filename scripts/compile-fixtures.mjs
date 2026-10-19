#!/usr/bin/env node
/**
 * compile-fixtures.mjs — idempotent:
 * 1) validate sample fixtures exist
 * 2) stamp GENERATED comment in utils/scriptoriumFixtures.ts (when present)
 * 3) write assets/scriptorium-offline.json with fixtures ≥ static bundle count
 *
 * Static bundle SSOT is assets/scriptorium-static-bundle.json.
 *
 *   node scripts/compile-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeAtomicSync, writeJsonAtomicSync } from "./lib/fsutil.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "services", "sample", "fixtures");
const staticBundleTs = path.join(root, "utils", "scriptoriumFixtures.ts");
const staticBundleJsonPath = path.join(root, "assets", "scriptorium-static-bundle.json");
const offlinePath = path.join(root, "assets", "scriptorium-offline.json");

const required = ["editorial-queue.json", "audit.json", "worklist.json", "manifest.json"];
for (const f of required) {
  const p = path.join(fixturesDir, f);
  if (!fs.existsSync(p)) {
    console.error("Missing", p, "— run npm run sample:fixtures first");
    process.exit(1);
  }
}
if (!fs.existsSync(staticBundleJsonPath)) {
  console.error("Missing", staticBundleJsonPath);
  process.exit(1);
}

const stampIso = new Date().toISOString();
const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, "manifest.json"), "utf8"));
const staticBundle = JSON.parse(fs.readFileSync(staticBundleJsonPath, "utf8"));
const staticCount = Object.keys(staticBundle.fixtures ?? {}).length;

if (fs.existsSync(staticBundleTs)) {
  const stampLine = ` * GENERATED: ${stampIso} — run \`npm run compile-fixtures\` (idempotent stamp)`;
  let nextTs = fs.readFileSync(staticBundleTs, "utf8");
  const prevTs = nextTs;
  if (/ \* GENERATED: /.test(nextTs)) {
    nextTs = nextTs.replace(/ \* GENERATED: [^\n]*/, stampLine);
  } else if (nextTs.startsWith("/**")) {
    nextTs = nextTs.replace(/^\/\*\*\n/, `/**\n${stampLine}\n`);
  }
  if (nextTs !== prevTs) {
    writeAtomicSync(staticBundleTs, nextTs);
    console.log("stamped", path.relative(root, staticBundleTs));
  }
}

let art = {
  ...staticBundle,
  version: staticBundle.version ?? "1.0.0-hsms",
  domain: "hsms_scriptorium",
  built_at: stampIso,
  compiled: {
    compiledAt: stampIso,
    sampleManifest: manifest,
    staticBundle: "assets/scriptorium-static-bundle.json",
    fixtureCount: staticCount,
  },
  note: "Compiled from assets/scriptorium-static-bundle.json — preferred when fixture count ≥ static bundle",
};

if (fs.existsSync(offlinePath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(offlinePath, "utf8"));
    const existingCount = Object.keys(existing.fixtures ?? {}).length;
    if (existingCount >= staticCount) {
      art = {
        ...existing,
        built_at: stampIso,
        compiled: {
          compiledAt: stampIso,
          sampleManifest: manifest,
          staticBundle: "assets/scriptorium-static-bundle.json",
          fixtureCount: existingCount,
          preferred: "offline",
        },
      };
      console.log(`[compile-fixtures] keeping offline fixtures (${existingCount} ≥ static ${staticCount})`);
    } else {
      console.log(`[compile-fixtures] offline ${existingCount} < static ${staticCount} — rebasing from static`);
    }
  } catch {
    console.warn("[compile-fixtures] corrupt offline — writing from static");
  }
}

writeJsonAtomicSync(offlinePath, art);
console.log(
  `[compile-fixtures] fixtures=${Object.keys(art.fixtures ?? {}).length} → ${path.relative(root, offlinePath)}`,
);
