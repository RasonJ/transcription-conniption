/**
 * Prototype-based intent classification via cosine similarity against a
 * contiguous N × dim hash-embed matrix (pure functions — no React).
 */

import { DEFAULT_DIM, hashEmbed, hashEmbedInto, l2NormalizeSlice } from "./hashEmbed";

export interface IntentMatch {
  intent: string;
  score: number;
}

export type ProtoVectors = {
  intents: string[];
  matrix: Float32Array;
  dim: number;
};

export const INTENT_THRESHOLD = 0.55;

let phraseScratch: Float32Array | null = null;

function phraseBuffer(dim: number): Float32Array {
  if (phraseScratch === null || phraseScratch.length < dim) {
    phraseScratch = new Float32Array(dim);
  }
  return phraseScratch;
}

/** Build a contiguous prototype matrix from a phrase map. */
export function buildProtoVectors(
  prototypes: Record<string, string>,
  dim: number = DEFAULT_DIM,
): ProtoVectors {
  const intents = Object.keys(prototypes);
  const count = intents.length;
  const matrix = new Float32Array(count * dim);

  for (let i = 0; i < count; i++) {
    const intent = intents[i];
    const phraseStr = prototypes[intent];
    const phrases = phraseStr
      .split(/\s{2,}|[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const offset = i * dim;
    if (phrases.length === 0) {
      hashEmbedInto(intent, matrix, offset, dim, true);
      continue;
    }

    if (phrases.length === 1) {
      hashEmbedInto(phrases[0], matrix, offset, dim, true);
      continue;
    }

    const scratch = phraseBuffer(dim);
    for (let p = 0; p < phrases.length; p++) {
      scratch.fill(0, 0, dim);
      hashEmbedInto(phrases[p], scratch, 0, dim, true);
      for (let j = 0; j < dim; j++) {
        matrix[offset + j] += scratch[j];
      }
    }
    l2NormalizeSlice(matrix, offset, dim);
  }

  return { intents, matrix, dim };
}

/** Classify a query against a pre-built prototype matrix (matrix-vector dots). */
export function classifyIntent(
  query: string,
  protoVecs: ProtoVectors,
  dim: number = DEFAULT_DIM,
): IntentMatch[] {
  const q = query.trim();
  if (!q) return [];

  const qVec = hashEmbed(q, dim);
  const { intents, matrix } = protoVecs;
  const count = intents.length;
  const results: IntentMatch[] = new Array(count);
  const d = Math.min(dim, protoVecs.dim);

  for (let i = 0; i < count; i++) {
    const offset = i * protoVecs.dim;
    let dot = 0;
    for (let j = 0; j < d; j++) {
      dot += qVec[j] * matrix[offset + j];
    }
    results[i] = { intent: intents[i], score: dot };
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
