import {
  convertHsmsToMufiGlyphs,
  MUFI_PALEOGRAPHIC_MAP,
} from "@/utils/mufiCharacterMap";

export interface MufiDisplaySettings {
  useMufiGraphemes?: boolean;
  /** When true, prefer PUA / precomposed MUFI chars; else decomposed Unicode. */
  usePuaFont?: boolean;
}

/**
 * Display-time grapheme formatting for a single token string.
 * Prefers `raw` (with `<…>` / `<<…>>`) when present so abbreviation patterns match.
 */
export function formatTokenDisplayGrapheme(
  tokenValue: string,
  settings: MufiDisplaySettings,
  raw?: string,
): string {
  if (!settings.useMufiGraphemes) return tokenValue;
  const source = raw && raw.length >= tokenValue.length ? raw : tokenValue;
  const converted = convertHsmsToMufiGlyphs(source, settings.usePuaFont ?? true);
  // If we converted from raw markup, strip leftover angle brackets for display
  // only when the whole raw mapped to a paleographic glyph entry.
  if (raw && MUFI_PALEOGRAPHIC_MAP[raw]) {
    return converted;
  }
  if (raw && converted !== raw) {
    return converted;
  }
  return convertHsmsToMufiGlyphs(tokenValue, settings.usePuaFont ?? true);
}
