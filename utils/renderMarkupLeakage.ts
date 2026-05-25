import type { ParsedManuscript, Token, ValidationError } from "@/constants/manuscript";
import { getPrintableBlocks } from "@/components/svgFacsimile/folioGroups";

export interface RenderLeakPattern {
  code: string;
  severity: ValidationError["severity"];
  regex: RegExp;
  describe: (match: string) => string;
}

/** Brace / folio leaks — scan raw HTML fragments and decoded visible text. */
export const RENDER_HTML_LEAK_PATTERNS: RenderLeakPattern[] = [
  {
    code: "RENDER_BRACE_MNEMONIC",
    severity: "error",
    regex: /\{(?!(?:RMK|CW|SG|HD|CB)\b)[A-Z]{2,5}(?:\.|:\s*)[^}]{0,200}\}/g,
    describe: (m) => `[RENDER_LEAK] Leftover HSMS brace mnemonic in rendered HTML: ${m}`,
  },
  {
    code: "RENDER_DROP_INITIAL",
    severity: "error",
    regex: /\{IN\d+\.\}/g,
    describe: (m) => `[RENDER_LEAK] Unprocessed drop-initial tag in rendered HTML: ${m}`,
  },
  {
    code: "RENDER_COLUMN_TAG",
    severity: "error",
    regex: /\{CB\d+\.\}/g,
    describe: (m) => `[RENDER_LEAK] Unprocessed column boundary tag in rendered HTML: ${m}`,
  },
  {
    code: "RENDER_FOLIO_MARKER",
    severity: "error",
    regex: /\[\s*fol(?:io)?\.?\s*(?:[^\]]{1,120})\]/gi,
    describe: (m) => `[RENDER_LEAK] Folio marker leaked into rendered body text: ${m}`,
  },
  {
    code: "RENDER_METADATA_TAG",
    severity: "error",
    regex: /\{RMK:\s*[^}]{0,200}\}/g,
    describe: (m) => `[RENDER_LEAK] Metadata block leaked into rendered body text: ${m}`,
  },
  {
    code: "RENDER_FIGURE_TAG",
    severity: "error",
    regex: /\{(?:ILL|MIN|DIAG|SYMB)\.[^}]{0,200}\}/gi,
    describe: (m) => `[RENDER_LEAK] Figure mnemonic leaked into rendered body text: ${m}`,
  },
];

/**
 * HSMS square-bracket syntax that must not appear literally in export
 * (lacunae should be spaces; reconstructions should not show `[*…]` source form).
 */
export const RENDER_BRACKET_SOURCE_PATTERNS: RenderLeakPattern[] = [
  {
    code: "RENDER_RAW_RECONSTRUCTION",
    severity: "error",
    regex: /\[\s*\*(?:[^\]]{1,240})\]/g,
    describe: (m) => `[RENDER_LEAK] Unprocessed reconstruction markup in rendered output: ${m}`,
  },
  {
    code: "RENDER_RAW_SCRIBAL_INSERT",
    severity: "error",
    regex: /\[\^(?:[^\]]{1,240})\]/g,
    describe: (m) => `[RENDER_LEAK] Unprocessed scribal insertion markup in rendered output: ${m}`,
  },
  {
    code: "RENDER_BRACKET_LACUNA",
    severity: "error",
    regex: /\[\s+\]/g,
    describe: (m) => `[RENDER_LEAK] Mechanical lacuna brackets visible (expected word space): ${m}`,
  },
  {
    code: "RENDER_EMPTY_BRACKETS",
    severity: "error",
    regex: /\[\]/g,
    describe: (m) => `[RENDER_LEAK] Empty bracket pair visible in rendered output: ${m}`,
  },
  {
    code: "RENDER_BRACKET_ILLEGIBLE",
    severity: "error",
    regex: /\[\s*\?{2,3}\s*\]/g,
    describe: (m) => `[RENDER_LEAK] Illegible bracket token visible (expected □□): ${m}`,
  },
];

