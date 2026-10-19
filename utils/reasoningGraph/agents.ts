/**
 * Agent / Person intellectual & social network — author↔author and agent↔work edges.
 */
import { computeReasoningDagHash } from "./hash";
import type {
  AgentAttributes,
  AgentRole,
  ReasoningEdgeProperties,
  ReasoningGraphDoc,
  ReasoningNode,
  ReasoningRelation,
  WorkAttributes,
} from "./types";

function utcNowIso(): string {
  return new Date().toISOString();
}

function clone(doc: ReasoningGraphDoc): ReasoningGraphDoc {
  return { ...doc, nodes: [...doc.nodes], edges: [...doc.edges] };
}

function finalize(doc: ReasoningGraphDoc): ReasoningGraphDoc {
  doc.dag_hash = computeReasoningDagHash(doc);
  return doc;
}

function upsertNode(doc: ReasoningGraphDoc, node: ReasoningNode): void {
  const idx = doc.nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) {
    doc.nodes[idx] = {
      ...doc.nodes[idx],
      ...node,
      attributes: { ...doc.nodes[idx].attributes, ...node.attributes },
    };
  } else doc.nodes.push(node);
}

function upsertEdge(
  doc: ReasoningGraphDoc,
  source: string,
  target: string,
  relation: ReasoningRelation,
  properties?: ReasoningEdgeProperties,
): void {
  const id = `E:${source}:${relation}:${target}`;
  const next = {
    id,
    source,
    target,
    relation,
    properties: { created_at: utcNowIso(), ...properties },
  };
  const idx = doc.edges.findIndex((e) => (e.id ?? `E:${e.source}:${e.relation}:${e.target}`) === id);
  if (idx >= 0) {
    doc.edges[idx] = {
      ...doc.edges[idx],
      ...next,
      properties: { ...doc.edges[idx].properties, ...next.properties },
    };
  } else doc.edges.push(next);
}

function agentNodeId(idOrName: string): string {
  if (idOrName.startsWith("AGENT:") || idOrName.startsWith("AUTHOR:") || idOrName.startsWith("AUTH-")) {
    return idOrName;
  }
  return `AGENT:${idOrName.toLowerCase().replace(/\s+/g, "_")}`;
}

function workNodeId(idOrTitle: string): string {
  if (idOrTitle.startsWith("WORK:")) return idOrTitle;
  return `WORK:${idOrTitle.toLowerCase().replace(/\s+/g, "_")}`;
}

/** Upsert a unified Agent / Person node. */
export function upsertAgent(
  graphDoc: ReasoningGraphDoc,
  attrs: AgentAttributes & { id?: string; name: string },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const id = agentNodeId(attrs.id ?? attrs.name);
  const next: AgentAttributes = {
    id,
    type: attrs.type ?? "author",
    ...attrs,
    name: attrs.name,
  };
  upsertNode(doc, { id, type: "Agent", attributes: next });
  // Mirror as Author when role is author (keeps existing Author-centric queries working).
  if ((next.type ?? "author") === "author") {
    upsertNode(doc, {
      id: id.replace(/^AGENT:/, "AUTHOR:"),
      type: "Author",
      attributes: {
        author_id: id,
        full_name: attrs.name,
        name: attrs.name,
        orcid: attrs.orcid,
        name_variants: attrs.name_variants,
      },
    });
  }
  return finalize(doc);
}

export function upsertWork(
  graphDoc: ReasoningGraphDoc,
  attrs: WorkAttributes & { title: string },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const id = workNodeId(attrs.id ?? attrs.title);
  upsertNode(doc, {
    id,
    type: "Work",
    attributes: { id, ...attrs, title: attrs.title },
  });
  return finalize(doc);
}

/** Agent A was influenced by Agent B. */
export function linkInfluencedBy(
  graphDoc: ReasoningGraphDoc,
  agentId: string,
  influencerId: string,
  opts?: {
    influenceType?: ReasoningEdgeProperties["influenceType"];
    degreeOfCertainty?: number;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(agentId), agentNodeId(influencerId), "influenced_by", {
    influenceType: opts?.influenceType ?? "conceptual",
    degreeOfCertainty: opts?.degreeOfCertainty ?? 0.7,
  });
  return finalize(doc);
}

/** Symmetric contemporary / court circle link. */
export function linkContemporaries(
  graphDoc: ReasoningGraphDoc,
  agentA: string,
  agentB: string,
  opts?: { sharedLocation?: string; timeWindow?: string },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const a = agentNodeId(agentA);
  const b = agentNodeId(agentB);
  const props: ReasoningEdgeProperties = {
    sharedLocation: opts?.sharedLocation,
    timeWindow: opts?.timeWindow,
  };
  upsertEdge(doc, a, b, "contemporary_of", props);
  upsertEdge(doc, b, a, "contemporary_of", props);
  return finalize(doc);
}

