/**
 * Language-gated lemma sources (SPEC-CONCORDANCE-LANGUAGE LEX-1).
 * OSTA Old Spanish dictionary applies only to SPN witnesses — never to PRT/GAL/CAT/LAT.
 */
import { lookupHsmsLemma } from "@/utils/hsmsDictionary";
import type { WitnessLanguage } from "@/utils/witnessLanguage";

export interface LemmaLookupResult {
  lemma: string;
  sourceId: string;
  sourceVersion: string;
  isFallback: boolean;
}

export interface LemmaSource {
  id: string;
  version: string;
  languages: readonly WitnessLanguage[];
  load(): Promise<void>;
  lookup(surfaceForm: string): LemmaLookupResult | null;
}

class LemmaRegistry {
  private sources = new Map<string, LemmaSource>();

  register(source: LemmaSource): void {
    this.sources.set(source.id, source);
  }

  /** First registered source that claims `lang` (deterministic insertion order). */
  getSourceForLanguage(lang: WitnessLanguage): LemmaSource | null {
    for (const source of this.sources.values()) {
      if (source.languages.includes(lang)) return source;
    }
    return null;
  }

  listSources(): LemmaSource[] {
    return [...this.sources.values()];
  }
}

export const lemmaSourceRegistry = new LemmaRegistry();

const OSTA_ID = "osta-old-spanish";
const OSTA_VERSION = "v2.0";

lemmaSourceRegistry.register({
  id: OSTA_ID,
  version: OSTA_VERSION,
  languages: ["SPN"],
  async load() {
    // Lazy load via SPEC-LIGHTWEIGHT (`ensureLemmaDictionary` / useLemmaDictionary).
  },
  lookup(surfaceForm: string): LemmaLookupResult | null {
    const lemma = lookupHsmsLemma(surfaceForm);
    if (!lemma) return null;
    return {
      lemma,
      sourceId: OSTA_ID,
      sourceVersion: OSTA_VERSION,
      isFallback: false,
    };
  },
});
