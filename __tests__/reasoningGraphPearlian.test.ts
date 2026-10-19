import {
  annotateDoIntervention,
  annotateDamageRegion,
  annotateExpansionDetail,
  annotateProvenanceEvent,
  ensureNodeUris,
  linkCausalInfluence,
  linkConfounds,
  linkMediates,
  linkVariantForm,
  makeNodeUri,
  REASONING_GRAPH_SCHEMA_VERSION,
  seedFromWitness,
  stampEdgeValidity,
  upsertCausalVariable,
} from "../utils/reasoningGraph";
import { parseCopilotSample } from "./copilotFixture";

describe("reasoning graph Pearlian / temporal / spatial / philology", () => {
  const parsed = parseCopilotSample();

  it("emits schema_version 1.0 and URIs on seed", () => {
    const g = seedFromWitness(parsed, { witnessId: "W:v11" });
    expect(g.schema_version).toBe("1.0");
    expect(REASONING_GRAPH_SCHEMA_VERSION).toBe("1.0");
    const ms = g.nodes.find((n) => n.type === "Manuscript")!;
    expect(ms.uri).toMatch(/^urn:hsms:manuscript:/);
    expect(makeNodeUri("Line", "TRS", "1v", 3)).toBe("urn:hsms:line:trs:1v:3");
  });

  it("builds a confounder → treatment/outcome DAG with do(X) SEM fields", () => {
    let g = seedFromWitness(parsed, { witnessId: "W:causal" });
    const msId = "MANUSCRIPT:W:causal";
    g = upsertCausalVariable(g, "Confounder", "CONF:scriptorium_practice", {
      label: "Scriptorium practice",
      variable_name: "X_confound",
    });
    g = upsertCausalVariable(g, "OutcomeVariable", "OUT:line_survival", {
      label: "Line survival",
      variable_name: "Y",
    });
    g = upsertCausalVariable(g, "Mediator", "MED:erasure", {
      label: "Scribal erasure",
      variable_name: "M",
    });
    g = linkConfounds(g, "CONF:scriptorium_practice", msId, "OUT:line_survival");
    g = linkMediates(g, "MED:erasure", msId, "OUT:line_survival");
    g = linkCausalInfluence(g, msId, "OUT:line_survival", {
      valid_from: "s. XIV",
      valid_until: "c. 1500",
    });
    g = annotateDoIntervention(g, {
      manuscriptId: msId,
      doAction: "PREVENT_ERASURE",
      intervenedVariable: "scribe_H2_erasure",
      treatmentValue: 0,
      counterfactualState: "What if scribe H2 had not erased line 12?",
      backdoorAdjusted: true,
      estimatedDaysSaved: 2,
    });

    expect(g.nodes.some((n) => n.type === "Confounder")).toBe(true);
    expect(g.nodes.some((n) => n.type === "Mediator")).toBe(true);
    expect(g.edges.some((e) => e.relation === "confounds")).toBe(true);
    expect(g.edges.some((e) => e.relation === "mediates")).toBe(true);
    const cf = g.nodes.find((n) => n.type === "CounterfactualIntervention")!;
    expect(cf.attributes.intervened_variable).toBe("scribe_H2_erasure");
    expect(cf.attributes.backdoor_adjusted).toBe(true);
    expect(cf.attributes.counterfactual_state).toContain("scribe H2");
    const influence = g.edges.find(
      (e) =>
        e.relation === "causally_influences" &&
        e.source === msId &&
        e.target === "OUT:line_survival",
    )!;
    expect(influence.properties?.valid_from).toBe("s. XIV");
  });

  it("annotates provenance Events with performed_event / affected_target", () => {
    let g = seedFromWitness(parsed, { witnessId: "W:prov" });
    g.nodes.push({
      id: "AGENT:binder",
      type: "Agent",
      attributes: { name: "Binder", type: "editor" },
    });
    g = annotateProvenanceEvent(g, {
      eventId: "rebinding-1480",
      subtype: "Rebinding",
      agentId: "AGENT:binder",
      targetId: "MANUSCRIPT:W:prov",
      dateFuzzy: "c. 1480",
      place: "Lisbon",
    });
    expect(g.nodes.some((n) => n.type === "Event" && n.attributes.subtype === "Rebinding")).toBe(
      true,
    );
    expect(g.edges.some((e) => e.relation === "performed_event")).toBe(true);
    expect(g.edges.some((e) => e.relation === "affected_target")).toBe(true);
  });

  it("links DamageRegion clobbers_text and VariantForm → LemmaNode", () => {
    let g = seedFromWitness(parsed, { witnessId: "W:dmg" });
    g.nodes.push({
      id: "TOKEN:1r:1:fag'o",
      type: "Token",
      attributes: { raw: "fag'o" },
    });
    g.nodes.push({
      id: "LEMMA:facio",
      type: "LemmaNode",
      attributes: { lemma: "facio" },
    });
    g = annotateDamageRegion(g, {
      damageId: "wormhole-1r",
      damageType: "wormhole",
      clobbers: ["TOKEN:1r:1:fag'o"],
      boundingBox: { x: 10, y: 20, width: 30, height: 12 },
      polygon: [
        [10, 20],
        [40, 20],
        [40, 32],
        [10, 32],
      ],
      severity: 0.8,
    });
    g = linkVariantForm(g, {
      tokenId: "TOKEN:1r:1:fag'o",
      surface: "fag'o",
      lemmaId: "facio",
      orthographicClass: "scribal_g_for_c",
    });
    g = annotateExpansionDetail(g, "EXP:q~", {
      abbreviation_type: "suspension",
      graphemic_source: "q~ → que",
      suppliedText: "que",
    });

    const dmg = g.nodes.find((n) => n.type === "DamageRegion")!;
    expect(dmg.attributes.boundingBox).toEqual({ x: 10, y: 20, width: 30, height: 12 });
    expect(g.edges.some((e) => e.relation === "clobbers_text")).toBe(true);
    expect(g.edges.some((e) => e.relation === "has_variant_form")).toBe(true);
    expect(g.edges.some((e) => e.relation === "standardized_to")).toBe(true);
    const exp = g.nodes.find((n) => n.id === "EXP:q~")!;
    expect(exp.attributes.abbreviation_type).toBe("suspension");
  });

  it("stamps edge validity and backfills missing URIs", () => {
    let g = seedFromWitness(parsed, { witnessId: "W:uri" });
    const authored = g.edges.find((e) => e.relation === "authored");
    expect(authored).toBeTruthy();
    g = stampEdgeValidity(
      g,
      authored!.source,
      authored!.target,
      "authored",
      "s. XV",
      "c. 1600",
    );
    const stamped = g.edges.find((e) => e.relation === "authored")!;
    expect(stamped.properties?.valid_from).toBe("s. XV");
    expect(stamped.properties?.valid_until).toBe("c. 1600");

    g.nodes.push({
      id: "LEGACY:no-uri",
      type: "Concept",
      attributes: { label: "legacy" },
    });
    g = ensureNodeUris(g);
    expect(g.nodes.every((n) => typeof n.uri === "string" && n.uri.startsWith("urn:hsms:"))).toBe(
      true,
    );
  });
});
