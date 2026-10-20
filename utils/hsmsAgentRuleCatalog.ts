/**
 * Machine-readable HSMS rules derived from `hsmsLinter.ts` + `prooferIncidents.ts`.
 * Consumed by `scripts/export-agent-memory-rules.ts` → `assets/agent-memory/`.
 *
 * These are guidance for the Azure Foundry agent (prompt / memory).
 * Deterministic enforcement stays on the client (`lintHsmsTranscription`).
 *
 * Issue-code unions below mirror `ValidationError["code"]` values emitted by the
 * client linter / proofer so catalog drift fails at compile time.
 */

import type { ValidationError } from "@/constants/manuscript";

export type AgentRuleSeverity = "error" | "warning" | "info";
export type AgentRuleSource = "linter" | "proofer" | "paleography";
export type AgentRuleKind = "technical" | "editorial" | "structural" | "paleographic";

/** Codes emitted by `lintHsmsTranscription` + `parseValidation` (stable ValidationError.code). */
export type HsmsLinterIssueCode =
  | "EMPTY_FILE"
  | "STRAY_PAGE_METADATA"
  | "MALFORMED_HEADER_BLOCK"
  | "INITIAL_GUTTER_LEAK"
  | "MALFORMED_RECONSTRUCTION"
  | "EMPTY_BRACKET_TOKEN"
  | "FOLIO_LEAK"
  | "MALFORMED_DIACRITIC"
  | "EMPTY_COLUMN_ENVELOPE"
  | "TEXT_OUTSIDE_COLUMN"
  | "COMPILER_CRASH"
  | "UNCLOSED_ENV"
  | "UNCLOSED_EXPANSION"
  | "UNCLOSED_DELETION"
  | "UNCLOSED_INSERTION"
  | "STRAY_CLOSING_BRACE"
  | "IMPLICIT_CONTINUATION";

/** Codes emitted by `scanProoferLineIncidents` / `scanProoferDocumentIncidents`. */
export type HsmsProoferIssueCode =
  | "COMBINING_DIACRITIC"
  | "UNCONVERTED_HTR_MARKER"
  | "INVALID_AD_GL_FORMAT"
  | "INVISIBLE_CHAR"
  | "EDGE_SPACE"
  | "CONSECUTIVE_SPACES"
  | "LINE_TOO_LONG"
  | "ELLIPSIS_OUTSIDE_BRACKETS"
  | "BRACE_ADJACENT"
  | "HYPHEN_BEFORE_BRACE"
  | "TAG_LOWERCASE"
  | "ILLEGIBLE_RUN"
  | "CALDERON_SPACING"
  | "CALDERON_DOUBLE"
  | "ANGLE_DELIMITER"
  | "ANGLE_UNCLOSED"
  | "INSERT_DEL_SPACE"
  | "HAND_MARKER_SPACE"
  | "SUBSTITUTION_GAP"
  | "EMPTY_DELETION"
  | "UNBALANCED_BRACKET"
  | "UNBALANCED_PAREN"
  | "CW_SG_LINE"
  | "RMK_UNCLOSED"
  | "RMK_PERIOD"
  | "RMK_DELIMITER"
  | "AD_GL_HAND"
  | "EQUALS_VECTOR"
  | "UNKNOWN_TAG"
  | "BLANK_LINE_RUN"
  | "CONTINUATION_UNRESOLVED"
  | "FILENAME_SIGLA";

/** Paleographic memory ids (not always emitted as ValidationError.code). */
export type HsmsPaleographicRuleId =
  | "FOLIATION_MARKER"
  | "COLUMN_ENVELOPE"
  | "DROP_CAP_SINGLE_SPACE"
  | "ABBREV_VS_SUPERSCRIPT"
  | "I_VS_J"
  | "U_VS_V"
  | "TILDE_NASAL"
  | "WRAP_BACK_PERCENT2"
  | "GLOSS_BRACKETS"
  | "LACUNA_FORMS";

/** Union of every ValidationError.code the client may emit from linter + proofer. */
export type HsmsValidationIssueCode = HsmsLinterIssueCode | HsmsProoferIssueCode;

/** Narrow ValidationError.code to known HSMS issue ids when present. */
export type HsmsValidationError = ValidationError & {
  code?: HsmsValidationIssueCode | string;
};

