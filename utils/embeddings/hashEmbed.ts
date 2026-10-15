/**
 * Zero-dependency client-side feature-hash embedder.
 * FNV-1a 32-bit hashing over character trigrams → unit-normalised Float32Array.
 */

export const DEFAULT_DIM = 384;

const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;

/** FNV-1a 32-bit hash of a UTF-16 substring (zero allocation). */
function fnv1a32Sub(s: string, start: number, len: number): number {
  let h = FNV_OFFSET;
  const end = start + len;
  for (let i = start; i < end; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Extract alpha-numeric tokens from text. */
function tokenise(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** L2-normalise `target[offset .. offset+dim)`. */
export function l2NormalizeSlice(
  target: Float32Array,
  offset: number = 0,
  dim: number = DEFAULT_DIM,
): void {
  let normSq = 0;
  const end = offset + dim;
  for (let i = offset; i < end; i++) {
    normSq += target[i] * target[i];
  }
  if (normSq > 0) {
    const invNorm = 1.0 / Math.sqrt(normSq);
    for (let i = offset; i < end; i++) {
      target[i] *= invNorm;
    }
  }
}

/**
 * Accumulate trigram features of `text` into an existing slice.
 * Caller zeroes the slice when starting fresh.
 */
export function hashEmbedInto(
  text: string,
  target: Float32Array,
  offset: number = 0,
  dim: number = DEFAULT_DIM,
  normalize: boolean = true,
): void {
  const tokens = tokenise(text.trim());
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    const len = tok.length;

    if (len < 3) {
      const h = fnv1a32Sub(tok, 0, len);
      const idx = (h % dim) + offset;
      const sign = (h & 0x80000000) !== 0 ? -1 : 1;
      target[idx] += sign;
    } else {
      const maxTri = len - 3;
      for (let i = 0; i <= maxTri; i++) {
        const h = fnv1a32Sub(tok, i, 3);
        const idx = (h % dim) + offset;
        const sign = (h & 0x80000000) !== 0 ? -1 : 1;
        target[idx] += sign;
      }
    }
  }

  if (normalize) l2NormalizeSlice(target, offset, dim);
}

/** Embed `text` into a unit-normalised Float32Array of length `dim`. */
export function hashEmbed(text: string, dim: number = DEFAULT_DIM): Float32Array {
  const vec = new Float32Array(dim);
  hashEmbedInto(text, vec, 0, dim, true);
  return vec;
}

export function hashEmbedBatch(texts: readonly string[], dim: number = DEFAULT_DIM): Float32Array[] {
  const out = new Array<Float32Array>(texts.length);
  for (let i = 0; i < texts.length; i++) {
    out[i] = hashEmbed(texts[i], dim);
  }
  return out;
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function meanPool(vecs: Float32Array[], dim: number = DEFAULT_DIM): Float32Array {
  const out = new Float32Array(dim);
  const count = vecs.length;
  if (count === 0) return out;

  for (let v = 0; v < count; v++) {
    const vec = vecs[v];
    for (let i = 0; i < dim; i++) {
      out[i] += vec[i];
    }
  }

  l2NormalizeSlice(out, 0, dim);
  return out;
}
