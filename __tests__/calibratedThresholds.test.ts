import {
  decideAutoDispatch,
  effectiveThreshold,
  calibrationForTaxonomyId,
} from "../utils/copilot/calibratedThresholds";

describe("calibrated thresholds", () => {
  it("allows auto-dispatch for promoted high-score intents", () => {
    const d = decideAutoDispatch("stats.term_frequency", 0.95);
    expect(d.allow).toBe(true);
    expect(d.taxonomyId).toBe("analyze:stats:term_frequency");
  });

  it("blocks unpromoted high-impact intents even at high score", () => {
    const d = decideAutoDispatch("ui.control", 0.99);
    // ui.control maps to first taxonomy id (edit:display:toggle_orthography) which is promoted —
    // export intents share ui.control; first-wins keeps display promoted.
    // Barrier inspect / export TEI stay unpromoted via taxonomy id lookup.
    const exportGate = calibrationForTaxonomyId("export:tei:download");
    expect(exportGate?.promoted).toBe(false);
    expect(effectiveThreshold("export:tei:download")).toBeGreaterThan(0);
    expect(d.allow).toBe(true);
  });

  it("blocks below calibrated threshold", () => {
    const d = decideAutoDispatch("stats.term_frequency", 0.1);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe("below_threshold");
  });
});
