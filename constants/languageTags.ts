/**
 * HSMS language mnemonic codes: the legacy TranscriptionParser.DefaultLanguageTags plus codes
 * confirmed in the OSTA corpus (ARG, CAL, GRK — see SPEC-I18N §8). English labels are for
 * logs and CLI output; the UI uses `t("hsms.lang.<CODE>")`.
 */
export const LANGUAGE_TAG_LABELS: Record<string, string> = {
  ARB: "Arabic",
  /** Aragonese — OSTA TEXT.GRM: "los aragoneses {ARG. mosen}". */
  ARG: "Aragonese",
  BAS: "Basque",
  /** Chaldean (Aramaic) — OSTA TEXT.PER: "puso en caldeo {CAL. …}". */
  CAL: "Chaldean",
  CAT: "Catalan",
  ENG: "English",
  SPN: "Spanish",
  FRN: "French",
  GAL: "Galician",
  GER: "German",
  /** Greek — 488 spans across the OSTA corpus. */
  GRK: "Greek",
  HEB: "Hebrew",
  ITL: "Italian",
  LAT: "Latin",
  PRT: "Portuguese",
  PRV: "Provençal",
};

export const LANGUAGE_TAG_CODES = Object.keys(LANGUAGE_TAG_LABELS);

/** BCP 47 tag for each HSMS language code (screen readers, collation, stopword selection). */
export const LANGUAGE_TAG_BCP47: Record<string, string> = {
  ARB: "ar",
  ARG: "an",
  BAS: "eu",
  CAL: "arc",
  CAT: "ca",
  ENG: "en",
  SPN: "es",
  FRN: "fr",
  GAL: "gl",
  GER: "de",
  GRK: "grc",
  HEB: "he",
  ITL: "it",
  LAT: "la",
  PRT: "pt",
  PRV: "pro",
};
