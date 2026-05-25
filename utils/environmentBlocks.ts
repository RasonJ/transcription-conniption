import { LANGUAGE_TAG_CODES } from "../constants/languageTags";
import type { BlockType } from "../constants/manuscript";
import { escapeRegex } from "./regexUtils";

/** Opening environment tag at line start: {LAT. …}, { LAT …}, {Glosa. …}, etc. */
export const ENV_OPEN_RE = /^\{\s*([A-Za-z]{2,5})(?:\.|\s+)\s*/i;

const ENVELOPE_MAP: Record<string, BlockType> = {
  RUB: "rubric",
  AD: "addendum",
};

export function isLanguageCode(code: string): boolean {
  return LANGUAGE_TAG_CODES.includes(code.toUpperCase());
}

export function blockTypeForEnvCode(code: string): BlockType {
  const upper = code.toUpperCase();
  if (ENVELOPE_MAP[upper]) return ENVELOPE_MAP[upper];
  if (upper.startsWith("GL")) return "gloss";
  if (isLanguageCode(upper)) return "language_span";
  return "prose";
}

export function isKnownEnvironmentCode(code: string): boolean {
  const upper = code.toUpperCase();
  return upper === "RUB" || upper === "AD" || upper.startsWith("GL") || isLanguageCode(upper);
}

export function parseEnvironmentOpen(line: string): { code: string; rest: string } | null {
  const match = line.match(ENV_OPEN_RE);
  if (!match) return null;

  const code = match[1].toUpperCase();
  if (!isKnownEnvironmentCode(code)) return null;

  return {
    code,
    rest: line.substring(match[0].length),
  };
}

export function buildEnvOpenPattern(code: string): RegExp {
  return new RegExp(`^\\{${escapeRegex(code)}(?:\\.|\\s+)\\s*`, "i");
}
