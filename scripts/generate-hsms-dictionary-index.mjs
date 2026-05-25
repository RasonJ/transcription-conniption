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

function pickLemma(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || t.includes("+") || t.startsWith("&")) continue;
    if (/^[A-Z]{2,}\d/.test(t)) continue;
    if (/^[A-Z]{2,}$/.test(t) && !/[a-záéíóúñü]/i.test(t)) continue;
    if (/[a-záéíóúñü]/i.test(t)) return t.toLowerCase();
  }
  return undefined;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC}`);
    process.exit(1);
  }

  const index = Object.create(null);
  let inEntries = false;
  let count = 0;

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
    const lemma = pickLemma(tokens);
    if (!surface || !lemma || surface.startsWith(".") || surface.startsWith("&")) continue;
    if (lemma.length < 2) continue;

    if (!index[surface]) {
      index[surface] = lemma;
      count++;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(index), "utf8");
  console.log(`Wrote ${count} lemma entries → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
