#!/usr/bin/env node
/**
 * Prefer live manuscript / editorial SQL proxy; otherwise refresh bootstrap fixtures + manifest.
 *
 *   MANUSCRIPT_SQL_URL=http://localhost:3310 node scripts/build-sample-fixtures.mjs
 *   node scripts/build-sample-fixtures.mjs --date 2026-10-18
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicSync } from "./lib/fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "services", "sample", "fixtures");
const SQL = process.env.MANUSCRIPT_SQL_URL || process.env.OPENDENTAL_SQL_URL || "http://localhost:3310";

function getLocalIsoDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolvePracticeDate() {
  const flagIdx = process.argv.indexOf("--date");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return String(process.argv[flagIdx + 1]);
  return process.env.DEMO_DATE || getLocalIsoDate();
}

async function tryFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function writeJson(name, data) {
  writeJsonAtomicSync(path.join(outDir, name), data);
  console.log("wrote", name);
}

function ensureBootstrap() {
  fs.mkdirSync(outDir, { recursive: true });
  const queuePath = path.join(outDir, "editorial-queue.json");
  const auditPath = path.join(outDir, "audit.json");
  const worklistPath = path.join(outDir, "worklist.json");
  const manifestPath = path.join(outDir, "manifest.json");

  if (!fs.existsSync(queuePath)) {
    writeJson("editorial-queue.json", {
      source: "bootstrap",
      date: resolvePracticeDate(),
      items: [
        { folio_id: "1r", status: "unreviewed", confidence_cents: 4200 },
        { folio_id: "3v", status: "lint_blocked", barrier: "EMPTY_COLUMN_ENVELOPE" },
        { folio_id: "5r", status: "unreviewed", confidence_cents: 6100 },
      ],
    });
  }
  if (!fs.existsSync(auditPath)) {
    writeJson("audit.json", {
      source: "bootstrap",
      barriers: ["EMPTY_COLUMN_ENVELOPE"],
      lint_errors: 1,
    });
  }
  if (!fs.existsSync(worklistPath)) {
    writeJson("worklist.json", {
      source: "bootstrap",
      stages: ["INGEST", "VALIDATE", "EDIT", "ANALYZE", "EXPORT", "LIBRARY"],
      open: ["ingest:sidecar:review_progress", "validate:lint:run_preflight"],
    });
  }
  if (!fs.existsSync(manifestPath)) {
    writeJson("manifest.json", {
      generatedAt: new Date().toISOString(),
      sourceDb: "bootstrap",
      practiceName: "HSMS Scriptorium Workstation",
      domain: "hsms_scriptorium",
    });
  }
}

async function fromProxy() {
  const today = resolvePracticeDate();
  const [queue, audit, worklist] = await Promise.all([
    tryFetch(`${SQL}/editorial-queue/${today}`),
    tryFetch(`${SQL}/audit/${today}`),
    tryFetch(`${SQL}/worklist`).catch(() => null),
  ]);
  writeJson("editorial-queue.json", {
    source: "sql",
    date: today,
    items: queue.items ?? queue.rows ?? [],
  });
  writeJson("audit.json", { source: "sql", ...audit });
  if (worklist) writeJson("worklist.json", { source: "sql", ...worklist });
  writeJson("manifest.json", {
    generatedAt: new Date().toISOString(),
    sourceDb: "manuscript-sql-proxy",
    sqlUrl: SQL,
    practiceName: "HSMS Scriptorium Workstation",
    domain: "hsms_scriptorium",
  });
}

function touchBootstrap() {
  ensureBootstrap();
  const manifestPath = path.join(outDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.generatedAt = new Date().toISOString();
  manifest.refreshedWithoutSql = true;
  writeJson("manifest.json", manifest);
  console.log("SQL proxy unreachable — refreshed bootstrap manifest only");
}

ensureBootstrap();
fromProxy()
  .then(() => console.log("[build-sample-fixtures] live proxy OK"))
  .catch(() => touchBootstrap());
