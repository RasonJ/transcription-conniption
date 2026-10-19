import {
  annotateClaim,
  annotateCounterfactualIntervention,
  annotateLayExplanation,
  annotateManuscriptBarrier,
  clearManuscriptBarrier,
  computeReasoningDagHash,
  discourseThread,
  linkCoauthors,
  linkMentorship,
  linkRebuttal,
  linkReplyToRebuttal,
  seedFromWitness,
} from "../utils/reasoningGraph";
import { parseCopilotSample } from "./copilotFixture";

describe("reasoning graph Manuscript / Author anchors", () => {
  const parsed = parseCopilotSample();

  it("seeds Manuscript with bibliographic, lay, and epistemic attributes", () => {
    const g = seedFromWitness(parsed, {
      witnessId: "WITNESS:demo",
      manuscript: {
        lay_summary: "A short demo witness for copilot tests.",
        key_takeaway: "Demonstrates folio + claim linking.",
        reading_comprehension_level: "General Public",
      },
    });
    const ms = g.nodes.find((n) => n.type === "Manuscript");
    expect(ms).toBeTruthy();
    expect(ms!.attributes.manuscript_id).toBe("MANUSCRIPT:WITNESS:demo");
    expect(ms!.attributes.field_of_study).toEqual(
      expect.arrayContaining(["Philology", "Paleography"]),
    );
    expect(ms!.attributes.lay_summary).toContain("demo witness");
    expect(ms!.attributes.glossary_terms).toEqual(
      expect.arrayContaining([expect.objectContaining({ term: "folio" })]),
    );
    expect(ms!.attributes.retraction_flag).toBe(false);
    expect(g.dag_hash).toHaveLength(64);
    expect(computeReasoningDagHash(g)).toBe(g.dag_hash);
  });

  it("seeds Author with identity and expertise profile", () => {
    const g = seedFromWitness(parsed, {
      witnessId: "WITNESS:demo",
      authorAttrs: {
        orcid: "0000-0002-1825-0097",
        primary_affiliation: "HSMS Project",
        lay_expertise_summary: "Philologist of Iberian witnesses.",
        science_communicator_flag: true,
      },
    });
    const author = g.nodes.find((n) => n.type === "Author");
    expect(author).toBeTruthy();
    expect(author!.attributes.full_name).toBeTruthy();
    expect(author!.attributes.orcid).toBe("0000-0002-1825-0097");
    expect(author!.attributes.science_communicator_flag).toBe(true);
    expect(g.edges.some((e) => e.relation === "authored")).toBe(true);
  });

  it("tracks claim_count and lay simplified_from bridges", () => {
    let g = seedFromWitness(parsed, { witnessId: "WITNESS:demo" });
    const msId = "MANUSCRIPT:WITNESS:demo";
    g = annotateClaim(g, {
      manuscriptId: msId,
      claimId: "catchword-quire",
      proposition: "Catchwords mark quire boundaries in this witness.",
      confidence: 0.9,
      epistemicStatus: "accepted",
      evidenceId: "folio-catchword",
      evidenceAttrs: {
        evidence_type: "philological_witness",
        source_locator: "fol. 1v catchword",
      },
      conceptName: "Catchword",
    });
    expect(g.nodes.find((n) => n.id === msId)!.attributes.claim_count).toBe(1);
    const claim = g.nodes.find((n) => n.type === "Claim")!;
    expect(claim.lod_tier).toBe("MACRO_REASONING");
    expect(claim.attributes.proposition_text).toContain("Catchwords");
    expect(claim.attributes.epistemic_status).toBe("accepted");
    expect(claim.attributes.certainty_degree).toBe(0.9);
    // confidence / consensus are edge-only (no node collision)
    expect(claim.attributes.confidence_score).toBeUndefined();
    expect(claim.attributes.consensus_status).toBeUndefined();
    const evidence = g.nodes.find((n) => n.type === "Evidence")!;
    expect(evidence.attributes.evidence_type).toBe("philological_witness");
    const support = g.edges.find((e) => e.relation === "supports_claim")!;
    expect(support.source_type).toBe("Evidence");
    expect(support.target_type).toBe("Claim");
    const containsClaim = g.edges.find(
      (e) => e.relation === "contains" && e.target === claim.id,
    )!;
    expect(containsClaim.properties?.confidence_score).toBe(0.9);
    expect(containsClaim.properties?.consensus_status).toBe("settled_consensus");
    g = annotateLayExplanation(g, {
      sourceId: msId,
      explanationId: "catchword-lay",
      analogyText: "Think of catchwords as page numbers that help booksellers assemble quires.",
      readingLevel: "General Public",
    });
    expect(g.edges.some((e) => e.relation === "translates_to_lay")).toBe(true);
    expect(g.edges.some((e) => e.relation === "simplified_from")).toBe(true);
  });
});

