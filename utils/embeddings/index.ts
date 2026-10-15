/**
 * Lightweight local embeddings for manuscript intent routing and passage search.
 * Synchronous in web, React Native, and Node — no network, no ONNX.
 */

export {
  hashEmbed,
  hashEmbedInto,
  hashEmbedBatch,
  l2NormalizeSlice,
  cosineSim,
  meanPool,
  DEFAULT_DIM,
} from "./hashEmbed";

export {
  buildProtoVectors,
  classifyIntent,
  INTENT_THRESHOLD,
} from "./intentClassifier";

export { useIntentClassifier } from "./useIntentClassifier";

export type { IntentMatch, ProtoVectors } from "./intentClassifier";