export type HsmsAgentRule = {
  id: string;
  source: AgentRuleSource;
  severity: AgentRuleSeverity;
  kind: AgentRuleKind;
  /** Short label for memory indexes. */
  title: string;
  /** What the agent should do / avoid when drafting HSMS. */
  guidance: string;
  exampleBad?: string;
  exampleGood?: string;
};

type LinterAgentRule = HsmsAgentRule & { id: HsmsLinterIssueCode; source: "linter" };
type ProoferAgentRule = HsmsAgentRule & { id: HsmsProoferIssueCode; source: "proofer" };
type PaleographicAgentRule = HsmsAgentRule & {
  id: HsmsPaleographicRuleId;
  source: "paleography";
};

/** Compile-time exhaustiveness: every linter/proofer code must appear in the catalog. */
type AssertCovered<Code extends string, Rules extends readonly { id: string }[]> = Exclude<
  Code,
  Rules[number]["id"]
> extends never
  ? true
  : Exclude<Code, Rules[number]["id"]>;

/** Structural / paleographic invariants for agent memory (not a runtime check id). */
export const PALEOGRAPHIC_AGENT_RULES = [
  {
    id: "FOLIATION_MARKER",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "Foliation markers",
    guidance: "Mark each leaf top with [fol. Nr] / [fol. Nv]. Never invent folios not visible in the scan.",
    exampleGood: "[fol. 1r]",
  },
  {
    id: "COLUMN_ENVELOPE",
    source: "paleography",
    severity: "info",
    kind: "structural",
    title: "Column envelopes",
    guidance:
      "Enclose column text in {CB1. …} or {CB2. …}. All nested environments must close inside the same column block.",
    exampleGood: "{CB1.\ntext\n}",
  },
  {
    id: "DROP_CAP_SINGLE_SPACE",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "Drop-cap gutter spacing",
    guidance: "After {INn.} use exactly one ASCII space before the following text.",
    exampleBad: "{IN3.}  SPhera",
    exampleGood: "{IN3.} SPhera",
  },
  {
    id: "ABBREV_VS_SUPERSCRIPT",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "Expansions vs superscripts",
    guidance:
      "Expanded abbreviations use <…>; raised graphs use <<…>>. Both must be same-line, non-empty, no internal spaces.",
    exampleGood: "q<ue> · q<u><<i>>",
  },
  {
    id: "I_VS_J",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "i vs j",
    guidance: "Use i for non-descending strokes; j when the stroke descends below the baseline.",
  },
  {
    id: "U_VS_V",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "u vs v",
    guidance: "Preserve scribal u/v as written; do not modernize orthography.",
  },
  {
    id: "TILDE_NASAL",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "Tildes and nasals",
    guidance:
      "Nasal tildes expand as <n>/<m>; use n~ for palatal ñ when the manuscript uses a tilde.",
    exampleGood: "co<m>pan~a",
  },
  {
    id: "WRAP_BACK_PERCENT2",
    source: "paleography",
    severity: "info",
    kind: "paleographic",
    title: "Wrap-back %2",
    guidance:
      "Use %2 when line-end text wraps back to the right margin of the preceding line; space calderones correctly.",
  },
  {
    id: "GLOSS_BRACKETS",
    source: "paleography",
    severity: "info",
    kind: "structural",
    title: "Marginal glosses",
    guidance: "Right/left glosses use {GLR. […]} / {GLL. […]} with gloss text in brackets when required.",
  },
  {
    id: "LACUNA_FORMS",
    source: "paleography",
    severity: "info",
    kind: "editorial",
    title: "Lacunae and illegibility",
    guidance:
      "Use [*text], [^text], (^text), mechanical [ ], and [??]/[???] — never bare [] or four+ question marks.",
  },
] as const satisfies readonly PaleographicAgentRule[];

