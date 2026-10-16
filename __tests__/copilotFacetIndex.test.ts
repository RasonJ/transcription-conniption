import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { hapaxCount, standardizedTtr, typeTokenRatio, wordStats } from "../utils/copilot/stats";
import { COPILOT_SAMPLE, parseCopilotSample } from "./copilotFixture";

describe("copilot facet index", () => {
  const parsed = parseCopilotSample();
  const facets = buildFacetIndex(parsed);

  it("counts token types and folio ids", () => {
    expect(facets.folioIds).toEqual(["1r", "1v"]);
    expect(facets.tokenTypeCounts.get("scribal_deletion")?.total).toBe(3);
    expect(facets.tokenTypeCounts.get("editorial_deletion")?.total).toBe(1);
    expect(facets.tokenTypeCounts.get("scribal_deletion")?.byFolio.get("1v")).toBe(2);
  });

  it("indexes hands, including hand markers inside reconstructed text", () => {
    expect(facets.handRefs.get("2")?.length).toBe(2);
    expect(facets.handRefs.get("3")?.length).toBe(1);
  });

  it("builds the initial depth histogram", () => {
    expect(facets.initialDepth.get(3)?.length).toBe(1);
    expect(facets.initialDepth.get(2)?.length).toBe(1);
  });

  it("counts block types and language spans", () => {
    expect(facets.blockTypeCounts.get("gloss")).toBe(2);
    expect(facets.blockTypeCounts.get("addendum")).toBe(1);
    expect(facets.blockTypeCounts.get("rubric")).toBe(1);
    const lat = facets.languageSpans.get("LAT");
    expect(lat?.words).toBe(3);
    expect(lat?.spans.length).toBe(1);
  });

  it("records catchword/signature presence per folio", () => {
    expect(facets.folios.get("1r")).toMatchObject({ hasCatchword: false, hasSignature: false });
  });

  it("caches by object reference and by source identity", () => {
    expect(buildFacetIndex(parsed)).toBe(facets);
    const a = buildFacetIndex(parseCopilotSample(), { sourceText: COPILOT_SAMPLE });
    const b = buildFacetIndex(parseCopilotSample(), { sourceText: COPILOT_SAMPLE });
    expect(b).toBe(a);
    expect(a.witnessHash).toContain(":");
  });

  it("produces a stable content hash without source text", () => {
    const again = buildFacetIndex(parseCopilotSample());
    expect(again.witnessHash).toBe(facets.witnessHash);
  });
});

describe("copilot stats", () => {
  it("computes TTR and hapax", () => {
    const words = ["Rey", "rey", "dixo", "el", "rey", "luego"];
    expect(typeTokenRatio(words)).toBeCloseTo(4 / 6);
    expect(hapaxCount(words)).toBe(3);
    expect(wordStats(words)).toMatchObject({ tokens: 6, types: 4, hapax: 3, disLegomena: 0 });
  });

  it("falls back to raw TTR below the STTR window", () => {
    expect(standardizedTtr(["a", "b", "a"], 1000)).toBeCloseTo(2 / 3);
  });

  it("averages TTR across full windows", () => {
    expect(standardizedTtr(["a", "b", "a", "a"], 2)).toBeCloseTo(0.75);
  });

  it("handles empty input", () => {
    expect(typeTokenRatio([])).toBe(0);
  });
});
