import {
  barriersForStage,
  doActionsForRecipe,
  intentsForStage,
  isActionBlocked,
  lifecycleOrder,
  taxonomyIntent,
  taxonomyIntentIdForRecipe,
} from "../utils/copilot/lifecycle";

describe("HSMS intent taxonomy / lifecycle", () => {
  it("exposes the six scriptorium stages in order", () => {
    expect(lifecycleOrder()).toEqual([
      "INGEST",
      "VALIDATE",
      "EDIT",
      "ANALYZE",
      "EXPORT",
      "LIBRARY",
    ]);
  });

  it("maps recipes to domain:entity:action ids", () => {
    expect(taxonomyIntentIdForRecipe("stats.term_frequency")).toBe("analyze:stats:term_frequency");
    expect(taxonomyIntentIdForRecipe("nav.folio")).toBe("edit:folio:navigate");
    expect(doActionsForRecipe("search.kwic")).toEqual(
      expect.arrayContaining(["OPEN_CONCORDANCE", "JUMP_FOLIO"]),
    );
  });

  it("filters intents by stage and inspects barriers", () => {
    const validate = intentsForStage("VALIDATE");
    expect(validate.some((id) => id.startsWith("ingest:"))).toBe(true);
    expect(validate.some((id) => id.startsWith("analyze:"))).toBe(false);

    const barriers = barriersForStage("VALIDATE");
    expect(barriers.map((b) => b.id)).toContain("EMPTY_COLUMN_ENVELOPE");
    expect(isActionBlocked("EXPORT_TEI", ["EMPTY_COLUMN_ENVELOPE"])).toBe(true);
    expect(isActionBlocked("JUMP_FOLIO", ["EMPTY_COLUMN_ENVELOPE"])).toBe(false);
  });

  it("loads slot legend intents with examples", () => {
    const intent = taxonomyIntent("analyze:stats:term_frequency");
    expect(intent?.slots).toContain("word");
    expect(intent?.examples?.length).toBeGreaterThan(0);
  });
});