/** Codes emitted by `runPaleographicContextChecks` / `lintHsmsTranscription` core. */
export const LINTER_AGENT_RULES = [
  {
    id: "EMPTY_FILE",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Empty transcription",
    guidance: "Never return an empty string; always emit at least a folio marker and column block when a page is visible.",
  },
  {
    id: "STRAY_PAGE_METADATA",
    source: "linter",
    severity: "warning",
    kind: "structural",
    title: "Catchword/signature near folio top",
    guidance:
      "Do not place {CW.} or {SG.} in the first few lines after [fol. …]. Put catchwords/signatures at the foot of the leaf.",
    exampleBad: "[fol. 1r]\n{CW. mundo}",
    exampleGood: "…column text…\n{CW. mundo}",
  },
  {
    id: "MALFORMED_HEADER_BLOCK",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Nested braces in running header",
    guidance: "Running headers {HD.} / {HD1.} / {HD2.} must contain flat text only — no nested structural braces.",
  },
  {
    id: "INITIAL_GUTTER_LEAK",
    source: "linter",
    severity: "warning",
    kind: "paleographic",
    title: "Multiple spaces after drop cap",
    guidance: "Use exactly one space after {INn.}; extra spaces disturb facsimile gutter metrics.",
    exampleBad: "{IN4.}  AO muyto",
    exampleGood: "{IN4.} AO muyto",
  },
  {
    id: "MALFORMED_RECONSTRUCTION",
    source: "linter",
    severity: "warning",
    kind: "editorial",
    title: "Malformed [*text] reconstruction",
    guidance: "Editorial reconstructions must be exactly [*text] with no stray asterisks inside other brackets.",
  },
  {
    id: "EMPTY_BRACKET_TOKEN",
    source: "linter",
    severity: "warning",
    kind: "editorial",
    title: "Bare empty brackets",
    guidance: "Mechanical lacunae are [ ] (interior space), never bare [].",
    exampleBad: "a[]que",
    exampleGood: "a[ ]que",
  },
  {
    id: "FOLIO_LEAK",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Folio inside open environment",
    guidance: "Close all open brace environments before emitting the next [fol. …] marker.",
  },
  {
    id: "MALFORMED_DIACRITIC",
    source: "linter",
    severity: "warning",
    kind: "technical",
    title: "Stacked diacritic markers",
    guidance: "Avoid nested/stacked @/'/~ diacritic clusters; prefer clear HSMS ASCII notation.",
  },
  {
    id: "COMPILER_CRASH",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Unparseable structural line",
    guidance: "Keep brace tags well-formed so the client structural tokenizer never fails.",
  },
  {
    id: "EMPTY_COLUMN_ENVELOPE",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Empty column tag",
    guidance: "Never emit a same-line empty `{CBn.}` — open `{CBn.` on its own line, put text inside, close with `}`.",
    exampleBad: "{CB1.}",
    exampleGood: "{CB1.\ntext\n}",
  },
  {
    id: "TEXT_OUTSIDE_COLUMN",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Body text outside column",
    guidance: "After an empty `{CBn.}` mistake, wrap following body text in a proper multiline column envelope.",
  },
  {
    id: "UNCLOSED_ENV",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Unclosed environments at EOF",
    guidance: "Every open {TAG. must have a matching } before the end of the page / document.",
  },
  {
    id: "UNCLOSED_EXPANSION",
    source: "linter",
    severity: "error",
    kind: "editorial",
    title: "Unclosed abbreviation expansion",
    guidance: "Close every <…> abbreviation expansion on the same physical line.",
  },
  {
    id: "UNCLOSED_DELETION",
    source: "linter",
    severity: "error",
    kind: "editorial",
    title: "Unclosed deletion",
    guidance: "Close every (… deletion marker on the same physical line.",
  },
  {
    id: "UNCLOSED_INSERTION",
    source: "linter",
    severity: "error",
    kind: "editorial",
    title: "Unclosed insertion",
    guidance: "Close every [^… insertion marker on the same physical line.",
  },
  {
    id: "STRAY_CLOSING_BRACE",
    source: "linter",
    severity: "error",
    kind: "structural",
    title: "Stray closing brace",
    guidance: "Do not emit } without a matching open environment on the stack.",
  },
  {
    id: "IMPLICIT_CONTINUATION",
    source: "linter",
    severity: "warning",
    kind: "structural",
    title: "Implicit continuation without +",
    guidance: "When an environment continues across lines, end the prior line with + (or close with }).",
  },
] as const satisfies readonly LinterAgentRule[];

