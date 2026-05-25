import { tokenizeString } from "./hsmsLexer";
import type { Token } from "../constants/manuscript";

const RE_CLEAN_WHITESPACE = /\s+/g;

export type PaleographicDisplayOptions = {
  showExpanded?: boolean;
  useNormalizedDiacritics?: boolean;
  suppressOtioseMarks?: boolean;
};

const SKIP_DISPLAY_TYPES = new Set<Token["type"]>([
  "env_open",
  "env_close",
  "drop_initial",
  "figure_anchor",
]);

/**
 * Flatten HSMS paleographic markup into reader-facing plain text
 * (diacritic normalization, optional expansion letters, no raw `<…>` brackets).
 */
export function formatPaleographicPlainText(
  text: string,
  options: PaleographicDisplayOptions = {},
): string {
  const showExpanded = options.showExpanded ?? true;
  const useNormalized = options.useNormalizedDiacritics ?? true;
  const suppressOtiose = options.suppressOtioseMarks ?? true;

  const tokens = tokenizeString(text);
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (suppressOtiose && token.type === "otiose_mark") continue;

    if (token.type === "expansion") {
      if (showExpanded) out.push(token.value);
      continue;
    }

    if (SKIP_DISPLAY_TYPES.has(token.type)) continue;

    if (token.type === "text") {
      out.push(useNormalized && token.normalized ? token.normalized : token.value);
      continue;
    }

    out.push(token.value);
  }

  return out.join("").replace(RE_CLEAN_WHITESPACE, " ").trim();
}

/** Normalize diacritic clusters and expansions for display metadata (RMK titles, imprint, etc.). */
export function normalizeMetadataPlainText(text: string): string {
  return formatPaleographicPlainText(text, {
    showExpanded: true,
    useNormalizedDiacritics: true,
    suppressOtioseMarks: true,
  });
}

/** Running header ({HD. …}) display — respects reader expansion toggle. */
export function formatRunningHeaderText(
  raw: string,
  options: PaleographicDisplayOptions = {},
): string {
  const stripped = raw
    .replace(/\{HD\d*\.\s*/gi, "")
    .replace(/\}/g, "")
    .replace(/\s*\+$/g, "")
    .trim();

  return formatPaleographicPlainText(stripped, {
    showExpanded: options.showExpanded ?? true,
    useNormalizedDiacritics: options.useNormalizedDiacritics ?? true,
    suppressOtioseMarks: options.suppressOtioseMarks ?? true,
  });
}
