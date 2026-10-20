/**
 * SPEC-LIGHTWEIGHT LW-1: Tier 0 (core) modules must not statically reach Tier 1 (scholar)
 * or Tier 2 (backend) modules. Dynamic `import()` is the allowed path into Tier 1.
 *
 * Walks the static import graph from the Tier 0 entry points and reports any Tier 1/2
 * module it reaches, with the import chain. Run: `npx tsx scripts/check-tiers.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const TIER0_ENTRIES = [
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/index.tsx",
  "app/(tabs)/about.tsx",
  "app/(tabs)/library.tsx",
  "app/modal.tsx",
  "context/ScriptoriumContext.tsx",
  "utils/compiler.ts",
  "utils/manuscriptParser.ts",
  "utils/hsmsLinter.ts",
  "i18n/runtime.ts",
];

/** Path prefixes (repo-relative, forward slashes) that belong to Tier 1 or Tier 2. */
export const LAZY_TIER_PREFIXES = [
  "utils/concordance.ts",
  "utils/hsmsDictionary.ts",
  "utils/lemmaDictionaryLoader",
  "utils/generated/hsmsLemmaIndex.json",
  "utils/copilot/",
  "utils/generated/copilotCatalog.ts",
  "utils/manuscriptVectorIndex.ts",
  "utils/manuscriptSearch.ts",
  "utils/ingest/apiClient.ts",
  "utils/teiExport.ts",
  "utils/manuscriptExport.ts",
  "utils/exportFile.ts",
  "utils/htmlExport.ts",
  "utils/svgDocumentExport.ts",
  "utils/modernizedText.ts",
  "components/ConcordanceDrawer.tsx",
  "components/ManuscriptChatbotDrawer.tsx",
  "components/EditorLinterBanner.tsx",
  "components/ModernLineSynopticSplit.tsx",
  "components/SynopticFolioSplit.tsx",
  "components/ingest/",
  "services/batchTranscriptionService.ts",
  "services/passTwoRepairService.ts",
  "services/azureHsmsTranscriber.ts",
  "services/azureAgentOrchestrator.ts",
  "services/azureOpenAI.ts",
  "services/azureA2A.ts",
];

const STATIC_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']/g;
const EXTENSIONS = [".tsx", ".ts", ".web.tsx", ".web.ts", ".js", ".json"];

function resolveSpecifier(root: string, fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // package import
  if (existsSync(base) && /\.[a-z]+$/i.test(base)) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of [".tsx", ".ts"]) {
    const idx = join(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

/** Accidental CJS requires in Tier 0 (dynamic `import()` remains the intentional lazy boundary). */
const REQUIRE_IMPORT_RE =
  /(?:^|\n)\s*(?:const|let|var)\s+[^=]*=\s*require\(["']([^"']+)["']\)/g;

export function staticImports(source: string): string[] {
  const out: string[] = [];
  STATIC_IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STATIC_IMPORT_RE.exec(source)) !== null) out.push(m[1]);
  return out;
}

/** Static ESM imports plus CJS `require()` (does not follow dynamic `import()`). */
export function staticAndRequireImports(source: string): string[] {
  const out = staticImports(source);
  REQUIRE_IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REQUIRE_IMPORT_RE.exec(source)) !== null) out.push(m[1]);
  return out;
}

export interface TierViolation {
  module: string;
  chain: string[];
}

export function findTierViolations(root: string = resolve(__dirname, "..")): TierViolation[] {
  const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
  const isLazy = (p: string) => LAZY_TIER_PREFIXES.some((prefix) => rel(p).startsWith(prefix));
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const entry of TIER0_ENTRIES) {
    const full = join(root, entry);
    if (existsSync(full)) {
      parent.set(full, null);
      queue.push(full);
    }
  }
  const violations: TierViolation[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    if (isLazy(file)) {
      const chain: string[] = [];
      for (let cur: string | null = file; cur; cur = parent.get(cur) ?? null) chain.unshift(rel(cur));
      violations.push({ module: rel(file), chain });
      continue;
    }
    if (file.endsWith(".json")) continue;
    for (const spec of staticAndRequireImports(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(root, file, spec);
      if (target && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return violations;
}

if (require.main === module) {
  const violations = findTierViolations();
  if (violations.length === 0) {
    console.log("Tier boundaries OK: no Tier 1/2 module is statically reachable from Tier 0.");
  } else {
    for (const v of violations) console.error(`✗ ${v.module}\n    via ${v.chain.join(" → ")}`);
    process.exitCode = 1;
  }
}
