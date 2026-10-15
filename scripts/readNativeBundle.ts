import fs from "node:fs";

/**
 * Extract `transcriptionText` from a generated `*.native.ts` module.
 * Matches a JSON string literal (what `JSON.stringify` emits), so missing
 * trailing newlines and adjacent exports do not break parsing.
 */
export function readNativeTranscription(nativePath: string): string | undefined {
  try {
    const source = fs.readFileSync(nativePath, "utf8");
    return parseNativeTranscriptionSource(source);
  } catch {
    return undefined;
  }
}

/** Parse transcription text from already-loaded native bundle source. */
export function parseNativeTranscriptionSource(source: string): string | undefined {
  const match = source.match(/export const transcriptionText = ("(?:\\.|[^"\\])*")\s*;/);
  if (!match) {
    return undefined;
  }
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

export type NativeBundleMeta = {
  exportedAt: string;
  sourceFileName: string;
  manuscriptTitle: string;
};

/** Parse `nativeBundleMeta` from already-loaded native bundle source. */
export function parseNativeBundleMeta(source: string): NativeBundleMeta | undefined {
  const match = source.match(/export const nativeBundleMeta = (\{[\s\S]*?\}) as const/);
  if (!match) {
    return undefined;
  }
  try {
    return JSON.parse(match[1]) as NativeBundleMeta;
  } catch {
    return undefined;
  }
}