/** Codes from `scanProoferLineIncidents` / `scanProoferDocumentIncidents`. */
export const PROOFER_AGENT_RULES = [
  {
    id: "COMBINING_DIACRITIC",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Combining Unicode diacritics",
    guidance: "Prefer precomposed characters or HSMS ASCII diacritic notation over combining marks (e.g. c', n~).",
  },
  {
    id: "UNCONVERTED_HTR_MARKER",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Provisional HTR markers",
    guidance:
      "Replace Transkribus fullwidth ＜＞ / ⊂⊃ with <…> and grave ` superscript marks with <<…>> (or run convert_htr_to_hsms).",
    exampleBad: "q＜ue＞ / a`",
    exampleGood: "q<ue> / <<a>>",
  },
  {
    id: "INVALID_AD_GL_FORMAT",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "AD/GL payload format",
    guidance: "{AD.} / {GL.} with text must use a space then [^…], e.g. {AD. [^added]}.",
    exampleBad: "{AD. texto}",
    exampleGood: "{AD. [^texto]}",
  },
  {
    id: "INVISIBLE_CHAR",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Invisible whitespace",
    guidance: "Do not emit NBSP, TAB, or ZWSP — use ordinary ASCII spaces only.",
  },
  {
    id: "EDGE_SPACE",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Leading/trailing spaces",
    guidance: "Do not begin or end a physical line with an ASCII space.",
  },
  {
    id: "CONSECUTIVE_SPACES",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Consecutive spaces",
    guidance: "Avoid two or more consecutive ASCII spaces on the same line (except the single space after {INn.}).",
  },
  {
    id: "LINE_TOO_LONG",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Overlong line",
    guidance: "Keep lines under ~150 characters; break at natural word boundaries.",
  },
  {
    id: "ELLIPSIS_OUTSIDE_BRACKETS",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Ellipsis outside brackets",
    guidance: "Ellipsis ... may appear only inside brackets [...].",
  },
  {
    id: "BRACE_ADJACENT",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Adjacent brace tags",
    guidance: "When } and { meet on the same line, put an intervening ASCII space.",
  },
  {
    id: "HYPHEN_BEFORE_BRACE",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Hyphen before closing brace",
    guidance: "Do not place a hyphen immediately before }.",
  },
  {
    id: "TAG_LOWERCASE",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Lowercase HSMS tags",
    guidance: "Write structural tags in uppercase ({RUB. not {rub.).",
  },
  {
    id: "ILLEGIBLE_RUN",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Too many question marks",
    guidance: "Illegibility is ?? or ??? only — never four or more consecutive ?.",
  },
  {
    id: "CALDERON_SPACING",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Calderón spacing",
    guidance: "Calderón marks (%, %2, %3) need a space before and after except at line edges.",
  },
  {
    id: "CALDERON_DOUBLE",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Double calderón",
    guidance: "Avoid two consecutive calderones unless clearly intentional in the source.",
  },
  {
    id: "ANGLE_DELIMITER",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Invalid <…> / <<…>>",
    guidance: "Abbreviation/superscript delimiters must be non-empty, same-line, without internal spaces.",
  },
  {
    id: "ANGLE_UNCLOSED",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Unclosed angle delimiters",
    guidance: "<…> and <<…>> must open and close on the same physical line.",
  },
  {
    id: "INSERT_DEL_SPACE",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Space after insert/delete openers",
    guidance: "After [^, (^, or [* the text must follow immediately with no space.",
  },
  {
    id: "HAND_MARKER_SPACE",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Hand marker spacing",
    guidance: "Non-original hand markers use [^2#text] with no space between digit and #.",
  },
  {
    id: "SUBSTITUTION_GAP",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Deletion+insertion gap",
    guidance: "Substitutions (x)[y] must not have a space between ) and [.",
  },
  {
    id: "EMPTY_DELETION",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Empty deletion",
    guidance: "Empty parentheses for a deleted space should be ( ).",
  },
  {
    id: "UNBALANCED_BRACKET",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Unbalanced brackets on a line",
    guidance: "Balance [ and ] on each physical line whenever possible.",
  },
  {
    id: "UNBALANCED_PAREN",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Unbalanced parentheses on a line",
    guidance: "Balance ( and ) on each physical line whenever possible.",
  },
  {
    id: "CW_SG_LINE",
    source: "proofer",
    severity: "warning",
    kind: "structural",
    title: "CW/SG not same-line closed",
    guidance: "{CW. …} and {SG. …} must include text and close with } on the same line.",
  },
  {
    id: "RMK_UNCLOSED",
    source: "proofer",
    severity: "error",
    kind: "structural",
    title: "Unclosed RMK",
    guidance: "{RMK: must close with } on the same physical line.",
  },
  {
    id: "RMK_PERIOD",
    source: "proofer",
    severity: "warning",
    kind: "structural",
    title: "RMK missing final period",
    guidance: "{RMK: should end with a period immediately before }.",
  },
  {
    id: "RMK_DELIMITER",
    source: "proofer",
    severity: "warning",
    kind: "structural",
    title: "RMK delimiter",
    guidance: "{RMK must use : as its delimiter.",
  },
  {
    id: "AD_GL_HAND",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "AD/GL hand insertions",
    guidance: "{AD. / {GL. hand insertions should use [^… immediately after the tag text.",
  },
  {
    id: "EQUALS_VECTOR",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Equals vector outside MIN/DIAG",
    guidance: "= as a vector marker is only allowed inside {MIN. / {DIAG. tags.",
  },
  {
    id: "UNKNOWN_TAG",
    source: "proofer",
    severity: "warning",
    kind: "structural",
    title: "Unrecognized HSMS tag",
    guidance: "Use only catalogued mnemonics (CB, HD, RUB, GL, CW, SG, IN, LAT, …).",
  },
  {
    id: "BLANK_LINE_RUN",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Multiple blank lines",
    guidance: "Avoid more than one consecutive blank line between blocks.",
  },
  {
    id: "CONTINUATION_UNRESOLVED",
    source: "proofer",
    severity: "warning",
    kind: "editorial",
    title: "Unresolved +} continuation",
    guidance: "If a tag ends with +}, a later matching tag must resume the text.",
  },
  {
    id: "FILENAME_SIGLA",
    source: "proofer",
    severity: "warning",
    kind: "technical",
    title: "Witness filename sigla",
    guidance: "Witness filenames should be TEXT.SIGLA.txt (client-side naming; agent usually ignores).",
  },
] as const satisfies readonly ProoferAgentRule[];

