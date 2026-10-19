#!/usr/bin/env node
/**
 * Locale catalog key parity (Tier-1 vs en) — warn mode by default.
 * Exit 1 only when CATALOG_PARITY_STRICT=1.
 *
 * Usage: node scripts/check-catalog-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.join(ROOT, "..", "i18n", "locales");
const STRICT = process.env.CATALOG_PARITY_STRICT === "1";
const TIER1 = ["es", "pt", "ca", "gl", "eu"];

function leaf(obj, prefix = "") {
  const out = [];
  if (obj == null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push(p);
    else if (v && typeof v === "object") out.push(...leaf(v, p));
  }
  return out;
}

function load(name) {
  const raw = fs.readFileSync(path.join(LOCALES, `${name}.json`), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

const enKeys = leaf(load("en"));
const enSet = new Set(enKeys);
let worstCoverage = 100;
let anyMissing = false;

for (const loc of TIER1) {
  const keys = leaf(load(loc));
  const set = new Set(keys);
  const missing = enKeys.filter((k) => !set.has(k)).sort();
  const extra = keys.filter((k) => !enSet.has(k)).sort();
  const coverage = ((enKeys.length - missing.length) / Math.max(1, enKeys.length)) * 100;
  worstCoverage = Math.min(worstCoverage, coverage);
  if (missing.length) anyMissing = true;

  console.log(
    `[catalog-parity] ${loc}: en=${enKeys.length} ${loc}=${keys.length} coverage=${coverage.toFixed(1)}% missing=${missing.length} extra=${extra.length}`,
  );
  if (missing.length) {
    console.log(`[catalog-parity] missing in ${loc} (first 20):`);
    for (const k of missing.slice(0, 20)) console.log(`  - ${k}`);
    if (missing.length > 20) console.log(`  … +${missing.length - 20} more`);
  }
}

if (STRICT && anyMissing) process.exit(1);
if (!STRICT && worstCoverage < 90) {
  console.warn(
    `[catalog-parity] WARN worst coverage ${worstCoverage.toFixed(1)}% < 90% target. Strict mode off.`,
  );
}
process.exit(0);
