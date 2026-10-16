import type { ParsedManuscript, Token, TokenType } from "../../constants/manuscript";
import { ROW_LIMIT } from "./executors/tierA";
import type { FacetIndex, TokenRef } from "./facetIndex";
import { tokenHand } from "./facetIndex";
import type { BreakdownEntry, EvidenceRow, RecipeResult } from "./types";

/**
 * Grammar (keywords are English only):
 *
 *   query   := "count" "tokens" [ "where" cond { "and" cond } ] [ "group" "by" field { "," field } ]
 *   cond    := field op value
 *   field   := "type" | "hand" | "folio"
 *   op      := "=" | "!=" | ">=" | "<=" | ">" | "<"
 *   value   := identifier | integer
 */

export const DSL_VERSION = 1;

export const TOKEN_TYPES: readonly TokenType[] = [
  "text",
  "expansion",
  "superscript",
  "scribal_deletion",
  "editorial_deletion",
  "scribal_insertion",
  "editorial_insertion",
  "prefix_separator",
  "non_sequitur",
  "reconstructed_text",
  "illegible_text",
  "missing_fragment",
  "mechanical_lacuna",
  "calderon",
  "calderon_two",
  "calderon_three",
  "blank_space",
  "otiose_mark",
  "hyphen",
  "figure_anchor",
  "env_open",
  "env_close",
  "scribal_punctuation",
  "drop_initial",
  "citation_wrap",
];

export type DslField = "type" | "hand" | "folio";
export type DslOp = "=" | "!=" | ">=" | "<=" | ">" | "<";

export interface DslCondition {
  field: DslField;
  op: DslOp;
  value: string | number;
}

export interface DslQuery {
  kind: "count";
  target: "tokens";
  where: DslCondition[];
  groupBy: DslField[];
}

const LEXEME_RE = /\s*(>=|<=|!=|=|>|<|,|[A-Za-z0-9_.\-]+)/y;
const FIELDS: readonly DslField[] = ["type", "hand", "folio"];
const OPS = new Set<string>(["=", "!=", ">=", "<=", ">", "<"]);

function lex(input: string): string[] | null {
  const out: string[] = [];
  const src = input.trim();
  let pos = 0;
  LEXEME_RE.lastIndex = 0;
  while (pos < src.length) {
    LEXEME_RE.lastIndex = pos;
    const m = LEXEME_RE.exec(src);
    if (!m) return null;
    out.push(m[1]);
    pos = LEXEME_RE.lastIndex;
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private readonly toks: string[]) {}

  private peek(): string | undefined {
    return this.toks[this.i]?.toLowerCase();
  }

  private take(): string | undefined {
    return this.toks[this.i++];
  }

  private accept(word: string): boolean {
    if (this.peek() === word) {
      this.i++;
      return true;
    }
    return false;
  }

  parseQuery(): DslQuery | null {
    if (!this.accept("count") || !this.accept("tokens")) return null;
    const where: DslCondition[] = [];
    const groupBy: DslField[] = [];

    if (this.accept("where")) {
      do {
        const cond = this.parseCondition();
        if (!cond) return null;
        where.push(cond);
      } while (this.accept("and"));
    }

    if (this.accept("group")) {
      if (!this.accept("by")) return null;
      do {
        const field = this.parseField();
        if (!field) return null;
        groupBy.push(field);
      } while (this.accept(","));
    }

    if (this.i < this.toks.length) return null;
    return { kind: "count", target: "tokens", where, groupBy };
  }

  private parseField(): DslField | null {
    const word = this.take()?.toLowerCase();
    return word && (FIELDS as readonly string[]).includes(word) ? (word as DslField) : null;
  }

  private parseCondition(): DslCondition | null {
    const field = this.parseField();
    if (!field) return null;
    const op = this.take();
    if (!op || !OPS.has(op)) return null;
    const raw = this.take();
    if (raw === undefined) return null;

    if (field === "hand") {
      if (!/^\d+$/.test(raw)) return null;
      return { field, op: op as DslOp, value: parseInt(raw, 10) };
    }
    if (field === "type") {
      const value = raw.toLowerCase();
      if (op !== "=" && op !== "!=") return null;
      if (!(TOKEN_TYPES as readonly string[]).includes(value)) return null;
      return { field, op: op as DslOp, value };
    }
    if (op !== "=" && op !== "!=") return null;
    return { field, op: op as DslOp, value: raw };
  }
}

