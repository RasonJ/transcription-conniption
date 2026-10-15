import { useCallback, useMemo } from "react";
import { DEFAULT_DIM } from "./hashEmbed";
import {
  INTENT_THRESHOLD,
  buildProtoVectors,
  classifyIntent,
  type IntentMatch,
} from "./intentClassifier";

/** React helper: memoised classify / topIntent over a prototype map. */
export function useIntentClassifier(
  prototypes: Record<string, string>,
  dim: number = DEFAULT_DIM,
) {
  const protoVecs = useMemo(() => buildProtoVectors(prototypes, dim), [prototypes, dim]);

  const classify = useCallback(
    (query: string): IntentMatch[] => classifyIntent(query, protoVecs, dim),
    [protoVecs, dim],
  );

  const topIntent = useCallback(
    (query: string): IntentMatch | null => {
      const [best] = classify(query);
      return best && best.score >= INTENT_THRESHOLD ? best : null;
    },
    [classify],
  );

  return { classify, topIntent, protoVecs };
}
