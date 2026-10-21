import type { WordOccurrence } from "@/constants/manuscript";

export function createMockOccurrence(overrides?: Partial<WordOccurrence>): WordOccurrence {
  return {
    folioId: "1r",
    lineNumber: "1",
    blockIndex: 0,
    preContext: "",
    postContext: "",
    keyword: "hit",
    ...overrides,
  };
}
