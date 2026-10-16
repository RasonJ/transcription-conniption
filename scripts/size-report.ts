import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(__dirname, "..");
const distDir = join(root, "dist");
const outFile = join(root, "out", "size-report.json");

type FileEntry = { path: string; bytes: number; gzipBytes?: number };

function walk(dir: string, acc: FileEntry[]): FileEntry[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else {
      const entry: FileEntry = { path: relative(distDir, full).replace(/\\/g, "/"), bytes: stat.size };
      if (/\.(js|json|css|html)$/.test(name)) {
        entry.gzipBytes = gzipSync(readFileSync(full)).length;
      }
      acc.push(entry);
    }
  }
  return acc;
}

const notes: string[] = [];
let files: FileEntry[] = [];

if (existsSync(distDir)) {
  files = walk(distDir, []).sort((a, b) => b.bytes - a.bytes);
  notes.push(`Scanned ${files.length} files under dist/.`);
} else {
  notes.push("dist/ not found; run `npm run build:web` first for real numbers.");
}

const report = {
  generatedAt: new Date().toISOString(),
  stub: files.length === 0,
  totalBytes: files.reduce((n, f) => n + f.bytes, 0),
  totalGzipBytes: files.reduce((n, f) => n + (f.gzipBytes ?? 0), 0),
  largest: files.slice(0, 20),
  notes,
};

mkdirSync(join(root, "out"), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${relative(root, outFile)}`);
