/**
 * Download / rebuild assets/mufi/mufi-chars.json from the MUFI v4.0 chart.
 *
 * Prefers a live JSON snapshot from mufi.info when available; otherwise
 * downloads the official PDF and parses pdftotext output (CC BY-SA 4.0).
 *
 *   npm run fetch:mufi
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mufiDir = path.join(root, "assets", "mufi");
const pdfPath = path.join(mufiDir, "MUFI-v4.0-chart.pdf");
const txtPath = path.join(mufiDir, "MUFI-v4.0-chart.txt");
const jsonPath = path.join(mufiDir, "mufi-chars.json");

const PDF_URL = "https://mufi.info/projects/mufi/pdfs/MUFI%20v4.0%20chart.pdf";
const JSON_CANDIDATES = [
  "https://mufi.info/q.php?p=mufi/chars&format=json",
  "https://mufi.info/q.php?p=mufi/export&format=json",
];

const UA = "TranscriptionConniption/1.0 (MUFI catalog fetch; research)";

function codepointRangeCategory(cp) {
  const n = Number.parseInt(cp, 16);
  if (Number.isNaN(n)) return "Unknown";
  if (n <= 0x007f) return "Basic Latin";
  if (n <= 0x00ff) return "Latin-1 Supplement";
  if (n <= 0x017f) return "Latin Extended-A";
  if (n <= 0x024f) return "Latin Extended-B";
  if (n <= 0x02af) return "IPA Extensions";
  if (n <= 0x02ff) return "Spacing Modifier Letters";
  if (n <= 0x036f) return "Combining Diacritical Marks";
  if (n <= 0x03ff) return "Greek and Coptic";
  if (n <= 0x1d7f) return "Phonetic Extensions";
  if (n <= 0x1dbf) return "Phonetic Extensions Supplement";
  if (n <= 0x1dff) return "Combining Diacritical Marks Supplement";
  if (n <= 0x1eff) return "Latin Extended Additional";
  if (n <= 0x206f) return "General Punctuation";
  if (n <= 0x209f) return "Superscripts and Subscripts";
  if (n <= 0x218f) return "Number Forms";
  if (n <= 0x2c7f) return "Latin Extended-C";
  if (n <= 0x2e7f) return "Supplemental Punctuation";
  if (n <= 0xa7ff) return "Latin Extended-D";
  if (n <= 0xabff) return "Latin Extended-E";
  if (n >= 0xe000 && n <= 0xf8ff) return "Private Use Area";
  if (n >= 0xfb00 && n <= 0xfb4f) return "Alphabetic Presentation Forms";
  return "Other";
}

function inferBaseLetter(name, glyph) {
  const m = name.match(
    /LATIN (?:SMALL|CAPITAL) LETTER ([A-Z])(?:\b| WITH| WITH)/i,
  );
  if (m) return m[1].toLowerCase() === m[1] ? m[1] : m[1];
  const letterMatch = name.match(/LATIN (?:SMALL|CAPITAL) LETTER ([A-Z]{1,3})\b/i);
  if (letterMatch) {
    const raw = letterMatch[1];
    if (raw.length === 1) return /SMALL/.test(name) ? raw.toLowerCase() : raw.toUpperCase();
  }
  const g = (glyph ?? "").normalize("NFD").replace(/\p{M}/gu, "");
  if (/^[A-Za-z]$/.test(g)) return g;
  return null;
}

function normalizeBaseLetter(name, glyph) {
  const m = name.match(/LATIN (SMALL|CAPITAL) LETTER ([A-Z])\b/i);
  if (m) {
    return m[1].toUpperCase() === "SMALL" ? m[2].toLowerCase() : m[2].toUpperCase();
  }
  const digraph = name.match(/LATIN (SMALL|CAPITAL) LETTER ([A-Z]{2,})\b/i);
  if (digraph) return digraph[2];
  const g = (glyph ?? "").normalize("NFD").replace(/\p{M}/gu, "");
  if (/^[A-Za-z]$/.test(g)) return g;
  return null;
}

/** Parse pdftotext -layout lines into catalog entries. */
export function parseMufiChartText(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  const byCp = new Map();

  // glyph  [&entity;]  HEX  NAME…   — name may continue on following lines
  const rowRe =
    /^(\S)\s+(?:&([A-Za-z0-9]+);\s+)?([0-9A-Fa-f]{4,5})\s+([A-Z][A-Z0-9 ,’'\-]+)$/;
  const rowReLoose =
    /^(.+?)\s+(?:&([A-Za-z0-9]+);\s+)?([0-9A-Fa-f]{4,5})\s+([A-Z][A-Z0-9 ,’'\-]+)$/;

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].replace(/\u000c/g, "").trimEnd();
    i++;
    if (!line.trim()) continue;
    if (/^MUFI character recommendation/i.test(line.trim())) continue;
    if (/^version 4\.0/i.test(line.trim())) continue;

    let m = line.match(rowRe) || line.match(rowReLoose);
    if (!m) continue;

    let glyph = m[1].trim();
    // Prefer single grapheme when the left column has junk
    if (glyph.length > 8) {
      const first = [...glyph][0];
      glyph = first ?? glyph;
    }
    const entity = m[2] ? `&${m[2]};` : null;
    const hex = m[3].toUpperCase().padStart(4, "0");
    let name = m[4].trim();

    // Join wrapped name continuations (no hex column)
    while (i < lines.length) {
      const next = lines[i].replace(/\u000c/g, "").trim();
      if (!next) break;
      if (/^[0-9A-Fa-f]{4,5}\b/.test(next)) break;
      if (rowRe.test(next) || rowReLoose.test(next)) break;
      if (/^MUFI character recommendation/i.test(next)) break;
      if (/^In Medieval|^Note that|^See |^This |^The |^For |^When /i.test(next)) break;
      // Continuation of descriptive name
      if (/^[A-Z0-9 ,’'\-]+$/.test(next) || /^(WITH|AND|OR|LETTER|SIGN|COMBINING)\b/i.test(next)) {
        name = `${name} ${next}`.replace(/\s+/g, " ").trim();
        i++;
        continue;
      }
      break;
    }

    if (!/^[0-9A-F]{4,5}$/.test(hex)) continue;
    // Skip false positives from page headers / TOC
    if (name.length < 3) continue;

    const codepoint = `U+${hex}`;
    const cpNum = Number.parseInt(hex, 16);
    let unicode = "";
    try {
      unicode = String.fromCodePoint(cpNum);
    } catch {
      unicode = "";
    }

    const entry = {
      codepoint,
      unicode,
      entity,
      name,
      category: codepointRangeCategory(hex),
      baseLetter: normalizeBaseLetter(name, glyph),
      glyph,
    };

    // Prefer entries that have an entity name when duplicates appear
    const prev = byCp.get(codepoint);
    if (!prev || (!prev.entity && entry.entity)) {
      byCp.set(codepoint, entry);
    }
  }

  for (const e of byCp.values()) entries.push(e);
  entries.sort((a, b) => Number.parseInt(a.codepoint.slice(2), 16) - Number.parseInt(b.codepoint.slice(2), 16));
  return entries;
}

async function tryLiveJson() {
  for (const url of JSON_CANDIDATES) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
      });
      const ctype = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (!res.ok || !ctype.includes("json")) {
        console.warn(`skip ${url} (${res.status} ${ctype})`);
        continue;
      }
      const data = JSON.parse(text);
      if (Array.isArray(data) && data.length > 100) return data;
      if (data?.chars && Array.isArray(data.chars)) return data.chars;
    } catch (err) {
      console.warn(`skip ${url}: ${err.message}`);
    }
  }
  return null;
}

