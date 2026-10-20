/**
 * Brace pairing for the HSMS source editor (SPEC-EDITOR ED-20).
 * `{` `[` `<` insert the closer; typing the closer before an auto-inserted one steps over it;
 * backspace on an empty pair deletes both.
 */

const PAIRS: Record<string, string> = { "{": "}", "[": "]", "<": ">" };
const CLOSERS: Record<string, string> = { "}": "{", "]": "[", ">": "<" };

export interface PairedEdit {
  text: string;
  cursor: number;
}

function findInsertedIndex(prev: string, next: string): number | null {
  if (next.length !== prev.length + 1) return null;
  for (let i = 0; i < next.length; i++) {
    if (next.slice(0, i) + next.slice(i + 1) === prev) return i;
  }
  return null;
}

function findDeletedIndex(prev: string, next: string): number | null {
  if (prev.length !== next.length + 1) return null;
  for (let i = 0; i < prev.length; i++) {
    if (prev.slice(0, i) + prev.slice(i + 1) === next) return i;
  }
  return null;
}

/** Returns a replacement when the edit is a single-character pair action; otherwise null. */
export function pairBraces(prev: string, next: string): PairedEdit | null {
  const insertedAt = findInsertedIndex(prev, next);
  if (insertedAt !== null) {
    const inserted = next[insertedAt] ?? "";
    const close = PAIRS[inserted];
    if (close) {
      return {
        text: next.slice(0, insertedAt + 1) + close + next.slice(insertedAt + 1),
        cursor: insertedAt + 1,
      };
    }
    if (CLOSERS[inserted] && next[insertedAt + 1] === inserted) {
      return {
        text: next.slice(0, insertedAt) + next.slice(insertedAt + 1),
        cursor: insertedAt + 1,
      };
    }
    return null;
  }

  const deletedAt = findDeletedIndex(prev, next);
  if (deletedAt !== null) {
    const deleted = prev[deletedAt] ?? "";
    const close = PAIRS[deleted];
    if (close && prev[deletedAt + 1] === close && next[deletedAt] === close) {
      return { text: next.slice(0, deletedAt) + next.slice(deletedAt + 1), cursor: deletedAt };
    }
  }

  return null;
}
