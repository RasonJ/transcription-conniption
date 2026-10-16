/**
 * Typed dynamic-import loaders for Tier 1 (scholar) modules — SPEC-LIGHTWEIGHT LW-2.
 * Tier 0 code reaches Tier 1 only through these functions (enforced by scripts/check-tiers.ts).
 */
// Module-level loaders (concordance, copilot/ask, search…) were removed: each extra
// `import()` of a module the panels also load makes Metro move that module into the
// eagerly loaded `__common` web chunk. Tier 1 code is reached only through the panels.

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
