/**
 * Mnemonic completion ranking (SPEC-EDITOR ED-21).
 */
import { HSMS_MNEMONICS, type MnemonicSpec } from "@/constants/hsmsMnemonics";

export function completionToken(source: string, cursor: number): string | null {
  const upto = source.slice(0, cursor);
  const match = upto.match(/\{([A-Za-z]*)$/);
  return match ? match[1].toUpperCase() : null;
}

function contextRank(spec: MnemonicSpec, lineBefore: string): number {
  const afterFolio = /\[\s*fol(?:io)?\./i.test(lineBefore);
  if (afterFolio && spec.code === "HD") return 0;
  const insideColumn = /\{CB\d*\./i.test(lineBefore);
  if (insideColumn && (spec.code === "RUB" || spec.code === "GL" || spec.code === "IN")) return 1;
  if (insideColumn && (spec.code === "CW" || spec.code === "SG")) return 5;
  if (spec.placement === "after-last-cb") return 4;
  if (!spec.standard) return 6;
  return 3;
}

export function getMnemonicCompletions(prefix: string, lineBeforeCursor: string): MnemonicSpec[] {
  const needle = prefix.toUpperCase();
  return HSMS_MNEMONICS.filter((spec) => spec.standard && spec.code.startsWith(needle))
    .sort((a, b) => {
      const rank = contextRank(a, lineBeforeCursor) - contextRank(b, lineBeforeCursor);
      if (rank !== 0) return rank;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 8);
}

/** Insert `{CODE. ` (or `{RMK: `) replacing the open `{prefix` before the cursor. */
export function applyMnemonicCompletion(
  source: string,
  cursor: number,
  spec: MnemonicSpec,
): { text: string; cursor: number } {
  const upto = source.slice(0, cursor);
  const match = upto.match(/\{([A-Za-z]*)$/);
  if (!match) return { text: source, cursor };
  const start = cursor - match[0].length;
  const insertion = `{${spec.code}${spec.delimiter} `;
  const text = source.slice(0, start) + insertion + source.slice(cursor);
  return { text, cursor: start + insertion.length };
}
