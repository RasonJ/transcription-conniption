/**
 * Runtime lookup for MUFI HSMS → HTML → Unicode mappings and ornate-initial inventory.
 * Generated data: utils/generated/mufiCharMap.ts, ornateInitialInventory.ts
 */
import { MUFI_CHARS, MUFI_CHAR_SOURCE, type MufiCharEntry } from "./generated/mufiCharMap";
import {
  ORNATE_INITIAL_INVENTORY,
  ORNATE_STYLE_LABELS,
  type OrnateInitialInventoryEntry,
} from "./generated/ornateInitialInventory";

export type { MufiCharEntry, OrnateInitialInventoryEntry };
export { MUFI_CHAR_SOURCE, ORNATE_STYLE_LABELS };

const byCodepoint = new Map<string, MufiCharEntry>();
const byBaseLetter = new Map<string, MufiCharEntry[]>();
const byHsms = new Map<string, MufiCharEntry>();

for (const entry of MUFI_CHARS) {
  byCodepoint.set(entry.codepoint, entry);
  if (entry.baseLetter) {
    const list = byBaseLetter.get(entry.baseLetter) ?? [];
    list.push(entry);
    byBaseLetter.set(entry.baseLetter, list);
  }
  if (entry.hsms) {
    for (const key of entry.hsms) byHsms.set(key, entry);
  }
}

export function listMufiChars(): readonly MufiCharEntry[] {
  return MUFI_CHARS;
}

export function lookupMufiByCodepoint(codepoint: string): MufiCharEntry | undefined {
  const key = codepoint.trim().toUpperCase().replace(/^U\+/, "U+");
  const normalized = key.startsWith("U+") ? key : `U+${key}`;
  return byCodepoint.get(normalized);
}

export function lookupMufiByHsms(hsms: string): MufiCharEntry | undefined {
  return byHsms.get(hsms) ?? byHsms.get(hsms.replace(/@/g, ""));
}

export function listMufiByBaseLetter(letter: string): readonly MufiCharEntry[] {
  if (!letter) return [];
  const exact = byBaseLetter.get(letter);
  if (exact?.length) return exact;
  const lower = byBaseLetter.get(letter.toLowerCase()) ?? [];
  const upper = byBaseLetter.get(letter.toUpperCase()) ?? [];
  return [...upper, ...lower];
}

export function getOrnateInitialInventory(
  letter?: string,
): readonly OrnateInitialInventoryEntry[] {
  if (!letter) return ORNATE_INITIAL_INVENTORY;
  const target = letter.toUpperCase();
  return ORNATE_INITIAL_INVENTORY.filter((e) => e.letter === target);
}

/** Convenience: HSMS / HTML / Unicode triple when an HSMS binding exists. */
export function hsmsHtmlUnicodeTriple(
  hsms: string,
): { hsms: string; html: string; unicode: string; codepoint: string } | null {
  const entry = lookupMufiByHsms(hsms);
  if (!entry?.html || !entry.unicode) return null;
  return {
    hsms,
    html: entry.html,
    unicode: entry.unicode,
    codepoint: entry.codepoint,
  };
}
