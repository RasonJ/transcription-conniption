#!/usr/bin/env node
/**
 * Rebuild out/library-catalog.json from existing *.library.json sidecars
 * (or from *.native.ts when sidecars are missing).
 *
 * Usage:
 *   npm run build:library
 *   npx tsx scripts/build-library-catalog.ts --out ./out
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OSTA_PATHS } from "../utils/ostaBatchConverter";
import {
  LIBRARY_ENTRY_FORMAT,
  buildLibraryCatalog,
  buildLibraryCatalogEntry,
  buildLibraryKeywords,
  extractLibraryMetadataFromRmk,
  type LibraryCatalogEntry,
  type LibraryEntryPayload,
} from "../utils/libraryCatalog";
import { readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.resolve(projectRoot, readCliArg("--out") ?? DEFAULT_OSTA_PATHS.output);

function readNativeTranscription(nativePath: string): string | undefined {
  const source = fs.readFileSync(nativePath, "utf8");
  const match = source.match(/export const transcriptionText = (.+);\r?\n/);
  if (!match) {
    return undefined;
  }
  return JSON.parse(match[1]) as string;
}

function entryFromSidecar(filePath: string): LibraryCatalogEntry | null {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as LibraryEntryPayload;
  if (raw.format !== LIBRARY_ENTRY_FORMAT) {
    return null;
  }
  const { transcriptionText: _text, format: _fmt, ...catalogEntry } = raw;
  return catalogEntry;
}

function entryFromNative(nativePath: string): LibraryCatalogEntry | null {
  const source = fs.readFileSync(nativePath, "utf8");
  const metaMatch = source.match(/export const nativeBundleMeta = (\{[\s\S]*?\}) as const/);
  if (!metaMatch) {
    return null;
  }
  const meta = JSON.parse(metaMatch[1]) as {
    exportedAt: string;
    sourceFileName: string;
    manuscriptTitle: string;
  };
  const baseName = path.basename(nativePath, ".native.ts");
  const transcriptionText = readNativeTranscription(nativePath);
  if (!transcriptionText) {
    return null;
  }

  const fields = extractLibraryMetadataFromRmk(transcriptionText, {
    sourceFileName: meta.sourceFileName,
    manuscriptTitle: meta.manuscriptTitle,
  });
  const entry: LibraryCatalogEntry = {
    id: baseName,
    baseName,
    sourceFileName: meta.sourceFileName,
    title: fields.title,
    author: fields.author,
    year: fields.year,
    city: fields.city,
    printer: fields.printer,
    keywords: "",
    status: "ok",
    exportedAt: meta.exportedAt,
  };
  entry.keywords = buildLibraryKeywords(entry);
  return entry;
}

if (!fs.existsSync(outputDir)) {
  console.error(`Output directory not found: ${outputDir}`);
  process.exit(1);
}

const sidecars = fs
  .readdirSync(outputDir)
  .filter((name) => name.endsWith(".library.json"))
  .sort((a, b) => a.localeCompare(b));

const entries: LibraryCatalogEntry[] = [];
const seen = new Set<string>();

for (const name of sidecars) {
  const entry = entryFromSidecar(path.join(outputDir, name));
  if (!entry) {
    continue;
  }
  entries.push(entry);
  seen.add(entry.baseName);
}

if (entries.length === 0) {
  const natives = fs
    .readdirSync(outputDir)
    .filter((name) => name.endsWith(".native.ts"))
    .sort((a, b) => a.localeCompare(b));

  for (const name of natives) {
    const baseName = name.replace(/\.native\.ts$/i, "");
    if (seen.has(baseName)) {
      continue;
    }
    const entry = entryFromNative(path.join(outputDir, name));
    if (entry) {
      entries.push(entry);
      seen.add(baseName);
    }
  }
}

const catalog = buildLibraryCatalog(entries, outputDir);
const catalogPath = path.join(outputDir, "library-catalog.json");
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");

console.log(`Library catalog: ${catalogPath}`);
console.log(`  Entries: ${catalog.entryCount}`);