/** Parse a query expression; returns null when the input is not valid DSL. */
export function parseDsl(input: string): DslQuery | null {
  const toks = lex(input);
  if (!toks || toks.length === 0) return null;
  if (toks[0].toLowerCase() !== "count") return null;
  return new Parser(toks).parseQuery();
}

export function formatDsl(q: DslQuery): string {
  const where = q.where.map((c) => `${c.field} ${c.op} ${c.value}`).join(" and ");
  const parts = [`count ${q.target}`];
  if (where) parts.push(`where ${where}`);
  if (q.groupBy.length > 0) parts.push(`group by ${q.groupBy.join(", ")}`);
  return parts.join(" ");
}

function compare(op: DslOp, left: string | number, right: string | number): boolean {
  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case "<":
      return left < right;
  }
}

function fieldValue(field: DslField, token: Token, ref: TokenRef): string | number {
  if (field === "type") return token.type;
  if (field === "folio") return ref.folioId;
  return parseInt(tokenHand(token) ?? "1", 10);
}

function matches(q: DslQuery, token: Token, ref: TokenRef): boolean {
  for (const c of q.where) {
    if (!compare(c.op, fieldValue(c.field, token, ref), c.value)) return false;
  }
  return true;
}

function candidateRefs(q: DslQuery, facets: FacetIndex, parsed: ParsedManuscript): TokenRef[] {
  const handConds = q.where.filter((c) => c.field === "hand");
  const unmarkedMatches = handConds.every((c) => compare(c.op, 1, c.value));
  if (handConds.length > 0 && !unmarkedMatches) {
    const refs: TokenRef[] = [];
    facets.handRefs.forEach((list) => refs.push(...list));
    return refs;
  }

  const typeCond = q.where.find((c) => c.field === "type" && c.op === "=");
  if (typeCond) {
    const refs = facets.tokenRefs.get(typeCond.value as TokenType);
    if (refs) return refs;
    if (typeCond.value !== "text" && typeCond.value !== "env_open" && typeCond.value !== "env_close") {
      return [];
    }
  }

  const all: TokenRef[] = [];
  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    for (let bi = 0; bi < folio.blocks.length; bi++) {
      const block = folio.blocks[bi];
      for (let ti = 0; ti < block.tokens.length; ti++) {
        all.push({ folioIndex: fi, folioId: folio.id, blockIndex: bi, tokenIndex: ti, lineNumber: block.lineNumber });
      }
    }
  }
  return all;
}

export function executeDsl(
  q: DslQuery,
  facets: FacetIndex,
  parsed: ParsedManuscript,
): RecipeResult {
  const candidates = candidateRefs(q, facets, parsed);
  const matched: Array<{ ref: TokenRef; token: Token }> = [];
  for (const ref of candidates) {
    const token = parsed.folios[ref.folioIndex]?.blocks[ref.blockIndex]?.tokens[ref.tokenIndex];
    if (token && matches(q, token, ref)) matched.push({ ref, token });
  }
  matched.sort(
    (a, b) =>
      a.ref.folioIndex - b.ref.folioIndex ||
      a.ref.blockIndex - b.ref.blockIndex ||
      a.ref.tokenIndex - b.ref.tokenIndex,
  );

  let breakdown: BreakdownEntry[] | undefined;
  if (q.groupBy.length > 0) {
    const groups = new Map<string, number>();
    for (const { ref, token } of matched) {
      const key = q.groupBy.map((f) => `${f} ${fieldValue(f, token, ref)}`).join(" · ");
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    breakdown = [...groups.entries()].map(([label, value]) => ({ label, value }));
  }

  const rows: EvidenceRow[] = matched.slice(0, ROW_LIMIT).map(({ ref, token }) => ({
    folioId: ref.folioId,
    lineNumber: ref.lineNumber,
    label: token.type,
    detail: token.value,
  }));

  return {
    headline: `${matched.length} token${matched.length === 1 ? "" : "s"} match \`${formatDsl(q)}\`.`,
    count: matched.length,
    breakdown,
    rows,
  };
}