export function linkCorrespondedWith(
  graphDoc: ReasoningGraphDoc,
  agentA: string,
  agentB: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(agentA), agentNodeId(agentB), "corresponded_with", {});
  return finalize(doc);
}

/** Pedagogical: student studied under master (also stamps mentored reverse). */
export function linkStudiedUnder(
  graphDoc: ReasoningGraphDoc,
  studentId: string,
  masterId: string,
  institution?: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const student = agentNodeId(studentId);
  const master = agentNodeId(masterId);
  upsertEdge(doc, student, master, "studied_under", { institution, mentorship_role: "PhD_Advisor" });
  upsertEdge(doc, master, student, "mentored", { institution, mentorship_role: "PhD_Advisor" });
  return finalize(doc);
}

export function linkRefuted(
  graphDoc: ReasoningGraphDoc,
  criticId: string,
  targetId: string,
  opts?: { pointOfContention?: ReasoningEdgeProperties["point_of_contention"] },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const critic = agentNodeId(criticId);
  const target = agentNodeId(targetId);
  upsertEdge(doc, critic, target, "refuted", {
    point_of_contention: opts?.pointOfContention ?? "general",
    tone: "critical",
  });
  upsertEdge(doc, target, critic, "criticized_by", {
    point_of_contention: opts?.pointOfContention ?? "general",
  });
  return finalize(doc);
}

export function linkAuthoredWork(
  graphDoc: ReasoningGraphDoc,
  agentId: string,
  workId: string,
  opts?: { authorOrder?: ReasoningEdgeProperties["author_order"] },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(agentId), workNodeId(workId), "authored", {
    author_order: opts?.authorOrder ?? "1st_author",
  });
  return finalize(doc);
}

export function linkTranslatedWork(
  graphDoc: ReasoningGraphDoc,
  translatorId: string,
  workId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(translatorId), workNodeId(workId), "translated", {});
  return finalize(doc);
}

/** Manuscript attributed to an agent (scribe / author of the witness). */
export function linkAttributedTo(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  agentId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, agentNodeId(agentId), "attributed_to", {});
  return finalize(doc);
}

export function linkContainsWork(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  workId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, workNodeId(workId), "contains_work", {});
  return finalize(doc);
}

export function linkComposedGlossOn(
  graphDoc: ReasoningGraphDoc,
  agentId: string,
  blockId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(agentId), blockId, "composed_gloss_on", {});
  return finalize(doc);
}

export function linkPatronized(
  graphDoc: ReasoningGraphDoc,
  patronId: string,
  manuscriptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(patronId), manuscriptId, "patronized", {});
  return finalize(doc);
}

export function linkDedicatedWorkTo(
  graphDoc: ReasoningGraphDoc,
  authorId: string,
  dedicateeId: string,
  dedicationText?: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, agentNodeId(authorId), agentNodeId(dedicateeId), "dedicated_work_to", {
    dedication_text: dedicationText,
  });
  return finalize(doc);
}

// ── Query helpers (transmission, gloss refutation, patronage clusters) ─────────

/** Walk influenced_by chains from an agent up to `depth` hops. */
export function influenceChain(
  graphDoc: ReasoningGraphDoc,
  agentId: string,
  depth = 3,
): string[][] {
  const start = agentNodeId(agentId);
  const paths: string[][] = [[start]];
  let frontier = [[start]];
  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[][] = [];
    for (const path of frontier) {
      const tip = path[path.length - 1]!;
      const influencers = graphDoc.edges
        .filter((e) => e.source === tip && e.relation === "influenced_by")
        .map((e) => e.target);
      for (const inf of influencers) {
        if (path.includes(inf)) continue;
        const next = [...path, inf];
        paths.push(next);
        nextFrontier.push(next);
      }
    }
    frontier = nextFrontier;
    if (!frontier.length) break;
  }
  return paths;
}

/**
 * Manuscripts attributed to agents who sit on an influence path ending at `classicalAgent`
 * (e.g. Pedro Nunes → … → Aristotle).
 */
export function manuscriptsOnInfluencePathTo(
  graphDoc: ReasoningGraphDoc,
  startAgentName: string,
  classicalAgentName: string,
): Array<{ shelfmark?: string; manuscriptId: string; path: string[] }> {
  const classical = agentNodeId(classicalAgentName);
  const chains = influenceChain(graphDoc, startAgentName, 5).filter((p) => p.includes(classical));
  const out: Array<{ shelfmark?: string; manuscriptId: string; path: string[] }> = [];
  for (const path of chains) {
    const start = path[0]!;
    const msEdges = graphDoc.edges.filter(
      (e) => e.relation === "attributed_to" && e.target === start,
    );
    for (const e of msEdges) {
      const ms = graphDoc.nodes.find((n) => n.id === e.source);
      out.push({
        manuscriptId: e.source,
        shelfmark: ms?.attributes.shelfmark as string | undefined,
        path,
      });
    }
  }
  return out;
}

