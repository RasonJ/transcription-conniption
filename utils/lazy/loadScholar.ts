/**
 * Typed dynamic-import loaders for Tier 1 (scholar) modules — SPEC-LIGHTWEIGHT LW-2.
 * Tier 0 code reaches Tier 1 only through these functions (enforced by scripts/check-tiers.ts).
 */
export type ConcordanceModule = typeof import("../concordance");
export type CopilotSearchModule = typeof import("../manuscriptSearch");
export type CopilotVectorIndexModule = typeof import("../manuscriptVectorIndex");
export type CopilotModule = typeof import("../copilot/ask");
export type HsmsDictionaryModule = typeof import("../hsmsDictionary");

export function loadConcordance(): Promise<ConcordanceModule> {
  return import("../concordance");
}

export function loadHsmsDictionary(): Promise<HsmsDictionaryModule> {
  return import("../hsmsDictionary");
}

export function loadCopilotSearch(): Promise<CopilotSearchModule> {
  return import("../manuscriptSearch");
}

export function loadCopilotVectorIndex(): Promise<CopilotVectorIndexModule> {
  return import("../manuscriptVectorIndex");
}

export function loadCopilotAsk(): Promise<CopilotModule> {
  return import("../copilot/ask");
}

export async function loadCopilot(): Promise<{
  search: CopilotSearchModule;
  vectorIndex: CopilotVectorIndexModule;
}> {
  const [search, vectorIndex] = await Promise.all([loadCopilotSearch(), loadCopilotVectorIndex()]);
  return { search, vectorIndex };
}

/** UI panels (rendered through React.lazy in components/lazy/ScholarPanels.tsx). */
export function loadConcordanceDrawer() {
  return import("../../components/ConcordanceDrawer");
}

export function loadManuscriptChatbotDrawer() {
  return import("../../components/ManuscriptChatbotDrawer");
}

export function loadIngestPanel() {
  return import("../../components/ingest/IngestPanel");
}
