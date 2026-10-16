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
import { readNativeTranscription } from "./readNativeBundle";
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

const corpusArtifacts = [
  "corpus-tfidf.json",
  "corpus-stats.json",
  "corpus-term-postings.json",
  "library-graph.json",
] as const;
const facetsDir = path.join(publicDir, "library", "facets");
const assetsFacetsDir = path.join(projectRoot, "assets", "library", "facets");
fs.mkdirSync(facetsDir, { recursive: true });
fs.mkdirSync(assetsFacetsDir, { recursive: true });

let corpusSynced = 0;
for (const name of corpusArtifacts) {
  const src = path.join(outputDir, name);
  if (!fs.existsSync(src)) continue;
  copyFile(src, path.join(publicDir, name));
  copyFile(src, path.join(projectRoot, "assets", "library", name));
  corpusSynced++;
}

let synced = 0;
let facetsSynced = 0;

for (const entry of catalog.entries) {
  if (entry.status !== "ok") {
    continue;
  }

  const destPath = path.join(entriesDir, `${entry.baseName}.json`);
  const sidecarPath = path.join(outputDir, `${entry.baseName}.library.json`);

  if (fs.existsSync(sidecarPath)) {
    copyFile(sidecarPath, destPath);
    synced++;
  } else {
    const nativePath = path.join(outputDir, `${entry.baseName}.native.ts`);
    const transcriptionText = fs.existsSync(nativePath)
      ? readNativeTranscription(nativePath)
      : undefined;

    if (transcriptionText) {
      const payload: LibraryEntryPayload = {
        format: LIBRARY_ENTRY_FORMAT,
        ...entry,
        transcriptionText,
      };
      fs.writeFileSync(destPath, JSON.stringify(payload), "utf8");
      synced++;
    }
  }

  const facetsSrc = path.join(outputDir, `${entry.baseName}.facets.json`);
  if (fs.existsSync(facetsSrc)) {
    copyFile(facetsSrc, path.join(facetsDir, `${entry.baseName}.json`));
    copyFile(facetsSrc, path.join(assetsFacetsDir, `${entry.baseName}.json`));
    facetsSynced++;
  }
}

console.log(
  `Synced library catalog (${catalog.entryCount} entries, ${synced} payloads, ${facetsSynced} facets, ${corpusSynced} corpus indexes) to public/ and assets/library/`,
);
