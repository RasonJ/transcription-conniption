/**
 * Persisted Overview answers (SPEC-COPILOT §7.2): eager recipe results survive app restarts,
 * so reopening a witness shows its chips without rebuilding the FacetIndex. Keyed by the
 * witness source hash + catalog version; least-recently-used entries are evicted once the
 * store passes its byte budget (2 MB by default).
 */
import { manuscriptIdentityFromSource } from "../manuscriptIdentity";
import { CATALOG_VERSION } from "./catalog";
import type { OverviewEntry } from "./precompute";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const PREFIX = "hsms.copilot.overview.v1:";
const INDEX_KEY = `${PREFIX}index`;
export const OVERVIEW_BUDGET_BYTES = 2 * 1024 * 1024;

interface IndexEntry {
  key: string;
  bytes: number;
  usedAt: number;
}

let storePromise: Promise<KeyValueStore> | null = null;

function defaultStore(): Promise<KeyValueStore> {
  if (!storePromise) {
    storePromise = import("@react-native-async-storage/async-storage").then(
      (m) => (m.default ?? m) as unknown as KeyValueStore,
    );
  }
  return storePromise;
}

export function overviewCacheKey(sourceText: string): string {
  return `${PREFIX}${CATALOG_VERSION}:${manuscriptIdentityFromSource(sourceText)}`;
}

async function readIndex(store: KeyValueStore): Promise<IndexEntry[]> {
  try {
    const raw = await store.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as IndexEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadPersistedOverview(
  sourceText: string,
  store?: KeyValueStore,
): Promise<OverviewEntry[] | null> {
  try {
    const s = store ?? (await defaultStore());
    const key = overviewCacheKey(sourceText);
    const raw = await s.getItem(key);
    if (!raw) return null;
    const entries = JSON.parse(raw) as OverviewEntry[];
    const index = await readIndex(s);
    const hit = index.find((e) => e.key === key);
    if (hit) {
      hit.usedAt = Date.now();
      await s.setItem(INDEX_KEY, JSON.stringify(index));
    }
    return Array.isArray(entries) ? entries : null;
  } catch {
    return null;
  }
}

export async function persistOverview(
  sourceText: string,
  entries: OverviewEntry[],
  options: { store?: KeyValueStore; budgetBytes?: number; now?: number } = {},
): Promise<void> {
  try {
    const s = options.store ?? (await defaultStore());
    const budget = options.budgetBytes ?? OVERVIEW_BUDGET_BYTES;
    const key = overviewCacheKey(sourceText);
    const value = JSON.stringify(entries);
    const bytes = value.length * 2; // UTF-16 upper bound
    if (bytes > budget) return;
    const index = (await readIndex(s)).filter((e) => e.key !== key);
    index.push({ key, bytes, usedAt: options.now ?? Date.now() });
    index.sort((a, b) => a.usedAt - b.usedAt);
    let total = index.reduce((n, e) => n + e.bytes, 0);
    while (total > budget && index.length > 1) {
      const evicted = index.shift()!;
      total -= evicted.bytes;
      await s.removeItem(evicted.key);
    }
    await s.setItem(key, value);
    await s.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* persistence is best-effort */
  }
}
