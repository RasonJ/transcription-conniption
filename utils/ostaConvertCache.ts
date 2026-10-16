import { createHash } from "node:crypto";

export const OSTA_SOURCE_HASH_EXT = ".source.sha256";

/** Stable content fingerprint for incremental OSTA batch skips. */
export function hashTranscriptionSource(rawText: string): string {
  return createHash("sha256").update(rawText, "utf8").digest("hex");
}

export function sourceHashPath(outputDir: string, baseName: string): string {
  return `${outputDir.replace(/[/\\]+$/, "")}/${baseName}${OSTA_SOURCE_HASH_EXT}`;
}

/**
 * True when prior convert artifacts exist and the source hash matches.
 * Missing/mismatched hash → caller must re-convert.
 */
export function canSkipOstaConvert(options: {
  sourceHash: string;
  storedHash: string | null | undefined;
  hasHtml: boolean;
  hasNative: boolean;
  hasLibrary: boolean;
  force?: boolean;
}): boolean {
  if (options.force) return false;
  if (!options.storedHash || options.storedHash !== options.sourceHash) return false;
  return options.hasHtml && options.hasNative && options.hasLibrary;
}
