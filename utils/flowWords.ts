/**
 * Word extraction over hyphen-stitched reading flows. Tier 0: used by the compiler for
 * word counts, so it must stay free of concordance and dictionary imports.
 */

const FLOW_CLEAN_RE = /\$[.;]/g;
const WORD_VALID_RE = /[A-Za-zÀ-ÿ0-9]/;
const FLOW_TOKEN_PATTERN = /[^\s]+/g;

/**
 * Words from a hyphen-stitched flow string. Splits on whitespace only so
 * margin hyphens joined in reconstructedFlow stay inside lemmas (e.g. adelantar).
 */
export function extractWordsFromFlow(flow: string): string[] {
  return flow
    .split(/\s+/)
    .map((w) => w.replace(FLOW_CLEAN_RE, "").trim())
    .filter((w) => w.length > 1 && WORD_VALID_RE.test(w));
}

/** Count indexable words in a stitched reading flow (stats alignment). */
export function countWordsInFlow(flow: string): number {
  if (!flow) return 0;
  let count = 0;
  FLOW_TOKEN_PATTERN.lastIndex = 0;
  while (FLOW_TOKEN_PATTERN.exec(flow) !== null) {
    count++;
  }
  FLOW_TOKEN_PATTERN.lastIndex = 0;
  return count;
}