const _linterCoverage: AssertCovered<HsmsLinterIssueCode, typeof LINTER_AGENT_RULES> = true;
const _prooferCoverage: AssertCovered<HsmsProoferIssueCode, typeof PROOFER_AGENT_RULES> = true;
void _linterCoverage;
void _prooferCoverage;

export function getAllHsmsAgentRules(): HsmsAgentRule[] {
  return [
    ...PALEOGRAPHIC_AGENT_RULES,
    ...LINTER_AGENT_RULES,
    ...PROOFER_AGENT_RULES,
  ] as HsmsAgentRule[];
}

export type AgentMemoryExportPayload = {
  version: 1;
  generatedAt: string;
  description: string;
  ruleCount: number;
  rules: HsmsAgentRule[];
};

export function buildAgentMemoryPayload(now = new Date()): AgentMemoryExportPayload {
  const rules = getAllHsmsAgentRules();
  return {
    version: 1,
    generatedAt: now.toISOString(),
    description:
      "HSMS paleography + Proofer/linter rules for Azure Foundry agent memory. Deterministic enforcement remains on-device via lintHsmsTranscription.",
    ruleCount: rules.length,
    rules,
  };
}

/** Plain-text form suitable for Foundry file_search / agent memory upload. */
export function formatAgentMemoryText(payload: AgentMemoryExportPayload): string {
  const lines: string[] = [
    "# HSMS Agent Memory Rules",
    `# Generated: ${payload.generatedAt}`,
    `# Rules: ${payload.ruleCount}`,
    `# Source: utils/hsmsAgentRuleCatalog.ts — regenerate with npm run export:agent-memory`,
    "",
    payload.description,
    "",
    "## Client vs agent boundary",
    "- AGENT: visual decipherment, paleographic resolution, draft HSMS ASCII following these rules.",
    "- CLIENT: hsmsLexer tokenization, spatialAst layout, lintHsmsTranscription / Proofer audit (final gate).",
    "",
  ];

  const bySource: AgentRuleSource[] = ["paleography", "linter", "proofer"];
  for (const source of bySource) {
    const subset = payload.rules.filter((r) => r.source === source);
    if (!subset.length) continue;
    lines.push(`## ${source.toUpperCase()} (${subset.length})`);
    lines.push("");
    for (const rule of subset) {
      lines.push(`### [${rule.id}] (${rule.severity} · ${rule.kind}) — ${rule.title}`);
      lines.push(rule.guidance);
      if (rule.exampleBad) lines.push(`Avoid: \`${rule.exampleBad}\``);
      if (rule.exampleGood) lines.push(`Prefer: \`${rule.exampleGood}\``);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
