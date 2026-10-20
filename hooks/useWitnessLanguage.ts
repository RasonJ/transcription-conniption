/**
 * Witness-language hook (SPEC-I18N) — isolated from UI locale.
 */
import { useMemo } from "react";
import type { ParsedManuscript } from "@/constants/manuscript";
import {
  detectWitnessLanguage,
  type WitnessLanguage,
  type WitnessLanguageGuess,
  witnessCollator,
  stopwordsFor,
} from "@/utils/witnessLanguage";

export function useWitnessLanguage(
  parsed: ParsedManuscript | null | undefined,
  override?: WitnessLanguage,
): {
  language: WitnessLanguage;
  guess: WitnessLanguageGuess;
  compare: (a: string, b: string) => number;
  stopwords: ReadonlySet<string>;
} {
  const guess = useMemo(
    () =>
      parsed
        ? detectWitnessLanguage(parsed)
        : { language: "SPN" as const, confidence: 0, sampled: 0 },
    [parsed],
  );
  const language = override ?? guess.language;
  const compare = useMemo(() => witnessCollator(language), [language]);
  const stopwords = useMemo(() => stopwordsFor(language), [language]);
  return { language, guess, compare, stopwords };
}
