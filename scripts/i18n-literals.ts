/**
 * Hard-coded UI string scanner (SPEC-I18N §6 `no-literal-string`).
 *
 * Reports JSX text children and user-facing string props (accessibilityLabel, placeholder,
 * title, label) in app/ and components/ that contain words rather than symbols, HSMS
 * mnemonics or numbers. Used by `npm run i18n:check`; run alone with
 * `npx tsx scripts/i18n-literals.ts` to list findings.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"];

/** Files exempt from the rule (dev-only screens, generated SVG art). */
const EXEMPT = new Set<string>([
  "app/+not-found.tsx",
  "components/svgFacsimile/renderOrnateInitial.tsx",
  "components/svgFacsimile/HtmlOrnateDropCap.tsx",
]);

/** Strings that are not natural language: HSMS markup, symbols, file extensions, codes. */
function isAllowed(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(s)) return true; // symbols, numbers, single letters
  if (/^(\{[A-Z]{2,5}\d?[.:]?\}?|\[fol\.[^\]]*\]|%\d?|\.[a-z]{2,5}|[A-Z]{2,5}|TEI|HSMS|OSTA|KWIC|SVG|IIIF|PDF|CSV|TSV|URL|DSL|HTML|JSON)$/.test(s))
    return true;
  if (/^(\[fol\.|ms|px|KB|MB)$/.test(s)) return true; // HSMS folio notation fragment, units
  if (/^(Promise|Record|Array|Partial|Readonly|string|number|boolean|void)$/.test(s)) return true; // TS generics
  if (/^[\w.-]+\.(html|txt|json|hsms|svg|png|tsv|xml)$/i.test(s)) return true; // example file names
  if (/^https?:\/\//.test(s)) return true; // example URLs
  return false;
}

export interface LiteralFinding {
  file: string;
  line: number;
  text: string;
}

/** Bounded character classes — avoid catastrophic backtracking on large TSX. */
const JSX_TEXT_RE = />([^<>{}\n\r]+)</g;
/** Text adjacent to a JSX expression: `>Success: {n}` and `{n} files<`. */
const JSX_MIXED_BEFORE_RE = />([^<>{}\n\r]*[A-Za-zÀ-ÿ][^<>{}\n\r]*)\{/g;
const JSX_MIXED_AFTER_RE = /\}([^<>{}\n\r]*[A-Za-zÀ-ÿ][^<>{}\n\r]*)<\//g;
const CODE_LIKE_RE = /=>|&&|\|\||;|\/\/|\/\*|\*\/|\n\s*\*|\breturn\b|\bconst\b|^[)\]}]|\?\s|^\w+=|=\s*$|\w\(|,\s*$|\$\{|\w\.\w+\)/;
const PROP_RE = /\b(accessibilityLabel|placeholder|title|label|accessibilityHint)\s*=\s*"([^"]{2,})"/g;

function scanFile(path: string): LiteralFinding[] {
  const rel = relative(root, path).replace(/\\/g, "/");
  if (EXEMPT.has(rel)) return [];
  const src = readFileSync(path, "utf8");
  const findings: LiteralFinding[] = [];
  const lineOf = (index: number) => src.slice(0, index).split("\n").length;
  // Only scan the JSX-ish region: skip StyleSheet.create blocks.
  const cut = src.indexOf("StyleSheet.create(");
  const body = cut >= 0 ? src.slice(0, cut) : src;
  for (const re of [JSX_TEXT_RE, JSX_MIXED_BEFORE_RE, JSX_MIXED_AFTER_RE, PROP_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const text = (re === PROP_RE ? m[2] : m[1]).trim();
      // Skip TypeScript generics / comparisons that look like JSX text.
      if (re !== PROP_RE && CODE_LIKE_RE.test(text)) continue;
      if (!isAllowed(text)) findings.push({ file: rel, line: lineOf(m.index), text });
    }
  }
  return findings;
}

function walk(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

export function scanLiterals(): LiteralFinding[] {
  const files = SCAN_DIRS.flatMap((d) => walk(join(root, d), []));
  return files.flatMap(scanFile);
}

if (require.main === module) {
  const findings = scanLiterals();
  for (const f of findings) console.log(`${f.file}:${f.line}  ${JSON.stringify(f.text)}`);
  const byFile = new Map<string, number>();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  console.log(`\n${findings.length} hard-coded string(s) in ${byFile.size} file(s).`);
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${file}`);
}
