#!/usr/bin/env node
/**
 * Copy library catalog + entry JSON from out/ to public/ for Expo web.
 * Generates entry payloads from *.native.ts when *.library.json sidecars are absent.
 *
 * Usage:
 *   npm run sync:library
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OSTA_PATHS } from "../utils/ostaBatchConverter";
import {
  LIBRARY_CATALOG_FORMAT,
  LIBRARY_ENTRY_FORMAT,
  type LibraryCatalog,
  type LibraryEntryPayload,
} from "../utils/libraryCatalog";
import { readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.resolve(projectRoot, readCliArg("--out") ?? DEFAULT_OSTA_PATHS.output);
const publicDir = path.join(projectRoot, "public");
const entriesDir = path.join(publicDir, "library", "entries");
const catalogSrc = path.join(outputDir, "library-catalog.json");
const catalogDest = path.join(publicDir, "library-catalog.json");
const assetsCatalogDest = path.join(projectRoot, "assets", "library", "catalog.json");

function copyFile(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function readNativeTranscription(nativePath: string): string | undefined {
  const source = fs.readFileSync(nativePath, "utf8");
  const match = source.match(/export const transcriptionText = (.+);\r?\n/);
  if (!match) {
    return undefined;
  }
  return JSON.parse(match[1]) as string;
}

if (!fs.existsSync(catalogSrc)) {
  console.error(`Missing ${catalogSrc}. Run npm run build:library first.`);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogSrc, "utf8")) as LibraryCatalog;
if (catalog.format !== LIBRARY_CATALOG_FORMAT) {
  console.error("Unexpected library catalog format");
  process.exit(1);
}

fs.mkdirSync(entriesDir, { recursive: true });
copyFile(catalogSrc, catalogDest);
copyFile(catalogSrc, assetsCatalogDest);

let synced = 0;

for (const entry of catalog.entries) {
  if (entry.status !== "ok") {
    continue;
  }

  const destPath = path.join(entriesDir, `${entry.baseName}.json`);
  const sidecarPath = path.join(outputDir, `${entry.baseName}.library.json`);

  if (fs.existsSync(sidecarPath)) {
    copyFile(sidecarPath, destPath);
    synced++;
    continue;
  }

  const nativePath = path.join(outputDir, `${entry.baseName}.native.ts`);
  const transcriptionText = fs.existsSync(nativePath)
    ? readNativeTranscription(nativePath)
    : undefined;

  if (!transcriptionText) {
    continue;
  }

  const payload: LibraryEntryPayload = {
    format: LIBRARY_ENTRY_FORMAT,
    ...entry,
    transcriptionText,
  };
  fs.writeFileSync(destPath, JSON.stringify(payload), "utf8");
  synced++;
}

console.log(`Synced library catalog (${catalog.entryCount} entries, ${synced} payloads) to public/ and assets/library/`);
