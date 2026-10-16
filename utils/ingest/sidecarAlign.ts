import { hashManuscriptSource } from "../manuscriptIdentity";
import type { HsmsFacsSidecar, SidecarLine } from "./types";

export type LineDiffOp = "equal" | "delete" | "insert";

export interface LineDiffEntry {
  op: LineDiffOp;
  /** Index in the old array (null for inserts). */
  oldIndex: number | null;
  /** Index in the new array (null for deletes). */
  newIndex: number | null;
}

export interface AlignStats {
  carried: number;
  modified: number;
  reanchored: number;
  dropped: number;
  /** New lines with no sidecar link. */
  unlinked: number;
}

export interface AlignResult {
  sidecar: HsmsFacsSidecar;
  /** Old line index → new line index for every carried sidecar line. */
  lineMap: Map<number, number>;
  unlinkedNewLines: number[];
  stats: AlignStats;
}

const RE_EOL = /\r\n?/g;

export function splitWitnessLines(text: string): string[] {
  return text.replace(RE_EOL, "\n").split("\n");
}

export function hashWitnessText(text: string): string {
  return hashManuscriptSource(text.replace(RE_EOL, "\n"));
}

function lineContentHash(line: string): string {
  return hashManuscriptSource(line.trim());
}

/** Content hash + ordinal among identical lines, e.g. `ms_1k2j:0`. */
export function lineAnchors(lines: string[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const h = lineContentHash(line);
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return `${h}:${n}`;
  });
}

function myersMiddle(a: string[], b: string[], aOff: number, bOff: number): LineDiffEntry[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) {
    return b.map((_, j) => ({ op: "insert", oldIndex: null, newIndex: bOff + j }));
  }
  if (m === 0) {
    return a.map((_, i) => ({ op: "delete", oldIndex: aOff + i, newIndex: null }));
  }

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  const out: LineDiffEntry[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const tv = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && tv[offset + k - 1] < tv[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = tv[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      out.push({ op: "equal", oldIndex: aOff + x, newIndex: bOff + y });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        out.push({ op: "insert", oldIndex: null, newIndex: bOff + y });
      } else {
        x--;
        out.push({ op: "delete", oldIndex: aOff + x, newIndex: null });
      }
    }
  }
  return out.reverse();
}

/** Myers line diff with common prefix/suffix trimmed first. */
export function diffLines(oldLines: string[], newLines: string[]): LineDiffEntry[] {
  let start = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (start < minLen && oldLines[start] === newLines[start]) start++;

  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }

  const out: LineDiffEntry[] = [];
  for (let i = 0; i < start; i++) out.push({ op: "equal", oldIndex: i, newIndex: i });
  out.push(
    ...myersMiddle(oldLines.slice(start, endOld), newLines.slice(start, endNew), start, start),
  );
  for (let i = 0; i < oldLines.length - endOld; i++) {
    out.push({ op: "equal", oldIndex: endOld + i, newIndex: endNew + i });
  }
  return out;
}

interface Hunk {
  deletes: number[];
  inserts: number[];
}

function collectHunks(diff: LineDiffEntry[]): { equal: Map<number, number>; hunks: Hunk[] } {
  const equal = new Map<number, number>();
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const e of diff) {
    if (e.op === "equal") {
      equal.set(e.oldIndex as number, e.newIndex as number);
      current = null;
      continue;
    }
    if (!current) {
      current = { deletes: [], inserts: [] };
      hunks.push(current);
    }
    if (e.op === "delete") current.deletes.push(e.oldIndex as number);
    else current.inserts.push(e.newIndex as number);
  }
  return { equal, hunks };
}

/**
 * Re-map sidecar line links after `witness.txt` is edited.
 * Unchanged lines carry over; replaced lines are paired positionally within each changed hunk
 * (counted as modified); deleted lines drop; inserted lines stay unlinked. Dropped links are
 * re-anchored by content hash when the same text reappears on an unlinked new line.
 */
export function alignSidecar(
  sidecar: HsmsFacsSidecar,
  oldText: string,
  newText: string,
): AlignResult {
  const oldLines = splitWitnessLines(oldText);
  const newLines = splitWitnessLines(newText);
  const diff = diffLines(oldLines, newLines);
  const { equal, hunks } = collectHunks(diff);

  const lineMap = new Map<number, number>(equal);
  const modifiedOld = new Set<number>();
  const reanchoredOld = new Set<number>();
  const leftoverDeletes: number[] = [];

  for (const hunk of hunks) {
    const pairs = Math.min(hunk.deletes.length, hunk.inserts.length);
    for (let i = 0; i < pairs; i++) {
      lineMap.set(hunk.deletes[i], hunk.inserts[i]);
      modifiedOld.add(hunk.deletes[i]);
    }
    for (let i = pairs; i < hunk.deletes.length; i++) leftoverDeletes.push(hunk.deletes[i]);
  }

  const linkedNew = new Set(lineMap.values());
  const unlinkedByHash = new Map<string, number[]>();
  for (let j = 0; j < newLines.length; j++) {
    if (linkedNew.has(j) || newLines[j].trim() === "") continue;
    const h = lineContentHash(newLines[j]);
    const bucket = unlinkedByHash.get(h);
    if (bucket) bucket.push(j);
    else unlinkedByHash.set(h, [j]);
  }

  const sidecarOldLines = new Set<number>();
  for (const folio of Object.values(sidecar.folios)) {
    for (const line of folio.lines) sidecarOldLines.add(line.sourceLine);
  }

  for (const oldIdx of leftoverDeletes) {
    if (!sidecarOldLines.has(oldIdx)) continue;
    const bucket = unlinkedByHash.get(lineContentHash(oldLines[oldIdx]));
    const target = bucket?.shift();
    if (target !== undefined) {
      lineMap.set(oldIdx, target);
      reanchoredOld.add(oldIdx);
    }
  }

  const newAnchors = lineAnchors(newLines);
  const stats: AlignStats = { carried: 0, modified: 0, reanchored: 0, dropped: 0, unlinked: 0 };
  const carriedNew = new Set<number>();

  const folios: HsmsFacsSidecar["folios"] = {};
  for (const [folioId, folio] of Object.entries(sidecar.folios)) {
    const lines: SidecarLine[] = [];
    for (const line of folio.lines) {
      const target = lineMap.get(line.sourceLine);
      if (target === undefined) {
        stats.dropped++;
        continue;
      }
      if (carriedNew.has(target)) {
        stats.dropped++;
        continue;
      }
      carriedNew.add(target);
      if (reanchoredOld.has(line.sourceLine)) stats.reanchored++;
      else if (modifiedOld.has(line.sourceLine)) stats.modified++;
      else stats.carried++;
      lines.push({ ...line, sourceLine: target, anchor: newAnchors[target] });
    }
    lines.sort((a, b) => a.sourceLine - b.sourceLine);
    folios[folioId] = { ...folio, lines };
  }

  // Only edited lines count as unlinked; unchanged lines that never had a link are not new.
  const equalNew = new Set(equal.values());
  const unlinkedNewLines: number[] = [];
  for (let j = 0; j < newLines.length; j++) {
    if (!carriedNew.has(j) && !equalNew.has(j) && newLines[j].trim() !== "") {
      unlinkedNewLines.push(j);
    }
  }
  stats.unlinked = unlinkedNewLines.length;

  return {
    sidecar: { ...sidecar, witnessHash: hashWitnessText(newText), folios },
    lineMap,
    unlinkedNewLines,
    stats,
  };
}