/** Gloss blocks where commentator A refuted body-text author B. */
export function glossRefutations(
  graphDoc: ReasoningGraphDoc,
): Array<{ glossAuthor: string; bodyAuthor: string; blockId: string }> {
  const glossEdges = graphDoc.edges.filter((e) => e.relation === "composed_gloss_on");
  const out: Array<{ glossAuthor: string; bodyAuthor: string; blockId: string }> = [];
  for (const ge of glossEdges) {
    const blockId = ge.target;
    const glossAuthor = ge.source;
    // Find manuscript containing this block, then work/author of body text
    const lineOrColParents = graphDoc.edges.filter(
      (e) =>
        (e.relation === "contains_block" || e.relation === "has_heading") && e.target === blockId,
    );
    // Walk up to manuscript via any containment, then find attributed / authored agents
    const refutes = graphDoc.edges.filter(
      (e) => e.source === glossAuthor && e.relation === "refuted",
    );
    for (const r of refutes) {
      out.push({ glossAuthor, bodyAuthor: r.target, blockId });
    }
    void lineOrColParents;
  }
  return out;
}

/** Agents who share a patron (patronized edges) or contemporary sharedLocation. */
export function patronageClusters(
  graphDoc: ReasoningGraphDoc,
): Array<{ patronId: string; manuscriptIds: string[]; clientAgentIds: string[] }> {
  const byPatron = new Map<string, string[]>();
  for (const e of graphDoc.edges) {
    if (e.relation !== "patronized") continue;
    const list = byPatron.get(e.source) ?? [];
    list.push(e.target);
    byPatron.set(e.source, list);
  }
  const clusters: Array<{ patronId: string; manuscriptIds: string[]; clientAgentIds: string[] }> = [];
  for (const [patronId, manuscriptIds] of byPatron) {
    const clients = new Set<string>();
    for (const mid of manuscriptIds) {
      for (const e of graphDoc.edges) {
        if (e.relation === "attributed_to" && e.source === mid) clients.add(e.target);
        if (e.relation === "authored" && e.target === mid) clients.add(e.source);
      }
      // Works contained in manuscript → their authors
      for (const e of graphDoc.edges) {
        if (e.relation === "contains_work" && e.source === mid) {
          for (const ae of graphDoc.edges) {
            if (ae.relation === "authored" && ae.target === e.target) clients.add(ae.source);
          }
        }
      }
    }
    clusters.push({ patronId, manuscriptIds, clientAgentIds: [...clients] });
  }
  return clusters;
}

/** Seed a small demo network (Pedro Nunes ↔ classical lineage + patronage). */
export function seedDemoAgentNetwork(graphDoc: ReasoningGraphDoc): ReasoningGraphDoc {
  let g = graphDoc;
  g = upsertAgent(g, {
    name: "Pedro Nunes",
    type: "author" as AgentRole,
    flourishedPeriod: "1502–1578",
    geographicOrigin: "Portugal",
  });
  g = upsertAgent(g, {
    name: "Claudius Ptolemy",
    type: "author",
    flourishedPeriod: "c. 100–170",
    geographicOrigin: "Alexandria",
  });
  g = upsertAgent(g, {
    name: "Aristotle",
    type: "author",
    flourishedPeriod: "384–322 BCE",
    geographicOrigin: "Stagira",
  });
  g = upsertAgent(g, {
    name: "Infante Dom Luís",
    type: "patron",
    flourishedPeriod: "1506–1555",
    geographicOrigin: "Portugal",
  });

  g = upsertWork(g, {
    title: "Geographia",
    originalLanguage: "GRC",
    compositionDate: "c. 150",
    genre: "scientific treatise",
  });
  g = upsertWork(g, {
    title: "Tratado da Sphera",
    originalLanguage: "POR",
    compositionDate: "1537",
    genre: "scientific treatise",
  });

  g = linkInfluencedBy(g, "Pedro Nunes", "Claudius Ptolemy", {
    influenceType: "conceptual",
    degreeOfCertainty: 0.9,
  });
  g = linkInfluencedBy(g, "Claudius Ptolemy", "Aristotle", {
    influenceType: "conceptual",
    degreeOfCertainty: 0.8,
  });
  g = linkTranslatedWork(g, "Pedro Nunes", "Geographia");
  g = linkAuthoredWork(g, "Pedro Nunes", "Tratado da Sphera");
  g = linkDedicatedWorkTo(g, "Pedro Nunes", "Infante Dom Luís", "Dedicated to Infante Dom Luís");

  const ms = g.nodes.find((n) => n.type === "Manuscript");
  if (ms) {
    g = linkAttributedTo(g, ms.id, "Pedro Nunes");
    g = linkContainsWork(g, ms.id, "Tratado da Sphera");
    g = linkPatronized(g, "Infante Dom Luís", ms.id);
  }
  return g;
}
