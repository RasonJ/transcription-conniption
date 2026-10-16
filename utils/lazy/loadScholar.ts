export type ConcordanceModule = typeof import("../concordance");
export type CopilotSearchModule = typeof import("../manuscriptSearch");
export type CopilotVectorIndexModule = typeof import("../manuscriptVectorIndex");

export function loadConcordance(): Promise<ConcordanceModule> {
  return import("../concordance");
}

export function loadCopilotSearch(): Promise<CopilotSearchModule> {
  return import("../manuscriptSearch");
}

export function loadCopilotVectorIndex(): Promise<CopilotVectorIndexModule> {
  return import("../manuscriptVectorIndex");
}

export async function loadCopilot(): Promise<{
  search: CopilotSearchModule;
  vectorIndex: CopilotVectorIndexModule;
}> {
  const [search, vectorIndex] = await Promise.all([loadCopilotSearch(), loadCopilotVectorIndex()]);
  return { search, vectorIndex };
}
