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

/** Write via temp + rename so Expo web reloads never observe a half-written asset. */
function atomicWriteFile(dest: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, dest);
}

function atomicCopyFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
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
atomicCopyFile(catalogSrc, catalogDest);
atomicCopyFile(catalogSrc, assetsCatalogDest);

// Guard: refuse to leave a truncated catalog in public/ after a bad read.
{
  const verify = JSON.parse(fs.readFileSync(catalogDest, "utf8")) as LibraryCatalog;
  if (verify.format !== LIBRARY_CATALOG_FORMAT || verify.entryCount !== catalog.entryCount) {
    console.error("Catalog verification failed after atomic sync; aborting.");
    process.exit(1);
  }
}

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
  atomicCopyFile(src, path.join(publicDir, name));
  atomicCopyFile(src, path.join(projectRoot, "assets", "library", name));
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
    atomicCopyFile(sidecarPath, destPath);
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
      atomicWriteFile(destPath, JSON.stringify(payload));
      synced++;
    }
  }

  const facetsSrc = path.join(outputDir, `${entry.baseName}.facets.json`);
  if (fs.existsSync(facetsSrc)) {
    atomicCopyFile(facetsSrc, path.join(facetsDir, `${entry.baseName}.json`));
    atomicCopyFile(facetsSrc, path.join(assetsFacetsDir, `${entry.baseName}.json`));
    facetsSynced++;
  }
}

const uploadIndexDir = path.join(projectRoot, "assets", "library", "tfidf-index");
const uploadIndexPublic = path.join(publicDir, "library", "tfidf-index");
for (const name of ["corpus-stats.json", "corpus-tfidf.json.zip"] as const) {
  const src = path.join(uploadIndexDir, name);
  if (!fs.existsSync(src)) continue;
  atomicCopyFile(src, path.join(uploadIndexPublic, name));
}
const staleUploadTfidf = path.join(uploadIndexPublic, "corpus-tfidf.json");
if (fs.existsSync(staleUploadTfidf)) fs.rmSync(staleUploadTfidf);

console.log(
  `Synced library catalog (${catalog.entryCount} entries, ${synced} payloads, ${facetsSynced} facets, ${corpusSynced} corpus indexes) to public/ and assets/library/`,
);
