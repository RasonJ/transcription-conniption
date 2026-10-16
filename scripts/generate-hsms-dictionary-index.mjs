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
/** Prefer env override, then local asset, then sibling HSMS-tools diccionario (275k+ forms). */
const SRC_CANDIDATES = [
  process.env.HSMS_SRC_PATH,
  path.join(root, "assets", "dic", "hsms.src"),
  path.join(root, "..", "gu", "HSMS-tools", "diccionario", "hsms.src"),
  path.join(root, "..", "gu", "HSMS-tools", "analizador", "hsms-es", "hsms.src"),
].filter(Boolean);

function resolveHsmsSrc() {
  let best = null;
  let bestSize = -1;
  for (const candidate of SRC_CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    const size = fs.statSync(candidate).size;
    if (size > bestSize) {
      best = candidate;
      bestSize = size;
    }
  }
  return best;
}

const SRC = resolveHsmsSrc();
const LOCAL_ASSET = path.join(root, "assets", "dic", "hsms.src");
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
  if (!SRC || !fs.existsSync(SRC)) {
    console.error(
      "Missing hsms.src — place under assets/dic/hsms.src or set HSMS_SRC_PATH (sibling gu/HSMS-tools/diccionario/hsms.src also works).",
    );
    process.exit(1);
  }

  console.log(`Reading dictionary source: ${SRC} (${fs.statSync(SRC).size} bytes)`);

  // Keep assets/dic/hsms.src in sync when we pulled a newer sibling copy.
  if (path.resolve(SRC) !== path.resolve(LOCAL_ASSET)) {
    fs.mkdirSync(path.dirname(LOCAL_ASSET), { recursive: true });
    const localSize = fs.existsSync(LOCAL_ASSET) ? fs.statSync(LOCAL_ASSET).size : 0;
    if (fs.statSync(SRC).size > localSize) {
      fs.copyFileSync(SRC, LOCAL_ASSET);
      console.log(`Synced larger dictionary → ${LOCAL_ASSET}`);
    }
  }

  const index = Object.create(null);
  const posIndex = Object.create(null);
  let inEntries = false;
  let count = 0;
  let posCount = 0;

  const fileStream = fs.createReadStream(SRC, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (line === "<Entries>") {
        inEntries = true;
        continue;
      }
      if (line === "</Entries>") {
        inEntries = false;
        continue;
      }
      if (!inEntries || !line || line.charCodeAt(0) === 60) continue; // skip '<' tags

      const spaceIdx = line.indexOf(" ");
      if (spaceIdx <= 0) continue;

      const rawSurface = line.slice(0, spaceIdx);
      const surface = rawSurface.toLowerCase();
      if (!surface || surface.charCodeAt(0) === 46 || surface.charCodeAt(0) === 38) continue; // '.' / '&'

      const rest = line.slice(spaceIdx + 1).trim();
      if (!rest) continue;
      const tokens = [rawSurface, ...rest.split(/\s+/)];

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
  } finally {
    rl.close();
    fileStream.destroy();
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
