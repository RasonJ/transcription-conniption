/**
 * Registry parity (SPEC-VALIDATION VAL-13).
 * Fails when a required manual code is missing, or a brace code in bundled
 * samples and examples is not registered.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { HSMS_MNEMONICS, isRegisteredMnemonic } from "../constants/hsmsMnemonics";

const REQUIRED = [
  "AD", "BLNK", "CB", "CW", "DIAG", "GL", "HD", "ILL", "IN", "MIN", "RMK", "RUB", "SG", "SYMB",
  "ARB", "ARG", "ARM", "BAS", "CAT", "ENG", "EXT", "FRN", "GAL", "GER", "GRK", "HEB", "ITL", "LAT", "PRT", "PRV",
];

const root = resolve(__dirname, "..");

function codesIn(text: string): string[] {
  const found = new Set<string>();
  const re = /\{([A-Z]{2,8})\d*[:.]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) found.add(match[1]);
  return [...found];
}

function main(): void {
  const failures: string[] = [];
  for (const code of REQUIRED) {
    if (!isRegisteredMnemonic(code)) failures.push(`missing required mnemonic ${code}`);
  }
  for (const spec of HSMS_MNEMONICS) {
    if (spec.standard && !spec.manualSection) {
      failures.push(`${spec.code} is standard but has no manual section`);
    }
    if (!spec.standard && !spec.extends) {
      failures.push(`${spec.code} is an extension without extends`);
    }
  }

  const files = [
    join(root, "constants", "demoTranscriptions.ts"),
    ...readdirSync(join(root, "assets", "examples"))
      .filter((name) => name.endsWith(".txt"))
      .map((name) => join(root, "assets", "examples", name)),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const code of codesIn(text)) {
      if (!isRegisteredMnemonic(code)) failures.push(`${file}: unregistered {${code}}`);
    }
  }

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`check:mnemonics ok (${HSMS_MNEMONICS.length} codes)`);
}

main();
