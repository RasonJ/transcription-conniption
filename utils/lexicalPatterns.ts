/** Shared HSMS lexical patterns — single source for lexer and validation. */

/** `{LAT.`, `{ LAT.`, `{Glosa.}` — optional space after `{`; dot or space after code (2–5 letters). */
export const ENV_OPEN_INLINE = /^\{\s*([A-Za-z]{2,5})(?:\.|\s+)/i;

export const KNOWN_ENVIRONMENT_CODES =
  /^(RUB|AD|GLR?|GLL|GLB|GLT|LAT|ENG|SPN|FRN|GER|HEB|ITL|PRT|PRV|ARB|BAS|CAT|GAL)$/;

/** Line ends with an unclosed `<expansion>` tag. */
export const UNCLOSED_EXPANSION_AT_EOL = /<[^>]*$/;

/** Line ends with unclosed parenthetical deletion. */
export const UNCLOSED_PAREN_DELETION_AT_EOL = /\([^)]*$/;

/** Line ends with unclosed bracket insertion (not mechanical lacuna `[ ]` or `[*…]`). */
export const UNCLOSED_BRACKET_INSERTION_AT_EOL = /\[(?!\s*\]|\s*\*)[^\]]*$/;
