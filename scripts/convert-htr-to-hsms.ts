/**
 * CLI: convert Transkribus / eScriptorium HTR exports → HSMS ASCII.
 *
 *   npx tsx scripts/convert-htr-to-hsms.ts <input.txt> [output.txt]
 *   npm run convert:htr -- path/to/htr.txt
 */
import fs from "node:fs";
import path from "node:path";
import { convertHtrToHsms } from "../utils/htrConverter";

function main(): void {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx scripts/convert-htr-to-hsms.ts <input.txt> [output.txt]");
    process.exit(1);
  }
  const absIn = path.resolve(input);
  if (!fs.existsSync(absIn)) {
    console.error(`File not found: ${absIn}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(absIn, "utf8");
  const { hsmsText, rulesApplied, ruleCount } = convertHtrToHsms(raw);
  const out =
    process.argv[3] ??
    absIn.replace(/(\.txt|\.hsms)?$/i, "") + ".hsms.txt";
  fs.writeFileSync(out, hsmsText, "utf8");
  console.log(
    `Wrote ${out} (${rulesApplied}/${ruleCount} rule families changed content)`,
  );
}

main();
