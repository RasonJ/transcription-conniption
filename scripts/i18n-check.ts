/**
 * Catalog CI for SPEC-I18N §9. Fails on:
 *  - Tier 1 base catalogs (es, pt, ca, gl, eu) missing keys from en
 *  - unknown keys in any catalog (typos, removed keys)
 *  - placeholder mismatches against en (every catalog, including regional overrides)
 *  - ICU syntax errors (unbalanced braces) in any message
 *  - hard-coded UI strings in app/ and components/ (scripts/i18n-literals.ts)
 *  - en keys never referenced in code (dynamic prefixes allowed)
 * Reports (warning; failure with --release):
 *  - Tier 1 strings identical to English (allow-listed exceptions)
 *  - machine-drafted strings still pending review (i18n/review-status.json)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanLiterals } from "./i18n-literals";
import { collectMessageKeys } from "./i18n-types";

const root = resolve(__dirname, "..");
const localesDir = join(root, "i18n", "locales");
const TIER1_BASES = ["es", "pt", "ca", "gl", "eu"] as const;
const TIER1_RELEASE = ["es", "es-ES", "es-419", "es-MX", "es-AR", "pt", "pt-PT", "pt-BR", "ca", "ca-ES-valencia", "gl", "eu"];
/** Keys looked up dynamically (`validation.${code}`, `hsms.lang.${code}`, `copilot.recipe.…`). */
const DYNAMIC_PREFIXES = ["common.", "validation.", "hsms.lang.", "hsms.term.", "copilot.recipe.", "copilot.tier.", "copilot.category.", "copilot.slot.", "copilot.label.", "copilot.msg."];
/** Values legitimately identical to English. */
const SAME_AS_EN_OK = /^(OK|TEI|HSMS|IIIF|CSV|DSL|L\{line\}|\[fol\. \{folio\}\]|.*\{term:\w+\}.*|Biblioteca|Normal|Total|Error|Demo.*|Simple|Global|Local|.*\.hsms|Exportar TEI)$/;

function load(name: string): Record<string, unknown> {
  const raw = readFileSync(join(localesDir, `${name}.json`), "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Collect ICU / MessageFormat argument names.
 * Walks `{name}` and `{name, plural|select, …}` forms; ignores `#` and bare
 * branch-body braces so regional catalogs (es-MX, pt-BR) validate cleanly.
 */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  let i = 0;
  while (i < message.length) {
    if (message[i] !== "{") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < message.length && /\s/.test(message[j])) j++;
    // Bare `#` inside plural branches is not an argument.
    if (message[j] === "#") {
      i = j + 1;
      continue;
    }
    const start = j;
    if (!/[A-Za-z_]/.test(message[j] ?? "")) {
      i++;
      continue;
    }
    j++;
    while (j < message.length && /[\w:]/.test(message[j])) j++;
    const name = message.slice(start, j);
    while (j < message.length && /\s/.test(message[j])) j++;
    const next = message[j];
    // `{name}` or `{name, plural|select|number, …}`
    if (next === "}" || next === ",") names.add(name);
    i = j;
  }
  return [...names].sort();
}

function bracesBalanced(message: string): boolean {
  let depth = 0;
  for (const ch of message) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function walk(dir: string, acc: string[]): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx?|js)$/.test(name)) acc.push(full);
  }
  return acc;
}

export function runI18nCheck(release: boolean): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const en = load("en");
  const enKeys = collectMessageKeys(en);
  const locales = readdirSync(localesDir)
    .filter((f) => f.endsWith(".json") && f !== "en.json")
    .map((f) => f.replace(/\.json$/, ""));

  for (const key of enKeys) {
    if (!bracesBalanced(String(en[key]))) failures.push(`[en] unbalanced braces: ${key}`);
  }

  for (const locale of locales) {
    const catalog = load(locale);
    const keys = Object.keys(catalog).filter((k) => !k.startsWith("_"));
    for (const key of keys) {
      if (!(key in en)) failures.push(`[${locale}] unknown key: ${key}`);
      const value = catalog[key];
      if (typeof value !== "string") {
        failures.push(`[${locale}] non-string value: ${key}`);
        continue;
      }
      if (!bracesBalanced(value)) failures.push(`[${locale}] unbalanced braces: ${key}`);
      if (key in en && placeholders(String(en[key])).join(",") !== placeholders(value).join(",")) {
        failures.push(`[${locale}] placeholder mismatch: ${key}`);
      }
    }
    if ((TIER1_BASES as readonly string[]).includes(locale)) {
      for (const key of enKeys) {
        if (typeof catalog[key] !== "string") failures.push(`[${locale}] missing key: ${key}`);
        else if (catalog[key] === en[key] && !SAME_AS_EN_OK.test(String(en[key]))) {
          (release ? failures : warnings).push(`[${locale}] identical to English: ${key}`);
        }
      }
    }
  }

  const reviewPath = join(root, "i18n", "review-status.json");
  if (existsSync(reviewPath)) {
    const pending = (JSON.parse(readFileSync(reviewPath, "utf8")) as { pending: Record<string, string[]> }).pending;
    for (const [locale, keys] of Object.entries(pending)) {
      if (!keys.length) continue;
      const msg = `[${locale}] ${keys.length} machine-drafted string(s) awaiting review`;
      if (release && TIER1_RELEASE.includes(locale)) failures.push(msg);
      else warnings.push(msg);
    }
  }

  for (const f of scanLiterals()) failures.push(`hard-coded UI string ${f.file}:${f.line} ${JSON.stringify(f.text)}`);

  const code = ["app", "components", "context", "utils", "hooks", "i18n"]
    .flatMap((d) => walk(join(root, d), []))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  for (const key of enKeys) {
    if (DYNAMIC_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (!code.includes(`"${key}"`) && !code.includes(`'${key}'`) && !code.includes(`\`${key}\``)) {
      failures.push(`[en] unused key: ${key}`);
    }
  }

  return { failures, warnings };
}

if (require.main === module) {
  const release = process.argv.includes("--release");
  const { failures, warnings } = runI18nCheck(release);
  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const f of failures) console.error(`FAIL  ${f}`);
  if (failures.length) {
    console.error(`\ni18n check failed: ${failures.length} problem(s).`);
    process.exit(1);
  }
  const en = collectMessageKeys(load("en"));
  console.log(`i18n check passed: ${en.length} keys; Tier 1 bases ${TIER1_BASES.join(", ")} complete.`);
}
