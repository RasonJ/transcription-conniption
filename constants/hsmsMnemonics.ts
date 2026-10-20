/**
 * Single registry of brace-bounded HSMS mnemonics (SPEC-VALIDATION VAL-10…12).
 * Completions, extension diagnostics, and `check:mnemonics` read this table.
 */

export interface MnemonicSpec {
  readonly code: string;
  readonly delimiter: "." | ":";
  readonly numbered?: "required" | "optional";
  readonly kind: "structure" | "insertion" | "figure" | "language" | "remark" | "heading" | "decoration";
  readonly placement?: "inside-cb" | "after-last-cb" | "after-folio-line" | "any";
  readonly manualSection?: string;
  readonly standard: boolean;
  /** Standard mnemonic this extension stands in for. */
  readonly extends?: string;
  readonly name: string;
}

const STRUCTURE: MnemonicSpec[] = [
  { code: "AD", delimiter: ".", kind: "insertion", placement: "inside-cb", manualSection: "3.239a", standard: true, name: "Addendum" },
  { code: "BLNK", delimiter: ".", kind: "structure", placement: "any", manualSection: "3.15", standard: true, name: "Blank" },
  { code: "CB", delimiter: ".", kind: "structure", numbered: "optional", placement: "any", manualSection: "3.1", standard: true, name: "Column" },
  { code: "CW", delimiter: ".", kind: "structure", placement: "after-last-cb", manualSection: "4.2", standard: true, name: "Catchword" },
  { code: "DIAG", delimiter: ".", kind: "figure", placement: "inside-cb", manualSection: "6.8", standard: true, name: "Diagram" },
  { code: "GL", delimiter: ".", kind: "insertion", placement: "inside-cb", manualSection: "3.239a", standard: true, name: "Gloss" },
  { code: "HD", delimiter: ".", kind: "heading", numbered: "optional", placement: "after-folio-line", manualSection: "2.1", standard: true, name: "Heading" },
  { code: "ILL", delimiter: ".", kind: "figure", placement: "inside-cb", manualSection: "6.8", standard: true, name: "Illustration" },
  { code: "IN", delimiter: ".", kind: "decoration", numbered: "required", placement: "inside-cb", manualSection: "3.8", standard: true, name: "Initial" },
  { code: "MIN", delimiter: ".", kind: "decoration", placement: "inside-cb", manualSection: "3.8", standard: true, name: "Minor initial" },
  { code: "RMK", delimiter: ":", kind: "remark", placement: "any", manualSection: "5.2", standard: true, name: "Remark" },
  { code: "RUB", delimiter: ".", kind: "insertion", placement: "inside-cb", manualSection: "3.4", standard: true, name: "Rubric" },
  { code: "SG", delimiter: ".", kind: "structure", placement: "after-last-cb", manualSection: "4.5", standard: true, name: "Signature" },
  { code: "SYMB", delimiter: ".", kind: "insertion", placement: "inside-cb", manualSection: "3.239", standard: true, name: "Symbol" },
];

/** Language mnemonics from the manual §3.236. Spanish is the default and has no code. */
const LANGUAGES: MnemonicSpec[] = (
  ["ARB", "ARG", "ARM", "BAS", "CAT", "ENG", "EXT", "FRN", "GAL", "GER", "GRK", "HEB", "ITL", "LAT", "PRT", "PRV"] as const
).map((code) => ({
  code,
  delimiter: "." as const,
  kind: "language" as const,
  placement: "inside-cb" as const,
  manualSection: "3.236",
  standard: true,
  name: code,
}));

/** Renderer-accepted extensions. Info diagnostic, not an unrecognized warning (VAL-12). */
const EXTENSIONS: MnemonicSpec[] = [
  { code: "GLR", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "GL", name: "Right-margin gloss" },
  { code: "GLL", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "GL", name: "Left-margin gloss" },
  { code: "GLB", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "GL", name: "Bottom gloss" },
  { code: "GLT", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "GL", name: "Top gloss" },
  { code: "ADR", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "AD", name: "Right addendum" },
  { code: "ADL", delimiter: ".", kind: "insertion", placement: "inside-cb", standard: false, extends: "AD", name: "Left addendum" },
];

export const HSMS_MNEMONICS: readonly MnemonicSpec[] = [...STRUCTURE, ...LANGUAGES, ...EXTENSIONS];

const BY_CODE = new Map(HSMS_MNEMONICS.map((spec) => [spec.code, spec]));

export function mnemonicByCode(code: string): MnemonicSpec | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function isRegisteredMnemonic(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}
