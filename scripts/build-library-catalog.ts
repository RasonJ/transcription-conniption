#!/usr/bin/env node
/**
 * Rebuild out/library-catalog.json from existing *.library.json sidecars
 * (or from *.native.ts when sidecars are missing), then precompute corpus
 * TF-IDF, facet sidecars, stats, and the codicological library graph.
 *
 * Usage:
 *   npm run build:library
 *   npx tsx scripts/build-library-catalog.ts --out ./out
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshPublishedCorpus } from "../utils/corpusPrecompute";
import { DEFAULT_OSTA_PATHS } from "../utils/ostaBatchConverter";
import {
  LIBRARY_ENTRY_FORMAT,
  buildLibraryCatalog,
  buildLibraryKeywords,
  extractLibraryMetadataFromRmk,
  type LibraryCatalogEntry,
  type LibraryEntryPayload,
} from "../utils/libraryCatalog";
import { parseNativeBundleMeta, parseNativeTranscriptionSource } from "./readNativeBundle";
import { hasCliFlag, readCliArg } from "./readCliArg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.resolve(projectRoot, readCliArg("--out") ?? DEFAULT_OSTA_PATHS.output);
const skipPrecompute = hasCliFlag("--no-precompute");
const forceFacets = hasCliFlag("--force-facets");

function entryFromSidecar(filePath: string): LibraryCatalogEntry | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as LibraryEntryPayload;
    if (raw.format !== LIBRARY_ENTRY_FORMAT) {
      return null;
    }
    const { transcriptionText: _text, format: _fmt, ...catalogEntry } = raw;
    return catalogEntry;
  } catch {
    return null;
  }
}

function entryFromNative(nativePath: string): LibraryCatalogEntry | null {
  try {
    const source = fs.readFileSync(nativePath, "utf8");
    const meta = parseNativeBundleMeta(source);
    if (!meta) {
      return null;
    }

    const transcriptionText = parseNativeTranscriptionSource(source);
    if (!transcriptionText) {
      return null;
    }

    const baseName = path.basename(nativePath, ".native.ts");
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
  } catch {
    return null;
  }
}

function main(): void {
  if (!fs.existsSync(outputDir)) {
    console.error(`Output directory not found: ${outputDir}`);
    process.exit(1);
  }

  const sidecars = fs
    .readdirSync(outputDir)
    .filter((name) => /\.library\.json$/i.test(name))
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
      .filter((name) => /\.native\.ts$/i.test(name))
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

  if (skipPrecompute) {
    console.log("  Precompute: skipped (--no-precompute)");
    return;
  }

  console.log("  Precomputing facets / TF-IDF / library graph…");
  const started = Date.now();
  const nodeFs = {
    readdir: (dir: string) => fs.readdirSync(path.normalize(dir)),
    readFile: (filePath: string) => fs.readFileSync(path.normalize(filePath), "utf8"),
    writeFile: (filePath: string, contents: string) => {
      const normalized = path.normalize(filePath);
      fs.mkdirSync(path.dirname(normalized), { recursive: true });
      fs.writeFileSync(normalized, contents, "utf8");
    },
    exists: (filePath: string) => fs.existsSync(path.normalize(filePath)),
  };

  const result = refreshPublishedCorpus(
    {
      outputDir,
      catalog,
      skipExistingFacets: !forceFacets,
      onProgress(baseName, index, total) {
        if (index % 50 === 0 || index === 1 || index === total) {
          console.log(`    [${index}/${total}] ${baseName}`);
        }
      },
    },
    nodeFs,
    path.join,
  );

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  Facets:        ${result.facetsWritten} witnesses (${sec}s)`);
  console.log(`  TF-IDF terms:  ${Object.keys(result.corpusTfidf.idf).length}`);
  console.log(`  Postings:      ${Object.keys(result.corpusPostings.postings).length} terms`);
  console.log(`  Graph nodes:   ${result.libraryGraph.nodeCount}`);
  console.log(`  Graph edges:   ${result.libraryGraph.edgeCount}`);
  console.log(
    `  Wrote: corpus-tfidf.json, corpus-stats.json, corpus-term-postings.json, library-graph.json`,
  );
}

main();
