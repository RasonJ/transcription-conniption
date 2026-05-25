/** Stable content signature for scoping figure-image caches per transcription source. */
export function hashManuscriptSource(source: string): string {
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = (((hash << 5) + hash) ^ source.charCodeAt(i)) >>> 0;
  }
  return `ms_${hash.toString(36)}`;
}

export function manuscriptIdentityFromSource(source: string): string {
  return hashManuscriptSource(source.trim());
}