/** Stray `[…]` in body text after editorial spans are stripped (lexer/render leaks). */
export const RENDER_STRAY_BRACKET_PATTERNS: RenderLeakPattern[] = [
  {
    code: "RENDER_BRACKET_CLUMP",
    severity: "warning",
    regex: /\[(?:[^\]]{12,240})\]/g,
    describe: (m) =>
      `[RENDER_LEAK] Long bracket run in rendered text (word clumping / unclosed editorial): ${m.slice(0, 48)}${m.length > 48 ? "…" : ""}`,
  },
  {
    code: "RENDER_STRAY_BRACKET",
    severity: "warning",
    regex: /\[[A-Za-z][A-Za-z0-9'~.]{0,8}\]/g,
    describe: (m) => `[RENDER_LEAK] Stray bracketed fragment in rendered text: ${m}`,
  },
  {
    code: "RENDER_LOOSE_BRACKET",
    severity: "warning",
    regex: /\[|\]/g,
    describe: (m) => `[RENDER_LEAK] Loose bracket character in rendered text: ${m}`,
  },
  {
    code: "RENDER_BRACKET_GLUE",
    severity: "warning",
    regex: /\][a-zA-Z]{2,}/g,
    describe: (m) => `[RENDER_LEAK] Bracket marker run into following text: ]${m.slice(1, 12)}…`,
  },
];

