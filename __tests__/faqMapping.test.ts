import {
  answerFrequentQuestion,
  matchFrequentQuestions,
  registerFrequentQuestion,
  resolveFaqAnswer,
  seedFromWitness,
  seedHsmsFaqBundle,
} from "../utils/reasoningGraph";
import { parseCopilotSample } from "./copilotFixture";

describe("FAQ question-mapping layer", () => {
  const parsed = parseCopilotSample();

  it("registers FrequentQuestion with answered_by → AnswerSnippet → manuscript provenance", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g = registerFrequentQuestion(g, {
      questionId: "sample-size",
      canonicalText: "What is the sample size of this study?",
      alternatePhrasings: ["how many participants", "n equals"],
      targetAudience: "scholar",
      manuscriptId: "MANUSCRIPT:W1",
      answerText: "This witness has no clinical sample size; folio count is the scope indicator.",
      readingLevel: "undergraduate",
      consensusStatus: "settled_consensus",
      relevanceScore: 0.88,
    });

    expect(g.nodes.some((n) => n.type === "FrequentQuestion")).toBe(true);
    expect(g.nodes.some((n) => n.type === "AnswerSnippet")).toBe(true);
    expect(g.edges.some((e) => e.relation === "answered_by")).toBe(true);
    expect(g.edges.some((e) => e.relation === "supported_by_manuscript")).toBe(true);
  });

  it("matches alternate phrasings and resolves lay package with prerequisites", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g = seedHsmsFaqBundle(g);

    const matches = matchFrequentQuestions(g, "qué son los reclamos");
    expect(matches[0]?.questionId).toBe("FAQ:what-are-catchwords");
    expect(matches[0]?.score).toBeGreaterThan(0.5);

    const resolved = answerFrequentQuestion(g, "what are catchwords?");
    expect(resolved).toBeTruthy();
    expect(resolved!.answerText).toMatch(/quire/i);
    expect(resolved!.manuscriptIds).toContain("MANUSCRIPT:W1");
    expect(resolved!.conceptIds.some((id) => id.includes("Catchword"))).toBe(true);
    expect(resolved!.claimIds).toContain("CLAIM:catchword-quire");
    expect(resolved!.consensusStatus).toBe("settled_consensus");
    expect(resolved!.prerequisiteConceptIds.some((id) => id.includes("Foliation"))).toBe(true);
  });

  it("supports contested answers when manuscripts disagree", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g.nodes.push({
      id: "MANUSCRIPT:rival",
      type: "Manuscript",
      attributes: { title: "Rival edition", manuscript_id: "MANUSCRIPT:rival" },
    });
    g = registerFrequentQuestion(g, {
      questionId: "quire-count",
      canonicalText: "How many quires does this manuscript have?",
      manuscriptId: "MANUSCRIPT:W1",
      contestedManuscriptIds: ["MANUSCRIPT:rival"],
      answerText: "Estimates differ between catchword-inferred and formula-based collation.",
      consensusStatus: "actively_contested",
    });

    const r = resolveFaqAnswer(g, "FAQ:quire-count");
    expect(r?.contested).toBe(true);
    expect(r?.answerText).toMatch(/differ/i);
  });

  it("filters by target audience", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1" });
    g = seedHsmsFaqBundle(g);
    const lay = matchFrequentQuestions(g, "recto versus verso", { audience: "lay" });
    expect(lay[0]?.questionId).toBe("FAQ:recto-vs-verso");
    const scholarOnly = matchFrequentQuestions(g, "recto versus verso", { audience: "scholar" });
    expect(scholarOnly.every((m) => m.questionId !== "FAQ:recto-vs-verso")).toBe(true);
  });
});
