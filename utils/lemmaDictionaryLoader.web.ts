/**
 * Web loader: fetches the front-coded dictionary from the same origin on first use.
 * `scripts/generate-hsms-dictionary-index.mjs` writes it to `public/dic/`.
 * The service worker (`public/sw.js`) caches it after the first fetch, so it works offline.
 */
import { decodeLemmaEntries } from "./lemmaDictionaryCodec";

export type LemmaTable = ReadonlyMap<string, string>;
export type PosTable = ReadonlyMap<string, string>;

export const LEMMA_DICTIONARY_PATH = "/dic/hsmsLemmaIndex.v2.tsv";
export const POS_DICTIONARY_PATH = "/dic/hsmsPosIndex.json";

function dictionaryUrl(): string {
  const configured = process.env.EXPO_PUBLIC_DICTIONARY_URL?.trim();
  if (configured) return configured;
  const origin = typeof window !== "undefined" ? window.location?.origin ?? "" : "";
  return `${origin}${LEMMA_DICTIONARY_PATH}`;
}

function posDictionaryUrl(): string {
  const origin = typeof window !== "undefined" ? window.location?.origin ?? "" : "";
  return `${origin}${POS_DICTIONARY_PATH}`;
}

/** The web build has no synchronous path; callers fall back to surface forms until loaded. */
export function loadLemmaTableSync(): LemmaTable | null {
  return null;
}

export function loadPosTableSync(): PosTable | null {
  return null;
}

export async function loadLemmaTable(): Promise<LemmaTable> {
  const res = await fetch(dictionaryUrl());
  if (!res.ok) throw new Error(`Lemma dictionary request failed (${res.status})`);
  return decodeLemmaEntries(await res.text());
}

/** Optional POS index; empty map if the asset is unavailable. */
export async function loadPosTable(): Promise<PosTable> {
  try {
    const res = await fetch(posDictionaryUrl());
    if (!res.ok) return new Map();
    const data = (await res.json()) as Record<string, string>;
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}
