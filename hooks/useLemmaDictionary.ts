import {
  ensureLemmaDictionary,
  getLemmaDictionaryState,
  lemmaDictionaryGeneration,
  subscribeLemmaDictionary,
} from "@/utils/hsmsDictionary";
import { useEffect, useState } from "react";

/**
 * Starts the lazy lemma dictionary load while `active` and re-renders when lemmas arrive.
 * `generation` changes when the dictionary becomes available — use it as a memo dependency.
 */
export function useLemmaDictionary(active: boolean): {
  ready: boolean;
  loading: boolean;
  generation: number;
} {
  const [generation, setGeneration] = useState(lemmaDictionaryGeneration);

  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeLemmaDictionary(() => setGeneration(lemmaDictionaryGeneration()));
    void ensureLemmaDictionary().then(() => setGeneration(lemmaDictionaryGeneration()));
    return unsubscribe;
  }, [active]);

  const state = getLemmaDictionaryState();
  return { ready: state === "ready", loading: state === "loading", generation };
}
