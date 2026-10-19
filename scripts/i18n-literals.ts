/**
 * Hard-coded UI string scanner (SPEC-I18N §6 `no-literal-string`).
 *
 * Scans React Native TSX/TS files under app/ and components/ for unlocalized text.
 * Filters out HSMS paleographic markup, MUFI entities, TypeScript generic signatures,
 * and code syntax.
 *
 * Usage:
 *   npx tsx scripts/i18n-literals.ts
 *   npx tsx scripts/i18n-literals.ts --json
 *   npx tsx scripts/i18n-literals.ts --fail-on-literals
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";

/** Always compare exemption paths with forward slashes (POSIX), even on Windows. */
function toPosixRel(from: string, to: string): string {
  return posix.normalize(relative(from, to).split(/[/\\]/).join("/"));
}

const root = resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"];

/** Exempt files (dev screens, SVG generators, static test mocks). */
const EXEMPT = new Set<string>([
  "app/+not-found.tsx",
  "components/svgFacsimile/renderOrnateInitial.tsx",
  "components/svgFacsimile/HtmlOrnateDropCap.tsx",
]);

/** Attribute names that must be localized when containing literal strings. */
const TARGET_ATTRIBUTES = [
  "accessibilityLabel",
  "accessibilityHint",
  "placeholder",
  "title",
  "label",
  "headerTitle",
];

/** Skip pathological captures that are not UI copy. */
const MAX_LITERAL_CHARS = 160;

/** Exported for unit tests (paleographic / HSMS allowlist). */
export function isAllowed(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  if (s.length > MAX_LITERAL_CHARS) return true;

  // Ignore numbers, single letters, symbols, CSS dimensions
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(s)) return true;

  // HSMS mnemonics & foliation tags (including partial `[fol.` built in JSX)
  if (/^(\{[A-Z0-9_]{2,8}\d*[.:]?[^}]*\}?|\[fol\.[^\]]*\]?|%\d?|\.[a-z]{2,5})$/.test(s)) return true;
  if (/^(TEI|HSMS|OSTA|KWIC|SVG|IIIF|PDF|CSV|TSV|URL|DSL|HTML|JSON|MUFI|PUA)$/.test(s)) return true;
  if (/^(px|em|rem|vh|vw|ms|s|KB|MB|GB|DPI)$/i.test(s)) return true;
  if (/^\d+(\.\d+)?\s?(px|em|rem|vh|vw|ms|s|%)$/i.test(s)) return true;

  // Editorial / paleographic brackets and MUFI entities
  if (/^(\[\*?[^\]]{0,40}\]|\(\^?[^\)]{0,40}\))$/.test(s)) return true;
  if (/^&[a-z][a-z0-9]{1,24};$/i.test(s)) return true;

  // TypeScript / React Native code keywords
  if (
    /^(Promise|Record|Array|Partial|Readonly|string|number|boolean|void|unknown|any|null|undefined)$/.test(
      s,
    )
  ) {
    return true;
  }
  if (/^(flex|center|absolute|relative|row|column|bold|normal|solid|dashed|none|transparent)$/.test(s)) {
    return true;
  }

  // Example file paths, URLs & mappings
  if (/^[\w.-]+\.(html|txt|json|hsms|svg|png|jpg|jpeg|tsv|xml|otf|ttf|woff2)$/i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;

  // Ibero-Romance / paleographic expansion patterns (p<er>, q<ue>, n~, c')
  if (/^<[a-z]{1,5}>$|^<<[a-z]{1,5}>>$/i.test(s)) return true;
  if (/^[a-z]'[a-z]?$|^[a-z]~$|^c'$|^n~$|^[pq]<[a-z]{2,5}>$/i.test(s)) return true;
  if (/^[a-zà-ÿ]{1,12}<[a-z]{1,5}>$/i.test(s)) return true;

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
const CODE_LIKE_RE =
  /=>|&&|\|\||;|\/\/|\/\*|\*\/|\n\s*\*|\breturn\b|\bconst\b|^[)\]}]|\?\s|^\w+=|=\s*$|\w\(|,\s*$|\$\{|\w\.\w+\)/;

function scanFile(path: string): LiteralFinding[] {
  const rel = toPosixRel(root, path);
  if (EXEMPT.has(rel)) return [];

  const src = readFileSync(path, "utf8");
  const findings: LiteralFinding[] = [];
  const lineOf = (index: number) => src.slice(0, index).split("\n").length;

  // Exclude StyleSheet.create and non-UI logic blocks
  const cut = src.indexOf("StyleSheet.create(");
  const body = cut >= 0 ? src.slice(0, cut) : src;

  // 1. Scan JSX text children
  for (const re of [JSX_TEXT_RE, JSX_MIXED_BEFORE_RE, JSX_MIXED_AFTER_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const raw = m[1];
      if (raw.length > MAX_LITERAL_CHARS) continue;
      const text = raw.trim();
      if (CODE_LIKE_RE.test(text)) continue;
      if (!isAllowed(text)) {
        findings.push({ file: rel, line: lineOf(m.index), text });
      }
    }
  }

  // 2. Scan target JSX props
  const propPattern = new RegExp(
    `\\b(${TARGET_ATTRIBUTES.join("|")})\\s*=\\s*"([^"]{2,})"`,
    "g",
  );
  let propMatch: RegExpExecArray | null;
  while ((propMatch = propPattern.exec(body)) !== null) {
    const text = propMatch[2].trim();
    if (!isAllowed(text)) {
      findings.push({ file: rel, line: lineOf(propMatch.index), text });
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
  const isJson = process.argv.includes("--json");
  const failOnError = process.argv.includes("--fail-on-literals");

  const findings = scanLiterals();

  if (isJson) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}  ${JSON.stringify(f.text)}`);
    }
    const byFile = new Map<string, number>();
    for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
    console.log(`\n${findings.length} hard-coded string(s) in ${byFile.size} file(s).`);
    for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}\t${file}`);
    }
  }

  if (failOnError && findings.length > 0) {
    process.exit(1);
  }
}