/** Token punctuation — visible transcription text only (avoids CSS `100%` false positives). */
export const RENDER_VISIBLE_LEAK_PATTERNS: RenderLeakPattern[] = [
  {
    code: "RENDER_CALDERON",
    severity: "warning",
    regex: /(?<![0-9])%[23]?(?![0-9A-Za-z])/g,
    describe: (m) => `[RENDER_LEAK] Calderón wrap marker visible in rendered text: ${m}`,
  },
  {
    code: "RENDER_EXPANSION_ANGLE",
    severity: "warning",
    regex: /<(?![\/!?\s])([A-Za-z][A-Za-z0-9'~@]*)>/g,
    describe: (m) => `[RENDER_LEAK] Unexpanded angle-bracket markup in rendered text: ${m}`,
  },
  {
    code: "RENDER_SUPERSCRIPT_MARK",
    severity: "warning",
    regex: /<<[^>]+>>/g,
    describe: (m) => `[RENDER_LEAK] Unprocessed superscript marker in rendered text: ${m}`,
  },
  {
    code: "RENDER_SCRIBAL_PUNCT",
    severity: "warning",
    regex: /\$[.;]/g,
    describe: (m) => `[RENDER_LEAK] Scribal punctuation mnemonic in rendered text: ${m}`,
  },
];

export const RENDER_LEAK_PATTERNS: RenderLeakPattern[] = [
  ...RENDER_HTML_LEAK_PATTERNS,
  ...RENDER_BRACKET_SOURCE_PATTERNS,
  ...RENDER_STRAY_BRACKET_PATTERNS,
  ...RENDER_VISIBLE_LEAK_PATTERNS,
];

const MAX_FINDINGS_PER_WITNESS = 80;
const MAX_BRACKET_INNER = 240;
const MAX_PATTERN_ITERATIONS = 200_000;
/** Skip per-token leakage walk on very large trees (HTML scan still runs). */
const MAX_TOKENS_FOR_TOKEN_SCAN = 25_000;

export interface RenderLeakScanOptions {
  /**
   * OSTA batch: skip mechanical lacuna `[ ]` checks and the per-token tree walk
   * (lacuna-heavy witnesses were stalling corpus runs).
   */
  skipLacunaChecks?: boolean;
}

function bracketSourcePatternsForScan(options?: RenderLeakScanOptions): RenderLeakPattern[] {
  if (!options?.skipLacunaChecks) {
    return RENDER_BRACKET_SOURCE_PATTERNS;
  }
  return RENDER_BRACKET_SOURCE_PATTERNS.filter((p) => p.code !== "RENDER_BRACKET_LACUNA");
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Pull transcription body fragments from legacy batch HTML (excludes imprint/title chrome). */
export function extractParchmentBodyFragments(html: string): string[] {
  const fragments: string[] = [];
  const re =
    /<div class="parchment-sheet-card">([\s\S]*?)<\/div>\s*(?=<\/td>|<p class="folio-footer"|$)/gi;
  let match = re.exec(html);
  while (match) {
    fragments.push(match[1]);
    match = re.exec(html);
  }
  if (fragments.length === 0) {
    const fallback = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (fallback) {
      fragments.push(fallback[1]);
    }
  }
  return fragments;
}

export function visibleTextFromHtmlFragment(fragment: string): string {
  const withoutTags = fragment.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  return decodeBasicHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Remove HTML spans that correctly render HSMS bracket editorial markup,
 * so remaining `[…]` in the scan text are true leaks (e.g. `membro[s]`, `[ ]`).
 */
export function stripProcessedEditorialHtml(fragment: string): string {
  return fragment
    .replace(/<span[^>]*class="drop-initial-cap"[^>]*>[\s\S]*?<\/span>/gi, " ")
    .replace(/<span[^>]*>\[(?:[^\]]{0,120})\]<\/span>/gi, " ")
    .replace(/<span[^>]*>\/[^/]*\/<\/span>/gi, " ")
    .replace(/<i>[^<]{0,40}<\/i>/gi, (m) => m.slice(3, -4))
    .replace(/&#9633;&#9633;/gi, " ")
    .replace(/&hellip;/gi, " ");
}

export function visibleTextForLeakScan(fragment: string): string {
  return visibleTextFromHtmlFragment(stripProcessedEditorialHtml(fragment));
}

export function lineIndexForNeedle(sourceText: string, needle: string): number {
  const trimmed = needle.trim();
  if (!trimmed) return 0;

  const candidates = [trimmed];
  if (/^\[[^\]]+\]$/.test(trimmed) && !trimmed.includes("*")) {
    const inner = trimmed.slice(1, -1);
    candidates.push(`[*${inner}]`, `[ ${inner} ]`, `[${inner} `);
  }
  if (trimmed === "[" || trimmed === "]") {
    candidates.push("[ ]", "[]", "[*");
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let idx = sourceText.indexOf(c);
    if (idx < 0 && c.length > 24) {
      idx = sourceText.indexOf(c.slice(0, 24));
    }
    if (idx >= 0) {
      return sourceText.slice(0, idx).split(/\r?\n/).length - 1;
    }
  }
  return 0;
}

function pushRenderLeakMatch(
  pattern: RenderLeakPattern,
  raw: string,
  sourceText: string,
  seen: Set<string>,
  out: ValidationError[],
): void {
  const key = `${pattern.code}|${raw}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    severity: pattern.severity,
    message: pattern.describe(raw),
    lineIndex: lineIndexForNeedle(sourceText, raw),
    rawSnippet: raw.slice(0, 120),
  });
}

/** Linear scan — avoids catastrophic backtracking on unclosed `[`. */
function collectLongBracketClumps(
  haystack: string,
  minInner: number,
  pattern: RenderLeakPattern,
  sourceText: string,
  seen: Set<string>,
  out: ValidationError[],
): void {
  let i = 0;
  while (i < haystack.length && out.length < MAX_FINDINGS_PER_WITNESS) {
    const open = haystack.indexOf("[", i);
    if (open < 0) break;
    const close = haystack.indexOf("]", open + 1);
    if (close < 0 || close - open - 1 > MAX_BRACKET_INNER) {
      i = open + 1;
      continue;
    }
    const innerLen = close - open - 1;
    if (innerLen >= minInner) {
      pushRenderLeakMatch(pattern, haystack.slice(open, close + 1), sourceText, seen, out);
    }
    i = close + 1;
  }
}

function collectPatternMatches(
  haystack: string,
  pattern: RenderLeakPattern,
  sourceText: string,
  seen: Set<string>,
  out: ValidationError[],
): void {
  if (out.length >= MAX_FINDINGS_PER_WITNESS) return;

  if (pattern.code === "RENDER_BRACKET_CLUMP") {
    collectLongBracketClumps(haystack, 12, pattern, sourceText, seen, out);
    return;
  }

  if (pattern.code === "RENDER_DROP_INITIAL" && /drop-initial-cap/i.test(haystack)) {
    return;
  }

  if (pattern.code === "RENDER_LOOSE_BRACKET") {
    const idx = haystack.search(/\[|\]/);
    if (idx >= 0) {
      pushRenderLeakMatch(pattern, haystack[idx], sourceText, seen, out);
    }
    return;
  }

  pattern.regex.lastIndex = 0;
  let match = pattern.regex.exec(haystack);
  let iterations = 0;
  while (match && iterations++ < MAX_PATTERN_ITERATIONS) {
    const raw = match[0];
    pushRenderLeakMatch(pattern, raw, sourceText, seen, out);
    if (out.length >= MAX_FINDINGS_PER_WITNESS) {
      return;
    }
    const prevIndex = pattern.regex.lastIndex;
    match = pattern.regex.exec(haystack);
    if (match && pattern.regex.lastIndex === prevIndex) {
      pattern.regex.lastIndex += raw.length > 0 ? raw.length : 1;
    }
  }
}

const RE_TEXT_STRAY_BRACKETS = /\[(?:[^\]]{1,240})\]/;
const RE_TEXT_HSMS_BRACE = /\{[A-Z]{2,5}(?:\.|:\s*)/;
const RE_TEXT_RAW_MARKUP =
  /\[\s*\*(?:[^\]]{1,240})\]|\[\^(?:[^\]]{1,240})\]|\[\s+\]|\[\]|\[\s*\?{2,3}\s*\]|<<[^>]+>>|\$[.;]|(?<![0-9])%[23]?(?![0-9A-Za-z])|<[A-Za-z][A-Za-z0-9'~@]*>/;

function pushTokenLeak(
  issues: ValidationError[],
  seen: Set<string>,
  severity: ValidationError["severity"],
  code: string,
  message: string,
  lineIndex: number,
  snippet: string,
): void {
  const key = `${code}|${lineIndex}|${snippet}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({
    severity,
    message,
    lineIndex,
    rawSnippet: snippet.slice(0, 120),
  });
  if (issues.length >= MAX_FINDINGS_PER_WITNESS) return;
}

function scanTokenValueForLeaks(
  token: Token,
  lineIndex: number,
  sourceText: string,
  seen: Set<string>,
  issues: ValidationError[],
  options?: RenderLeakScanOptions,
): void {
  if (issues.length >= MAX_FINDINGS_PER_WITNESS) return;

  const probe = `${token.raw ?? ""} ${token.value ?? ""}`;
  if (!probe.trim()) return;

  if (!options?.skipLacunaChecks) {
    if (
      token.type === "mechanical_lacuna" ||
      (token.type === "blank_space" && /\[(?:[^\]]{0,120})\]/.test(token.raw ?? ""))
    ) {
      pushTokenLeak(
        issues,
        seen,
        "error",
        "RENDER_BRACKET_LACUNA",
        `[RENDER_LEAK] Lacuna token will render as visible brackets unless export maps to space: ${token.raw}`,
        lineIndex,
        token.raw ?? "[ ]",
      );
    }
  }

  if (token.type === "reconstructed_text" && (token.value?.length ?? 0) > 10) {
    pushTokenLeak(
      issues,
      seen,
      "warning",
      "RENDER_BRACKET_CLUMP",
      `[RENDER_LEAK] Long reconstruction bracket in token (check for word clumping): [${token.value?.slice(0, 40)}…]`,
      lineIndex,
      `[${token.value}]`,
    );
  }

  if (token.type !== "text") return;

  RE_TEXT_RAW_MARKUP.lastIndex = 0;
  let m = RE_TEXT_RAW_MARKUP.exec(probe);
  while (m) {
    const hit = m[0];
    const code = hit.includes("[*")
      ? "RENDER_RAW_RECONSTRUCTION"
      : hit.includes("[^")
        ? "RENDER_RAW_SCRIBAL_INSERT"
        : !options?.skipLacunaChecks && /\[\s+\]/.test(hit)
          ? "RENDER_BRACKET_LACUNA"
          : hit === "[]"
            ? "RENDER_EMPTY_BRACKETS"
            : /\[\?\?/.test(hit)
              ? "RENDER_BRACKET_ILLEGIBLE"
              : hit.startsWith("<<")
                ? "RENDER_SUPERSCRIPT_MARK"
                : hit.startsWith("<")
                  ? "RENDER_EXPANSION_ANGLE"
                  : hit.startsWith("$")
                    ? "RENDER_SCRIBAL_PUNCT"
                    : "RENDER_CALDERON";
    const pattern = [...RENDER_BRACKET_SOURCE_PATTERNS, ...RENDER_VISIBLE_LEAK_PATTERNS].find(
      (p) => p.code === code,
    );
    pushTokenLeak(
      issues,
      seen,
      pattern?.severity ?? "warning",
      code,
      pattern?.describe(hit) ?? `[RENDER_LEAK] Stray markup in text token: ${hit}`,
      lineIndex,
      hit,
    );
    if (issues.length >= MAX_FINDINGS_PER_WITNESS) return;
    m = RE_TEXT_RAW_MARKUP.exec(probe);
  }

  if (RE_TEXT_STRAY_BRACKETS.test(probe)) {
    const match = probe.match(RE_TEXT_STRAY_BRACKETS)?.[0] ?? probe;
    if (match.length >= 12) {
      pushTokenLeak(
        issues,
        seen,
        "warning",
        "RENDER_BRACKET_CLUMP",
        `[RENDER_LEAK] Bracket markup inside text token (clumping): ${match.slice(0, 48)}${match.length > 48 ? "…" : ""}`,
        lineIndex,
        match,
      );
    } else {
      pushTokenLeak(
        issues,
        seen,
        "warning",
        "RENDER_STRAY_BRACKET",
        `[RENDER_LEAK] Bracket markup inside text token (expected dedicated token): ${match}`,
        lineIndex,
        match,
      );
    }
  }

  if (RE_TEXT_HSMS_BRACE.test(probe)) {
    const match = probe.match(RE_TEXT_HSMS_BRACE)?.[0] ?? probe;
    pushTokenLeak(
      issues,
      seen,
      "error",
      "RENDER_BRACE_MNEMONIC",
      `[RENDER_LEAK] Brace mnemonic inside text token: ${match}`,
      lineIndex,
      match,
    );
  }
}

function countPrintableTokens(parsed: ParsedManuscript): number {
  let count = 0;
  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const blocks = getPrintableBlocks(parsed.folios[fi]);
    for (let bi = 0; bi < blocks.length; bi++) {
      count += blocks[bi].tokens.length;
    }
  }
  return count;
}

/**
 * Scan compiled tokens for HSMS punctuation left in plain `text` tokens
 * (matches facsimile leaks like `membro[s]` or `n[t]eme…`).
 */
export function scanParsedTokenMarkupLeakage(
  parsed: ParsedManuscript,
  sourceText: string,
  options?: RenderLeakScanOptions,
): ValidationError[] {
  const issues: ValidationError[] = [];
  const seen = new Set<string>();

  if (options?.skipLacunaChecks || countPrintableTokens(parsed) > MAX_TOKENS_FOR_TOKEN_SCAN) {
    return issues;
  }

  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    const blocks = getPrintableBlocks(folio);
    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      const lineIndex = block.lineIndex ?? 0;
      for (let ti = 0; ti < block.tokens.length; ti++) {
        scanTokenValueForLeaks(block.tokens[ti], lineIndex, sourceText, seen, issues, options);
        if (issues.length >= MAX_FINDINGS_PER_WITNESS) {
          return issues;
        }
      }
    }
  }

  return issues;
}

function mergeRenderLeakIssues(
  htmlIssues: ValidationError[],
  tokenIssues: ValidationError[],
): ValidationError[] {
  const seen = new Set<string>();
  const merged: ValidationError[] = [];
  const all = [...htmlIssues, ...tokenIssues];
  for (let i = 0; i < all.length; i++) {
    const issue = all[i];
    const key = `${issue.severity}|${issue.lineIndex}|${issue.message}|${issue.rawSnippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
    if (merged.length >= MAX_FINDINGS_PER_WITNESS) {
      break;
    }
  }
  return merged;
}

/**
 * Post-render pass: scan batch HTML and compiled tokens for HSMS markup that survived export.
 */
export function scanRenderedMarkupLeakage(
  html: string,
  sourceText: string,
  parsed?: ParsedManuscript,
  options?: RenderLeakScanOptions,
): ValidationError[] {
  const issues: ValidationError[] = [];
  const seen = new Set<string>();
  const bracketPatterns = bracketSourcePatternsForScan(options);

  if (html && html.length > 0) {
    const fragments = extractParchmentBodyFragments(html);

    fragmentLoop: for (let fi = 0; fi < fragments.length; fi++) {
      const fragment = fragments[fi];
      const visible = visibleTextFromHtmlFragment(fragment);
      const leakScanText = visibleTextForLeakScan(fragment);

      for (let pi = 0; pi < RENDER_HTML_LEAK_PATTERNS.length; pi++) {
        const pattern = RENDER_HTML_LEAK_PATTERNS[pi];
        collectPatternMatches(fragment, pattern, sourceText, seen, issues);
        collectPatternMatches(visible, pattern, sourceText, seen, issues);
        if (issues.length >= MAX_FINDINGS_PER_WITNESS) {
          break fragmentLoop;
        }
      }

      for (let pi = 0; pi < bracketPatterns.length; pi++) {
        const pattern = bracketPatterns[pi];
        collectPatternMatches(fragment, pattern, sourceText, seen, issues);
        collectPatternMatches(visible, pattern, sourceText, seen, issues);
        collectPatternMatches(leakScanText, pattern, sourceText, seen, issues);
        if (issues.length >= MAX_FINDINGS_PER_WITNESS) {
          break fragmentLoop;
        }
      }

      for (let pi = 0; pi < RENDER_STRAY_BRACKET_PATTERNS.length; pi++) {
        const pattern = RENDER_STRAY_BRACKET_PATTERNS[pi];
        collectPatternMatches(leakScanText, pattern, sourceText, seen, issues);
        if (issues.length >= MAX_FINDINGS_PER_WITNESS) {
          break fragmentLoop;
        }
      }

      for (let pi = 0; pi < RENDER_VISIBLE_LEAK_PATTERNS.length; pi++) {
        const pattern = RENDER_VISIBLE_LEAK_PATTERNS[pi];
        collectPatternMatches(visible, pattern, sourceText, seen, issues);
        if (issues.length >= MAX_FINDINGS_PER_WITNESS) {
          break fragmentLoop;
        }
      }
    }
  }

  const tokenIssues =
    parsed && !options?.skipLacunaChecks && issues.length < MAX_FINDINGS_PER_WITNESS
      ? scanParsedTokenMarkupLeakage(parsed, sourceText, options)
      : [];

  return mergeRenderLeakIssues(issues, tokenIssues);
}
