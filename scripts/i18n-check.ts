import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectMessageKeys } from "./i18n-types";

const root = resolve(__dirname, "..");
const localesDir = join(root, "i18n", "locales");
const TIER1_BASES = ["es", "pt"] as const;

function load(name: string): Record<string, unknown> {
  const raw = readFileSync(join(localesDir, `${name}.json`), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as Record<string, unknown>;
}

function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z_][\w:]*)/g)) names.add(match[1]);
  return [...names].sort();
}

const en = load("en");
const enKeys = collectMessageKeys(en);
let failures = 0;

for (const base of TIER1_BASES) {
  const catalog = load(base);
  const missing = enKeys.filter((key) => typeof catalog[key] !== "string");
  const extra = Object.keys(catalog).filter((key) => !(key in en));
  const mismatched = enKeys.filter((key) => {
    const target = catalog[key];
    return (
      typeof target === "string" &&
      placeholders(String(en[key])).join(",") !== placeholders(target).join(",")
    );
  });

  if (missing.length) {
    failures += missing.length;
    console.error(`[${base}] missing ${missing.length} key(s):\n  ${missing.join("\n  ")}`);
  }
  if (extra.length) {
    failures += extra.length;
    console.error(`[${base}] unknown key(s):\n  ${extra.join("\n  ")}`);
  }
  if (mismatched.length) {
    failures += mismatched.length;
    console.error(`[${base}] placeholder mismatch:\n  ${mismatched.join("\n  ")}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
console.log(`i18n check passed: ${enKeys.length} keys present in ${TIER1_BASES.join(", ")}.`);
