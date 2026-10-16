/**
 * Builds a compact lemma index from assets/dic/hsms.src (DB_MAP dictionary).
 * Format per line: <surface> <tags...> <lemma candidates...>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SRC = path.join(root, "assets", "dic", "hsms.src");
const OUTPUT = path.join(root, "utils", "generated", "hsmsLemmaIndex.json");
/** Surface → EAGLES-style POS tag (from analizador / hsms.src third field). */
const POS_OUTPUT = path.join(root, "utils", "generated", "hsmsPosIndex.json");
/** Front-coded web asset, fetched lazily (see utils/lemmaDictionaryCodec.ts). */
const WEB_OUTPUT = path.join(root, "public", "dic", "hsmsLemmaIndex.v2.tsv");
const FORMAT_HEADER = "#hsms-lemma-index/2";
/** EAGLES-like morphological tag: letters then digits (e.g. VMN0000, NCMS000). */
const RE_POS_TAG = /^[A-Z]{1,4}\d/;

function sharedPrefix(a, b) {
  const max = Math.min(a.length, b.length, 35);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** Mirrors encodeLemmaEntries in utils/lemmaDictionaryCodec.ts. */
export function encodeLemmaEntries(index) {
  const surfaces = Object.keys(index).sort();
  const lines = [FORMAT_HEADER];
  let prev = "";
  for (const surface of surfaces) {
    const lemma = index[surface];
    const p = sharedPrefix(prev, surface);
    let lemmaField = "";
    if (lemma !== surface) {
      const q = sharedPrefix(surface, lemma);
      lemmaField = String.fromCharCode(48 + q) + lemma.slice(q);
    }
    lines.push(`${String.fromCharCode(48 + p)}${surface.slice(p)}\t${lemmaField}`);
    prev = surface;
  }
  return lines.join("\n");
}

function pickLemma(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || t.includes("+") || t.startsWith("&")) continue;
    if (RE_POS_TAG.test(t)) continue;
    if (/^[A-Z]{2,}$/.test(t) && !/[a-záéíóúñü]/i.test(t)) continue;
    if (/[a-záéíóúñü]/i.test(t)) return t.toLowerCase();
  }
  return undefined;
}

/** First EAGLES-style POS tag on the entry line (analizador tagset). */
function pickPos(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t && RE_POS_TAG.test(t)) return t;
  }
  return undefined;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC}`);
    process.exit(1);
  }

  const index = Object.create(null);
  const posIndex = Object.create(null);
  let inEntries = false;
  let count = 0;
  let posCount = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(SRC, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line === "<Entries>") {
      inEntries = true;
      continue;
    }
    if (line === "</Entries>") {
      inEntries = false;
      continue;
    }
    if (!inEntries || !line.trim() || line.startsWith("<")) continue;

    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 2) continue;

    const surface = tokens[0].toLowerCase();
    if (!surface || surface.startsWith(".") || surface.startsWith("&")) continue;

    const lemma = pickLemma(tokens);
    if (lemma && lemma.length >= 2 && !index[surface]) {
      index[surface] = lemma;
      count++;
    }

    const pos = pickPos(tokens);
    if (pos && !posIndex[surface]) {
      posIndex[surface] = pos;
      posCount++;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(index), "utf8");
  console.log(`Wrote ${count} lemma entries → ${OUTPUT}`);
  fs.writeFileSync(POS_OUTPUT, JSON.stringify(posIndex), "utf8");
  console.log(`Wrote ${posCount} POS entries → ${POS_OUTPUT}`);
  const webPos = path.join(root, "public", "dic", "hsmsPosIndex.json");
  fs.mkdirSync(path.dirname(WEB_OUTPUT), { recursive: true });
  fs.writeFileSync(WEB_OUTPUT, encodeLemmaEntries(index), "utf8");
  fs.writeFileSync(webPos, JSON.stringify(posIndex), "utf8");
  console.log(`Wrote front-coded web dictionary → ${WEB_OUTPUT}`);
  console.log(`Wrote web POS index → ${webPos}`);
}

/** `--web-only` re-encodes the existing JSON without needing assets/dic/hsms.src. */
if (process.argv.includes("--web-only")) {
  const index = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
  fs.mkdirSync(path.dirname(WEB_OUTPUT), { recursive: true });
  fs.writeFileSync(WEB_OUTPUT, encodeLemmaEntries(index), "utf8");
  console.log(`Wrote front-coded web dictionary → ${WEB_OUTPUT}`);
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
