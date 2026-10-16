/**
 * HSMS Proofer–style editorial/technical checks ported from gu/manuals/HSMS-proofer.
 * Philosophy: flag only — "Proofer señala; el editor decide."
 */
import type { ValidationError } from "@/constants/manuscript";

export type ProoferIncidentKind = "technical" | "editorial" | "structural";

export type ProoferIncident = ValidationError & {
  kind: ProoferIncidentKind;
  columnIndex?: number;
  code: string;
};

const RE_COMBINING =
  /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\ufe20-\ufe2f]/;
const RE_INVISIBLE = /[\u00a0\t\u200b]/;
const RE_CONSEC_SPACES = / {2,}/;
const RE_BRACE_ADJACENT = /\}\s*\{/;
const RE_HYPHEN_BEFORE_CLOSE = /-\}/;
const RE_TAG_LOWER = /\{[a-z]{2,}[\d.:]/;
const RE_ILLEGIBLE_RUN = /\?{4,}/;
const RE_HAND_SPACE = /\[\^\d+\s+#|\(\^\d+\s+#|\[\*\^\d+\s+#/;
const RE_SUBST_GAP = /\)\s+\[/;
const RE_EMPTY_DEL = /\(\s*\)/;
const RE_CW_SG = /^\{(?:CW|SG)\.\s*([^}]*)\}?\s*$/i;
const RE_AD_GL_FOLLOW = /^\{(?:AD|GL)\.(.*)$/i;
const VECTOR_OK = /^\{(?:MIN|DIAG)\d*\./i;

const KNOWN_STRUCTURAL = new Set([
  "CB",
  "CB1",
  "CB2",
  "CB3",
  "CB4",
  "HD",
  "HD1",
  "HD2",
  "RUB",
  "GL",
  "AD",
  "CW",
  "SG",
  "RMK",
  "IN",
  "IN1",
  "IN2",
  "IN3",
  "IN4",
  "IN5",
  "IN6",
  "IN7",
  "IN8",
  "BLNK",
  "MIN",
  "DIAG",
  "ILL",
  "SYMB",
  "LAT",
  "ENG",
  "FRA",
  "POR",
  "CAT",
  "GAL",
  "ARA",
  "ARG",
  "HEB",
  "GRK",
  "ITA",
  "PRO",
  "ALM",
  "VAS",
  "CAL",
]);

function push(
  out: ProoferIncident[],
  severity: ValidationError["severity"],
  kind: ProoferIncidentKind,
  code: string,
  message: string,
  lineIndex: number,
  snippet: string,
  columnIndex?: number,
): void {
  out.push({
    severity,
    kind,
    code,
    message: `[${code}] ${message}`,
    lineIndex,
    rawSnippet: snippet.slice(0, 120),
    columnIndex,
  });
}

function countChar(line: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ch) n++;
  }
  return n;
}

/** Line-local proofer checks (technical + editorial). */
export function scanProoferLineIncidents(
  line: string,
  lineIndex: number,
): ProoferIncident[] {
  const issues: ProoferIncident[] = [];
  if (!line) return issues;

  if (RE_COMBINING.test(line)) {
    push(
      issues,
      "warning",
      "technical",
      "COMBINING_DIACRITIC",
      "Combining Unicode diacritic detected — use a precomposed character or HSMS ASCII notation.",
      lineIndex,
      line,
      line.search(RE_COMBINING),
    );
  }

  const inv = line.search(RE_INVISIBLE);
  if (inv >= 0) {
    push(
      issues,
      "warning",
      "technical",
      "INVISIBLE_CHAR",
      "Line contains NBSP, TAB, or ZWSP — replace with ordinary ASCII space or remove.",
      lineIndex,
      line,
      inv,
    );
  }

  if (/^ /.test(line) || / $/.test(line)) {
    push(
      issues,
      "warning",
      "technical",
      "EDGE_SPACE",
      "Line begins or ends with an ASCII space.",
      lineIndex,
      line,
      /^ /.test(line) ? 0 : line.length - 1,
    );
  }

  const consec = line.search(RE_CONSEC_SPACES);
  if (consec >= 0) {
    push(
      issues,
      "warning",
      "technical",
      "CONSECUTIVE_SPACES",
      "Two or more consecutive ASCII spaces on the same line.",
      lineIndex,
      line,
      consec,
    );
  }

  if (line.length > 150) {
    push(
      issues,
      "warning",
      "technical",
      "LINE_TOO_LONG",
      `Line has ${line.length} characters (recommended max 150) — check for missing breaks or OCR paste.`,
      lineIndex,
      line.slice(0, 80),
    );
  }

  // Ellipsis outside brackets
  const ellipsisRe = /\.\.\./g;
  let ellipsisMatch: RegExpExecArray | null;
  while ((ellipsisMatch = ellipsisRe.exec(line)) !== null) {
    const at = ellipsisMatch.index;
    const before = line.lastIndexOf("[", at);
    const after = line.indexOf("]", at);
    if (before < 0 || after < 0 || before > at || after < at) {
      push(
        issues,
        "warning",
        "editorial",
        "ELLIPSIS_OUTSIDE_BRACKETS",
        "Ellipsis `...` should only appear inside brackets `[...]`.",
        lineIndex,
        line,
        at,
      );
      break;
    }
  }

  if (RE_BRACE_ADJACENT.test(line) && !/\}\s+\{/.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "BRACE_ADJACENT",
      "Closing `}` and opening `{` on the same line need an intervening ASCII space.",
      lineIndex,
      line,
    );
  }

  if (RE_HYPHEN_BEFORE_CLOSE.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "HYPHEN_BEFORE_BRACE",
      "Hyphen immediately before `}` is not allowed.",
      lineIndex,
      line,
    );
  }

  if (RE_TAG_LOWER.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "TAG_LOWERCASE",
      "HSMS tags should be written in uppercase (e.g. `{RUB.` not `{rub.`).",
      lineIndex,
      line,
    );
  }

  if (RE_ILLEGIBLE_RUN.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "ILLEGIBLE_RUN",
      "Illegibility marks are `??` or `???` — four or more `?` is invalid.",
      lineIndex,
      line,
    );
  }

  // Calderón spacing
  const calRe = /(?:%3|%2|%|⁋3|⁋2|⁋)/g;
  let cm: RegExpExecArray | null;
  while ((cm = calRe.exec(line)) !== null) {
    const start = cm.index;
    const end = start + cm[0].length;
    const beforeOk = start === 0 || line[start - 1] === " ";
    const afterOk = end >= line.length || line[end] === " ";
    if (!beforeOk || !afterOk) {
      push(
        issues,
        "warning",
        "editorial",
        "CALDERON_SPACING",
        "Calderón marks need a space before and after (except at line edges).",
        lineIndex,
        line,
        start,
      );
      break;
    }
  }
  if (/(?:%3|%2|%|⁋3|⁋2|⁋)\s*(?:%3|%2|%|⁋3|⁋2|⁋)/.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "CALDERON_DOUBLE",
      "Two consecutive calderones — review whether intentional or a compositor duplication.",
      lineIndex,
      line,
    );
  }

  // Angle delimiters same-line
  const angles = line.match(/<<[^>\n]*>>|<[^>\n]*>/g) ?? [];
  for (const a of angles) {
    const inner = a.startsWith("<<") ? a.slice(2, -2) : a.slice(1, -1);
    if (!inner || /\s/.test(inner)) {
      push(
        issues,
        "warning",
        "editorial",
        "ANGLE_DELIMITER",
        "Abbreviation `<…>` / superscript `<<…>>` must be non-empty, same-line, and without internal spaces.",
        lineIndex,
        a,
      );
      break;
    }
  }
  const strippedAngles = line.replace(/<<[^>\n]*>>/g, "").replace(/<[^>\n]*>/g, "");
  if (/[<>]/.test(strippedAngles)) {
    push(
      issues,
      "warning",
      "editorial",
      "ANGLE_UNCLOSED",
      "`<…>` / `<<…>>` must open and close on the same physical line.",
      lineIndex,
      line,
    );
  }

  if (/\[\^ /.test(line) || /\(\^ /.test(line) || /\[\*\s+/.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "INSERT_DEL_SPACE",
      "After `[^`, `(^`, or `[*` the text must follow immediately (no space).",
      lineIndex,
      line,
    );
  }

  if (RE_HAND_SPACE.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "HAND_MARKER_SPACE",
      "Non-original hand markers must be `[^2#text]` with no space between digit and `#`.",
      lineIndex,
      line,
    );
  }

  if (RE_SUBST_GAP.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "SUBSTITUTION_GAP",
      "Deletion+insertion substitutions `(x)[y]` must not have a space between `)` and `[`.",
      lineIndex,
      line,
    );
  }

  if (RE_EMPTY_DEL.test(line) && !/\( \)/.test(line)) {
    push(
      issues,
      "warning",
      "editorial",
      "EMPTY_DELETION",
      "Empty parentheses should be `( )` if the deleted material is a space.",
      lineIndex,
      line,
    );
  }

  // Brackets/parens should usually balance on one physical line (braces are multi-line OK).
  for (const [o, c, code] of [
    ["[", "]", "BRACKET"],
    ["(", ")", "PAREN"],
  ] as const) {
    const opens = countChar(line, o);
    const closes = countChar(line, c);
    if (opens !== closes) {
      push(
        issues,
        "warning",
        "technical",
        `UNBALANCED_${code}`,
        `Unbalanced ${o}${c} on this line (${opens} open / ${closes} close).`,
        lineIndex,
        line,
      );
    }
  }

  // CW / SG
  if (/^\{(?:CW|SG)\./i.test(line)) {
    if (!RE_CW_SG.test(line) || !line.includes("}")) {
      push(
        issues,
        "warning",
        "structural",
        "CW_SG_LINE",
        "`{CW.` / `{SG.` must include text and close with `}` on the same line.",
        lineIndex,
        line,
      );
    }
  }

  // RMK
  if (/^\{RMK/i.test(line)) {
    if (!line.includes("}")) {
      push(
        issues,
        "error",
        "structural",
        "RMK_UNCLOSED",
        "`{RMK:` must close with `}` on the same physical line.",
        lineIndex,
        line,
      );
    } else if (!/\.\s*\}/.test(line) && !/^\{RMK:\.\}/.test(line)) {
      push(
        issues,
        "warning",
        "structural",
        "RMK_PERIOD",
        "`{RMK:` should end with a period immediately before `}`.",
        lineIndex,
        line,
      );
    }
  }

  // AD/GL follow-on: if content present after tag, prefer [^ hand form when starting with caret
  const adGl = line.match(RE_AD_GL_FOLLOW);
  if (adGl) {
    const rest = adGl[1] ?? "";
    if (/^\s+\^/.test(rest) || /^\s+\[\s+\^/.test(rest)) {
      push(
        issues,
        "warning",
        "editorial",
        "AD_GL_HAND",
        "`{AD.` / `{GL.` hand insertions should use `[^…` immediately after the tag text.",
        lineIndex,
        line,
      );
    }
  }

  // = vector outside MIN/DIAG
  if (/=/.test(line) && line.includes("{") && !VECTOR_OK.test(line)) {
    const tagMatch = line.match(/\{[A-Z]+\d*\./);
    if (tagMatch && !/^\{(?:MIN|DIAG)/i.test(tagMatch[0])) {
      push(
        issues,
        "warning",
        "editorial",
        "EQUALS_VECTOR",
        "`=` as a vector marker is only allowed inside `{MIN.` / `{DIAG.` tags.",
        lineIndex,
        line,
      );
    }
  }

  // Unknown / delimiter structural tags (lightweight)
  const tagRe = /\{([A-Za-z]{2,}\d*)([.:])/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(line)) !== null) {
    const raw = tagMatch[1];
    const delim = tagMatch[2];
    const upper = raw.toUpperCase();
    const base = upper.replace(/\d+$/, "");
    if (
      !KNOWN_STRUCTURAL.has(upper) &&
      !KNOWN_STRUCTURAL.has(base) &&
      raw.length <= 4 &&
      !/^(IN|CB|HD|LAT|ENG|FRA|POR|CAT|ARA|HEB|GRK|ITA|PRO|ALM|VAS|GAL|ARG)/i.test(upper)
    ) {
      push(
        issues,
        "warning",
        "structural",
        "UNKNOWN_TAG",
        `Unrecognized HSMS tag start \`{${raw}${delim}\` — verify against the mnemonic catalog.`,
        lineIndex,
        line,
        tagMatch.index,
      );
    }
    if (upper.startsWith("RMK") && delim !== ":") {
      push(
        issues,
        "warning",
        "structural",
        "RMK_DELIMITER",
        "`{RMK` must use `:` as its delimiter.",
        lineIndex,
        line,
        tagMatch.index,
      );
    }
  }

  return issues;
}

/** Document-level technical checks (blank lines, filename). */
export function scanProoferDocumentIncidents(
  rawText: string,
  options?: { sourceFileName?: string },
): ProoferIncident[] {
  const issues: ProoferIncident[] = [];
  const lines = rawText.split(/\r?\n/);

  if (options?.sourceFileName) {
    const base = options.sourceFileName.replace(/^.*[/\\]/, "");
    if (/^TEXT\./i.test(base) && !/^TEXT\.[A-Z0-9]+\.txt$/.test(base)) {
      push(
        issues,
        "warning",
        "technical",
        "FILENAME_SIGLA",
        "Witness filenames should be `TEXT.SIGLA.txt` with an alphanumeric uppercase sigla.",
        0,
        base,
      );
    }
  }

  let blankRun = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      blankRun++;
      if (blankRun === 2) {
        push(
          issues,
          "warning",
          "technical",
          "BLANK_LINE_RUN",
          "More than one consecutive blank line.",
          i,
          "",
        );
      }
    } else {
      blankRun = 0;
    }
  }

  // Continuation +} without later resume (best-effort)
  const pending = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cont = line.match(/\{([A-Z]{2,}\d*)[.:][^}]*\+\}\s*$/);
    if (cont) {
      pending.set(cont[1], i);
    }
    const reopen = line.match(/\{([A-Z]{2,}\d*)[.:]/);
    if (reopen && pending.has(reopen[1]) && pending.get(reopen[1]) !== i) {
      pending.delete(reopen[1]);
    }
  }
  pending.forEach((lineIndex, tag) => {
    push(
      issues,
      "warning",
      "editorial",
      "CONTINUATION_UNRESOLVED",
      `Tag \`{${tag}.\` ends with \`+}\` but no later matching tag resumes the text.`,
      lineIndex,
      lines[lineIndex] ?? "",
    );
  });

  return issues;
}

