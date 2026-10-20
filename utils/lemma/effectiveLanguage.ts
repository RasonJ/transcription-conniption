/**
 * Per-token effective language (SPEC-CONCORDANCE-LANGUAGE LEX-2).
 * Stack: workspaceOverride → token.envLayers (innermost) → block.language → witness default.
 */
import type { ManuscriptBlock, Token } from "@/constants/manuscript";
import type { WitnessLanguage } from "@/utils/witnessLanguage";
import { isWitnessLanguage } from "@/utils/witnessLanguage";

/** Map HSMS mnemonics / aliases onto WitnessLanguage codes. */
export function mapMnemonicToWitnessLanguage(code: string): WitnessLanguage | null {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  if (upper === "LAT" || upper === "LA") return "LAT";
  if (upper === "POR" || upper === "PRT" || upper === "PT") return "PRT";
  if (upper === "SPA" || upper === "SPN" || upper === "ES" || upper === "CAS") return "SPN";
  if (upper === "GAL" || upper === "GL") return "GAL";
  if (upper === "CAT" || upper === "CA") return "CAT";
  if (isWitnessLanguage(upper)) return upper;
  return null;
}

export function resolveEffectiveTokenLanguage(
  token: Token,
  block: ManuscriptBlock,
  witnessLang: WitnessLanguage,
  overrideLang?: WitnessLanguage,
): WitnessLanguage {
  if (overrideLang) return overrideLang;

  // Innermost language span wins ({LAT. …} nested inside {PRT. …}).
  const layers = token.envLayers;
  if (layers && layers.length > 0) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.type === "language_span" && layer.code) {
        const mapped = mapMnemonicToWitnessLanguage(layer.code);
        if (mapped) return mapped;
      }
    }
  }

  if (block.language) {
    const mapped = mapMnemonicToWitnessLanguage(block.language);
    if (mapped) return mapped;
  }

  return witnessLang;
}
