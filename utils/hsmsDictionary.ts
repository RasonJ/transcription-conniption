/**
 * HSMS dictionary (assets/dic/hsms.src — DB_MAP lemmatization index), loaded lazily.
 *
 * Nothing is loaded at startup (SPEC-LIGHTWEIGHT §4.2). The first caller that needs lemmas
 * calls `ensureLemmaDictionary()`. Until it resolves, `lookupHsmsLemma` returns undefined
 * and callers fall back to normalized surface forms; subscribers are notified when lemmas
 * become available so they can recompute.
 *
 * Regenerate data with: node scripts/generate-hsms-dictionary-index.mjs
 */
import {
  loadLemmaTable,
  loadLemmaTableSync,
  loadPosTable,
  loadPosTableSync,
  type LemmaTable,
  type PosTable,
} from "./lemmaDictionaryLoader";

type DictionaryState = "idle" | "loading" | "ready" | "failed";

let table: LemmaTable | null = null;
let posTable: PosTable | null = null;
let state: DictionaryState = "idle";
let pending: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function normalizeKey(surface: string): string {
  return surface.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

function install(next: LemmaTable, nextPos?: PosTable | null): void {
  table = next;
  if (nextPos) posTable = nextPos;
  state = "ready";
  generation++;
  listeners.forEach((fn) => fn());
}

/** Returns a dictionary lemma for a surface form, or undefined if not indexed or not loaded yet. */
export function lookupHsmsLemma(surface: string): string | undefined {
  if (!table) return undefined;
  const key = normalizeKey(surface);
  if (!key) return undefined;
  return table.get(key);
}

/**
 * EAGLES-style POS tag from the analizador / hsms.src dictionary (e.g. VMN0000).
 * Undefined until the POS index is loaded or if the surface is untagged.
 */
export function lookupHsmsPos(surface: string): string | undefined {
  if (!posTable) return undefined;
  const key = normalizeKey(surface);
  if (!key) return undefined;
  return posTable.get(key);
}

/** Prefer dictionary lemma; fall back to normalized surface form. */
export function resolveLemma(surface: string, fallbackLemma: string): string {
  return lookupHsmsLemma(surface) ?? fallbackLemma;
}

export function isLemmaDictionaryReady(): boolean {
  return state === "ready";
}

export function getLemmaDictionaryState(): DictionaryState {
  return state;
}

/** Changes each time lemmas become available; include it in cache keys of lemma-derived data. */
export function lemmaDictionaryGeneration(): number {
  return generation;
}

/** Start loading (idempotent). Resolves when lemmas are available; never rejects. */
export function ensureLemmaDictionary(): Promise<void> {
  if (state === "ready") return Promise.resolve();
  if (pending) return pending;
  state = "loading";
  pending = Promise.all([loadLemmaTable(), loadPosTable()])
    .then(([lemmas, pos]) => install(lemmas, pos))
    .catch(() => {
      state = "failed";
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * Synchronous load for Node scripts and tests (batch conversion, OSTA integration).
 * Returns false on platforms without a synchronous path (web).
 */
export function loadLemmaDictionarySync(): boolean {
  if (state === "ready") return true;
  try {
    const sync = loadLemmaTableSync();
    if (!sync) return false;
    install(sync, loadPosTableSync());
    return true;
  } catch {
    return false;
  }
}

export function subscribeLemmaDictionary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: forget the loaded table. */
export function resetLemmaDictionaryForTests(): void {
  table = null;
  posTable = null;
  state = "idle";
  pending = null;
  generation++;
}
