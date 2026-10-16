/**
 * Web bundle size report and budget gate (SPEC-LIGHTWEIGHT §6).
 *
 *   npm run build:web && npm run size:report            # writes out/size-report.json
 *   npm run size:report -- --save-baseline              # also writes size-baseline.json
 *   npm run size:report -- --check                      # fails if initial JS > baseline + 5%
 *
 * "Initial JS" is the set of scripts index.html loads eagerly; lazy chunks (drawers, copilot)
 * are reported separately. Set SIZE_BUDGET_APPROVED=1 to accept an intentional increase.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(__dirname, "..");
const distDir = join(root, "dist");
const outFile = join(root, "out", "size-report.json");
const baselineFile = join(root, "size-baseline.json");
const BUDGET_GROWTH = 0.05;

type FileEntry = { path: string; bytes: number; gzipBytes?: number };

function walk(dir: string, acc: FileEntry[]): FileEntry[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else {
      const entry: FileEntry = { path: relative(distDir, full).replace(/\\/g, "/"), bytes: stat.size };
      if (/\.(js|json|css|html|tsv)$/.test(name)) {
        entry.gzipBytes = gzipSync(readFileSync(full), { level: 9 }).length;
      }
      acc.push(entry);
    }
  }
  return acc;
}

/** Scripts referenced by <script src> in index.html (loaded before first paint). */
export function eagerScripts(indexHtml: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]*\ssrc="\/?([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml)) !== null) out.push(m[1]);
  return out;
}

function sum(files: FileEntry[], key: "bytes" | "gzipBytes"): number {
  return files.reduce((n, f) => n + (f[key] ?? 0), 0);
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (!existsSync(distDir)) {
    console.error("dist/ not found; run `npm run build:web` first.");
    process.exitCode = 1;
    return;
  }
  const files = walk(distDir, []).sort((a, b) => b.bytes - a.bytes);
  const indexPath = join(distDir, "index.html");
  const eager = new Set(existsSync(indexPath) ? eagerScripts(readFileSync(indexPath, "utf8")) : []);
  const js = files.filter((f) => f.path.endsWith(".js"));
  const initial = js.filter((f) => eager.has(f.path));
  const lazy = js.filter((f) => !eager.has(f.path));

  const report = {
    generatedAt: new Date().toISOString(),
    initialJs: { bytes: sum(initial, "bytes"), gzipBytes: sum(initial, "gzipBytes"), files: initial },
    lazyJs: { bytes: sum(lazy, "bytes"), gzipBytes: sum(lazy, "gzipBytes"), files: lazy },
    totalBytes: sum(files, "bytes"),
    totalGzipBytes: sum(files, "gzipBytes"),
    largest: files.slice(0, 20),
  };

  mkdirSync(join(root, "out"), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`Initial JS: ${kb(report.initialJs.bytes)} (${kb(report.initialJs.gzipBytes)} gzip)`);
  console.log(`Lazy JS:    ${kb(report.lazyJs.bytes)} (${kb(report.lazyJs.gzipBytes)} gzip)`);
  console.log(`Wrote ${relative(root, outFile)}`);

  if (args.has("--save-baseline")) {
    writeFileSync(
      baselineFile,
      `${JSON.stringify({ initialJsGzipBytes: report.initialJs.gzipBytes, savedAt: report.generatedAt }, null, 2)}\n`,
    );
    console.log(`Saved baseline → ${relative(root, baselineFile)}`);
  }

  if (args.has("--check")) {
    if (!existsSync(baselineFile)) {
      console.error("No size-baseline.json; run with --save-baseline first.");
      process.exitCode = 1;
      return;
    }
    const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as { initialJsGzipBytes: number };
    const limit = Math.round(baseline.initialJsGzipBytes * (1 + BUDGET_GROWTH));
    if (report.initialJs.gzipBytes > limit && process.env.SIZE_BUDGET_APPROVED !== "1") {
      console.error(
        `Initial JS ${kb(report.initialJs.gzipBytes)} gzip exceeds budget ${kb(limit)} (baseline + 5%). ` +
          "Set SIZE_BUDGET_APPROVED=1 if the increase is intentional.",
      );
      process.exitCode = 1;
    } else {
      console.log(`Within budget (limit ${kb(limit)} gzip).`);
    }
  }
}

if (require.main === module) main();