export type ProoferReportRow = {
  line: number;
  column: number;
  type: ProoferIncidentKind;
  code: string;
  snippet: string;
  explanation: string;
};

/** Proofer-compatible table rows (1-based line/column). */
export function prooferIncidentsToRows(incidents: ProoferIncident[]): ProoferReportRow[] {
  return incidents.map((i) => ({
    line: i.lineIndex + 1,
    column: (i.columnIndex ?? 0) + 1,
    type: i.kind,
    code: i.code,
    snippet: i.rawSnippet,
    explanation: i.message.replace(/^\[[^\]]+\]\s*/, ""),
  }));
}

export function formatProoferTsv(rows: ProoferReportRow[]): string {
  const header = ["line", "column", "type", "code", "snippet", "explanation"].join("\t");
  const body = rows.map((r) =>
    [r.line, r.column, r.type, r.code, escapeTsv(r.snippet), escapeTsv(r.explanation)].join("\t"),
  );
  return [header, ...body].join("\n");
}

function escapeTsv(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

/**
 * Full proofer-style audit of raw HSMS text (line + document checks).
 * Does not replace the structural AST linter — complements it.
 */
export function auditHsmsProoferIncidents(
  rawText: string,
  options?: { sourceFileName?: string },
): ProoferIncident[] {
  const issues: ProoferIncident[] = [];
  issues.push(...scanProoferDocumentIncidents(rawText, options));
  const lines = rawText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/\s+$/, "");
    if (!trimmed.trim()) continue;
    issues.push(...scanProoferLineIncidents(trimmed, i));
  }
  return issues;
}

/** Strip kind/column for consumers that only accept ValidationError. */
export function prooferIncidentsAsValidationErrors(
  incidents: ProoferIncident[],
): ValidationError[] {
  return incidents.map(({ severity, message, lineIndex, rawSnippet, code }) => ({
    severity,
    message,
    lineIndex,
    rawSnippet,
    code,
  }));
}