describe("discourse & barrier surgery", () => {
  const parsed = parseCopilotSample();

  it("builds a rebuttal → reply discourse thread", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g.nodes.push({
      id: "MANUSCRIPT:rebuttal",
      type: "Manuscript",
      lod_tier: "MACRO_REASONING",
      attributes: { title: "Rebuttal", manuscript_id: "MANUSCRIPT:rebuttal" },
    });
    g.nodes.push({
      id: "MANUSCRIPT:reply",
      type: "Manuscript",
      lod_tier: "MACRO_REASONING",
      attributes: { title: "Author Reply", manuscript_id: "MANUSCRIPT:reply" },
    });
    g = linkRebuttal(g, "MANUSCRIPT:rebuttal", "MANUSCRIPT:W1", {
      pointOfContention: "methodology",
    });
    g = linkReplyToRebuttal(g, "MANUSCRIPT:reply", "MANUSCRIPT:rebuttal");
    expect(discourseThread(g, "MANUSCRIPT:W1")).toEqual([
      "MANUSCRIPT:W1",
      "MANUSCRIPT:rebuttal",
      "MANUSCRIPT:reply",
    ]);
    const rebuts = g.edges.find((e) => e.relation === "rebuts")!;
    expect(rebuts.source_type).toBe("Manuscript");
    expect(rebuts.target_type).toBe("Manuscript");
  });

  it("tags MACRO vs MICRO LOD tiers on seed", () => {
    const g = seedFromWitness(parsed, { witnessId: "W:lod", spatial: "shallow" });
    expect(g.nodes.find((n) => n.type === "Manuscript")!.lod_tier).toBe("MACRO_REASONING");
    const micro = g.nodes.filter((n) => n.lod_tier === "MICRO_PHILOLOGICAL");
    expect(micro.length).toBeGreaterThan(0);
    expect(micro.every((n) => ["Folio", "Column", "Block", "Line", "Token"].includes(n.type))).toBe(
      true,
    );
  });

  it("links mentorship and coauthorship", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g.nodes.push({
      id: "AUTHOR:mentor",
      type: "Author",
      attributes: { full_name: "Mentor" },
    });
    const mentee = g.nodes.find((n) => n.type === "Author")!;
    g = linkMentorship(g, "AUTHOR:mentor", mentee.id, "PhD_Advisor", "Salamanca");
    g = linkCoauthors(g, "AUTHOR:mentor", mentee.id, { collaborationCount: 3 });
    expect(g.edges.some((e) => e.relation === "mentored")).toBe(true);
    expect(g.edges.some((e) => e.relation === "coauthored_with")).toBe(true);
    expect(mentee.attributes.mentorship_links).toContain("AUTHOR:mentor");
  });

  it("annotates barriers and clears them with Pearlian do(X)", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g = annotateManuscriptBarrier(g, {
      witnessId: "W1",
      barrierType: "EMPTY_COLUMN_ENVELOPE",
      folioId: "1r",
    });
    expect(g.nodes.some((n) => n.type === "AdministrativeBarrierNode")).toBe(true);
    expect(g.edges.some((e) => e.relation === "stalled_by_barrier")).toBe(true);

    const cf = annotateCounterfactualIntervention(g, {
      witnessId: "W1",
      doAction: "BYPASS_EMPTY_COLUMN_ENVELOPE",
      estimatedDaysSaved: 1,
      expectedNetRoi: 0.9,
    });
    expect(cf.mutilatedEdgeCount).toBeGreaterThan(0);
    expect(cf.dagHash).toHaveLength(64);

    g = clearManuscriptBarrier(g, {
      witnessId: "W1",
      barrierType: "EMPTY_COLUMN_ENVELOPE",
      doAction: "RUN_LINT",
    });
    expect(g.edges.some((e) => e.relation === "bypasses_barrier")).toBe(true);
    const barrier = g.nodes.find((n) => n.type === "AdministrativeBarrierNode")!;
    expect(barrier.attributes.status).toBe("BYPASSED");
  });
});
