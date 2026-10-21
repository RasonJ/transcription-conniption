/**
 * Read one entry from a zip archive in memory.
 * Callers keep the compressed bytes and never write the expanded file to disk.
 */
import JSZip from "jszip";

export async function readZipEntryText(
  data: ArrayBuffer | Uint8Array,
  entryName: string,
): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const entry = zip.file(entryName);
  if (!entry) {
    throw new Error(`Zip entry not found: ${entryName}`);
  }
  return entry.async("string");
}

export async function readZipJson<T>(data: ArrayBuffer | Uint8Array, entryName: string): Promise<T> {
  return JSON.parse(await readZipEntryText(data, entryName)) as T;
}
