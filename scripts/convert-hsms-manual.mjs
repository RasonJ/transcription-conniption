/**
 * Converts HSMS-manual.txt to docs/HSMS-manual.md
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPath = join(root, "..", "HSMS-manual.txt");
const outPath = join(root, "docs", "HSMS-manual.md");

let raw = readFileSync(srcPath, "utf8");
// Normalize legacy Windows-1252 artifacts from the text export
raw = raw.replace(/\uFFFD/g, "—").replace(/\u0096/g, "—").replace(/\u0097/g, "—");
const lines = raw.split(/\r?\n/);

const out = [];
let inCode = false;
let inToc = false;
let tocDone = false;

function stripDotLeaders(s) {
  return s.replace(/\s+\.{2,}\s*\d*\s*$/u, "").trim();
}

function flushCode() {
  if (inCode) {
    out.push("```");
    out.push("");
    inCode = false;
  }
}

function startCode() {
  if (!inCode) {
    out.push("```text");
    inCode = true;
  }
}

function isTranscriptionLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^\{[A-Z0-9]{2,}/.test(t)) return true;
  if (/^\[fol\./.test(t)) return true;
  if (/^q<|^<[a-zA-Z]>|\[%|%\s|%\d/.test(t)) return true;
  if (/^\(l\)|\(\^|\[\^|\[\.\.\.\]/.test(t)) return true;
  if (/^\{CB\d?\./.test(t)) return true;
  if (/^\{RMK:|^\{CW\.|^\{SG\.|^\{HD/.test(t)) return true;
  if (/^text of |^HHHHHHHHHH|^xxxx yyyy|^manuscript\s+transcription/i.test(t)) return true;
  if (/^[a-z].*q</.test(t)) return true;
  if (/^NORMS OF TRANSCRIPTION|^EXAMPLES\s*$/i.test(t)) return false;
  return false;
}

function slugify(s) {
  return stripDotLeaders(s)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function formatTocLine(line) {
  let cleaned = stripDotLeaders(line);
  cleaned = cleaned.replace(/\s+\.{2,}.*$/, "").trim();
  const pageMatch = line.match(/\.{2,}\s*(\S+)\s*$/);
  const page = pageMatch?.[1] ?? "";
  const title = cleaned.replace(/\s+\d+[a-z]?\s*$/i, "").trim();
  if (!title || title.length < 3) return null;
  if (/^A\.$/.test(title)) return null;
  const anchor = slugify(title);
  return page ? `- [${title}](#${anchor}) — p. ${page}` : `- [${title}](#${anchor})`;
}

function getHeading(line, nextLine) {
  let t = stripDotLeaders(line.trim());
  const n = nextLine?.trim() ?? "";

  if (/^1\)\s|^\d+\)\s/.test(t) && /\.{2,}/.test(line)) return null;

  if (/^Preface to the/i.test(t)) return { level: 2, text: t };
  if (t === "Introduction") return { level: 2, text: t };
  if (t === "Table of Contents") return { level: 2, text: t };
  if (t === "LIST OF PLATES") return { level: 2, text: t };
  if (t === "Index") return { level: 2, text: t };
  if (/^ASCII character/i.test(t)) return { level: 2, text: t };
  if (/^Plate \d+/.test(t)) return { level: 3, text: t };

  if (t === "A." && /^NORMS OF TRANSCRIPTION/i.test(n)) {
    return { level: 2, text: "A. NORMS OF TRANSCRIPTION" };
  }
  if (t === "B." && /^EXAMPLES/i.test(n)) {
    return { level: 2, text: "B. EXAMPLES" };
  }

  if (/^[0-9]+\.\s+[A-Z][A-Z0-9\s,\-–—]+$/.test(t) && t.length < 70) {
    return { level: 2, text: t };
  }
  if (/^[0-9]+\.[0-9]+[a-z]?\s+/.test(t)) {
    return { level: 3, text: t };
  }
  if (/^[0-9]+\.[0-9]{2,}[a-z]?\s+/.test(t)) {
    return { level: 4, text: t };
  }
  return null;
}

out.push("---");
out.push("title: HSMS Manual of Manuscript Transcription");
out.push("source: Hispanic Seminary of Medieval Studies, Fifth Edition (1997)");
out.push("isbn: 1-56954-067-5");
out.push("---");
out.push("");
out.push("# A Manual of Manuscript Transcription");
out.push("");
out.push("**For the Dictionary of the Old Spanish Language** — David Mackenzie; Fifth Edition revised by Ray Harris-Northall (HSMS, Madison, 1997). ISBN 1-56954-067-5.");
out.push("");
out.push("> Markdown edition for the Transcription Conniption project. Generated from `HSMS-manual.txt`. **Plate facsimiles and figures** appear only in the [PDF original](../HSMS-manual.pdf) at the repository parent folder.");
out.push("");

let i = 0;
while (i < lines.length && !lines[i].includes("Table of Contents")) i++;

for (; i < lines.length; i++) {
  let line = lines[i];
  const trimmed = line.trim();
  const nextLine = lines[i + 1] ?? "";

  if (trimmed === "Table of Contents") {
    flushCode();
    inToc = true;
    out.push("## Table of Contents");
    out.push("");
    continue;
  }

  if (inToc && !tocDone) {
    if (trimmed === "" && out[out.length - 1]?.startsWith("- ")) continue;
    const toc = formatTocLine(line);
    if (toc) {
      out.push(toc);
      continue;
    }
    if (/^Preface to the/i.test(trimmed) || trimmed === "Introduction") {
      tocDone = true;
      inToc = false;
      i--;
      continue;
    }
    if (trimmed && !/\.{4,}/.test(line)) {
      tocDone = true;
      inToc = false;
      i--;
      continue;
    }
    continue;
  }

  if (trimmed === "") {
    if (inCode) {
      const peek = lines.slice(i + 1, i + 4).some((l) => isTranscriptionLine(l));
      if (!peek) flushCode();
    }
    continue;
  }

  const heading = getHeading(line, nextLine);
  if (heading) {
    flushCode();
    if (heading.text.includes("NORMS OF TRANSCRIPTION") && trimmed === "A.") i++;
    if (heading.text.includes("EXAMPLES") && trimmed === "B.") i++;
    const hashes = "#".repeat(heading.level);
    out.push("");
    out.push(`${hashes} ${heading.text}`);
    out.push("");
    continue;
  }

  if (isTranscriptionLine(line)) {
    startCode();
    out.push(line.trimEnd());
    continue;
  }

  if (inCode) flushCode();

  if (/^BIT [0-9]|^NUL |^SOH /.test(trimmed)) {
    startCode();
    out.push(line.trimEnd());
    continue;
  }

  if (/^\d+\.\s*$/.test(trimmed) && i < 280) {
    const next = lines[i + 1]?.trim() ?? "";
    if (next && /Biblioteca|Picatrix|Libro/.test(next)) {
      out.push(`- ${next}`);
      i++;
      continue;
    }
  }

  out.push(line.trimEnd());
}

flushCode();
out.push("");
out.push("---");
out.push("*Copyright © 1997 Hispanic Seminary of Medieval Studies, Ltd.*");

writeFileSync(outPath, out.join("\n"), "utf8");
console.log(`Wrote ${outPath} (${out.filter((l) => l).length} non-empty lines)`);