function findPdftotext() {
  try {
    const which = process.platform === "win32" ? "where.exe pdftotext" : "which pdftotext";
    const out = execSync(which, { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* fall through */
  }
  return null;
}

async function ensurePdf() {
  if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100_000) return;
  console.log(`Downloading ${PDF_URL}`);
  const res = await fetch(PDF_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(mufiDir, { recursive: true });
  fs.writeFileSync(pdfPath, buf);
  console.log(`Wrote ${pdfPath} (${buf.length} bytes)`);
}

function ensureTxt() {
  if (fs.existsSync(txtPath) && fs.statSync(txtPath).size > 10_000) return;
  const bin = findPdftotext();
  if (!bin) {
    throw new Error(
      "pdftotext not found and assets/mufi/MUFI-v4.0-chart.txt is missing. Install poppler or place the txt extract.",
    );
  }
  console.log(`Running pdftotext → ${txtPath}`);
  execFileSync(bin, ["-layout", pdfPath, txtPath], { stdio: "inherit" });
}

async function main() {
  fs.mkdirSync(mufiDir, { recursive: true });

  const live = await tryLiveJson();
  let chars;
  let source;

  if (live) {
    chars = live.map((row) => {
      const hex = String(row.codepoint ?? row.cp ?? row.unicode ?? "")
        .replace(/^U\+/i, "")
        .toUpperCase();
      const codepoint = `U+${hex}`;
      const cpNum = Number.parseInt(hex, 16);
      const unicode =
        row.char ?? row.glyph ?? (Number.isFinite(cpNum) ? String.fromCodePoint(cpNum) : "");
      const name = row.name ?? row.description ?? row.desc ?? "";
      return {
        codepoint,
        unicode,
        entity: row.entity ? (String(row.entity).startsWith("&") ? row.entity : `&${row.entity};`) : null,
        name,
        category: row.category ?? codepointRangeCategory(hex),
        baseLetter: row.baseLetter ?? normalizeBaseLetter(name, unicode),
        glyph: unicode,
      };
    });
    source = "mufi.info live JSON";
  } else {
    await ensurePdf();
    ensureTxt();
    const text = fs.readFileSync(txtPath, "utf8");
    chars = parseMufiChartText(text);
    source = "MUFI v4.0 PDF chart (pdftotext)";
  }

  const payload = {
    format: "mufi-chars/v1",
    source,
    license: "CC-BY-SA-4.0",
    attribution:
      "Medieval Unicode Font Initiative; Odd Einar Haugen (ed.), MUFI character recommendation v4.0 (2015-12-22). https://mufi.info/ https://hdl.handle.net/1956/10699",
    generatedAt: new Date().toISOString(),
    count: chars.length,
    chars,
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${chars.length} MUFI chars → ${path.relative(root, jsonPath)} (via ${source})`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
