import { askCopilot } from "../utils/copilot/ask";
import {
  executePrecompiledChain,
  listPrecompiledChains,
  matchPrecompiledIntent,
  parseExampleTemplate,
  precompileChainsFromGraph,
} from "../utils/copilot/precompiledChains";
import { emptyReasoningGraph } from "../utils/reasoningGraph/builder";
import { parseCopilotSample } from "./copilotFixture";

describe("precompiled intent chains", () => {
  it("lists seed controversy / barrier / prerequisite chains", () => {
    const ids = listPrecompiledChains().map((c) => c.intentId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "analyze:controversy:explain",
        "validate:barrier:repair_flow",
        "learn:prerequisite:pathway",
        "analyze:paleography:drop_initials",
        "analyze:scribal_hands:non_original",
        "validate:codex:nonsequitur",
        "analyze:damage:clobbered_claims",
      ]),
    );
  });

  it("parses {slot|default} templates", () => {
    const t = parseExampleTemplate("why is folio {folio_id|3v} blocked from export");
    expect(t.slots).toEqual(["folio_id"]);
    expect(t.defaults.folio_id).toBe("3v");
    const m = "why is folio 12r blocked from export".match(t.pattern);
    expect(m?.[1]).toBe("12r");
  });

  it("matches barrier repair queries deterministically", () => {
    const hit = matchPrecompiledIntent("why is folio 3v blocked from export");
    expect(hit?.chain.intentId).toBe("validate:barrier:repair_flow");
    expect(hit?.slots.folio_id).toBe("3v");
    const exec = executePrecompiledChain(hit!.chain, hit!.slots);
    expect(exec.navigate?.folioId).toBe("3v");
    expect(exec.steps).toHaveLength(4);
    expect(exec.doActions).toContain("PASS_TWO_REPAIR");
  });

  it("matches controversy and prerequisite pathways", () => {
    expect(matchPrecompiledIntent("is there a debate about catchwords")?.chain.intentId).toBe(
      "analyze:controversy:explain",
    );
    expect(
      matchPrecompiledIntent("what should I read before studying paleography")?.chain.intentId,
    ).toBe("learn:prerequisite:pathway");
    expect(matchPrecompiledIntent("text clobbered by damage on folio 2r")?.chain.intentId).toBe(
      "analyze:damage:clobbered_claims",
    );
    expect(matchPrecompiledIntent("show drop initials on folio 3r")?.chain.intentId).toBe(
      "analyze:paleography:drop_initials",
    );
  });

  it("precompiles bound chains from a reasoning graph", () => {
    const g = emptyReasoningGraph();
    g.nodes.push(
      {
        id: "FAQ:x",
        type: "FrequentQuestion",
        attributes: { canonical_text: "Are catchwords reliable?" },
      },
      { id: "ANS:x", type: "AnswerSnippet", attributes: { answer_text: "Sometimes." } },
      { id: "MANUSCRIPT:a", type: "Manuscript", attributes: { title: "A" } },
      { id: "MANUSCRIPT:b", type: "Manuscript", attributes: { title: "B" } },
      {
        id: "BARRIER:EMPTY",
        type: "AdministrativeBarrierNode",
        attributes: { folioId: "3v" },
      },
      { id: "CONCEPT:c", type: "Concept", attributes: { canonical_name: "catchwords" } },
      { id: "CONCEPT:p", type: "Concept", attributes: { canonical_name: "paleography" } },
    );
    g.edges.push(
      { source: "FAQ:x", target: "ANS:x", relation: "answered_by" },
      { source: "FAQ:x", target: "MANUSCRIPT:a", relation: "supported_by_manuscript" },
      { source: "MANUSCRIPT:a", target: "MANUSCRIPT:b", relation: "refuted" },
      { source: "MANUSCRIPT:a", target: "BARRIER:EMPTY", relation: "stalled_by_barrier" },
      { source: "CONCEPT:p", target: "CONCEPT:c", relation: "prerequisite_for" },
    );
    const chains = precompileChainsFromGraph(g, { dagHash: "test" });
    expect(chains.map((c) => c.intentId)).toEqual(
      expect.arrayContaining([
        "analyze:controversy:explain",
        "validate:barrier:repair_flow",
        "learn:prerequisite:pathway",
      ]),
    );
    const controversy = chains.find((c) => c.intentId === "analyze:controversy:explain")!;
    expect(controversy.precompiled_chain[0]?.bound_node_id).toBe("ANS:x");
    expect(controversy.source_graph_hash).toBe("test");
  });

  it("askCopilot short-circuits to a precompiled chain", () => {
    const parsed = parseCopilotSample();
    const ans = askCopilot("clear export barriers for 3v", parsed);
    expect(ans.taxonomyId).toBe("validate:barrier:repair_flow");
    expect(ans.precompiledChain?.steps.length).toBe(4);
    expect(ans.navigate?.folioId).toBe("3v");
    expect(ans.method).toMatch(/Precompiled intent chain/i);
  });
});
