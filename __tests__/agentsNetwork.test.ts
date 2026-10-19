import {
  glossRefutations,
  influenceChain,
  linkComposedGlossOn,
  linkRefuted,
  manuscriptsOnInfluencePathTo,
  patronageClusters,
  seedDemoAgentNetwork,
  seedFromWitness,
  upsertAgent,
} from "../utils/reasoningGraph";
import { parseCopilotSample } from "./copilotFixture";

describe("Agent intellectual & social network", () => {
  const parsed = parseCopilotSample();

  it("upserts Agent nodes and influence / patronage edges", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1", spatial: "shallow" });
    g = seedDemoAgentNetwork(g);

    expect(g.nodes.filter((n) => n.type === "Agent").length).toBeGreaterThanOrEqual(4);
    expect(g.nodes.some((n) => n.type === "Work")).toBe(true);
    expect(g.edges.some((e) => e.relation === "influenced_by")).toBe(true);
    expect(g.edges.some((e) => e.relation === "translated")).toBe(true);
    expect(g.edges.some((e) => e.relation === "dedicated_work_to")).toBe(true);
    expect(g.edges.some((e) => e.relation === "patronized")).toBe(true);
    expect(g.edges.some((e) => e.relation === "attributed_to")).toBe(true);

    const nunes = g.nodes.find((n) => n.attributes.name === "Pedro Nunes");
    expect(nunes?.attributes.type).toBe("author");
    expect(nunes?.attributes.flourishedPeriod).toMatch(/1502/);
  });

  it("walks influence chains to classical sources", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1", spatial: false });
    g = seedDemoAgentNetwork(g);

    const chains = influenceChain(g, "Pedro Nunes", 3);
    expect(chains.some((p) => p.some((id) => id.includes("aristotle")))).toBe(true);

    const hits = manuscriptsOnInfluencePathTo(g, "Pedro Nunes", "Aristotle");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.manuscriptId).toBe("MANUSCRIPT:W1");
  });

  it("detects gloss refutation and patronage clusters", () => {
    let g = seedFromWitness(parsed, { witnessId: "W1", spatial: "shallow" });
    g = seedDemoAgentNetwork(g);
    g = upsertAgent(g, { name: "Commentator X", type: "commentator" });
    const glossBlock = g.nodes.find((n) => n.type === "Block" && n.attributes.type === "gloss");
    if (glossBlock) {
      g = linkComposedGlossOn(g, "Commentator X", glossBlock.id);
    } else {
      g.nodes.push({
        id: "BLOCK:W1:gloss-demo",
        type: "Block",
        attributes: { type: "gloss", language: "LAT" },
      });
      g = linkComposedGlossOn(g, "Commentator X", "BLOCK:W1:gloss-demo");
    }
    g = linkRefuted(g, "Commentator X", "Pedro Nunes", { pointOfContention: "methodology" });

    const refs = glossRefutations(g);
    expect(refs.some((r) => r.glossAuthor.includes("commentator") && r.bodyAuthor.includes("pedro"))).toBe(
      true,
    );

    const clusters = patronageClusters(g);
    expect(clusters.some((c) => c.patronId.includes("luís") || c.patronId.includes("luis"))).toBe(true);
  });
});
