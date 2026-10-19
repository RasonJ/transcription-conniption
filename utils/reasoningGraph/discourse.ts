/**
 * Scholarly discourse & social edges: rebuttals, dedications, coauthorship, mentorship.
 */
import { computeReasoningDagHash } from "./hash";
import type {
  AuthorAttributes,
  ManuscriptAttributes,
  ReasoningEdgeProperties,
  ReasoningGraphDoc,
  ReasoningRelation,
} from "./types";

type MutableDoc = ReasoningGraphDoc;

function utcNowIso(): string {
  return new Date().toISOString();
}

function finalize(doc: MutableDoc): ReasoningGraphDoc {
  doc.dag_hash = computeReasoningDagHash(doc);
  return doc;
}

function edgeId(source: string, relation: string, target: string): string {
  return `E:${source}:${relation}:${target}`;
}

function upsertEdge(
  doc: MutableDoc,
  source: string,
  target: string,
  relation: ReasoningRelation,
  properties?: ReasoningEdgeProperties,
): void {
  const id = edgeId(source, relation, target);
  const next = {
    id,
    source,
    target,
    source_type: doc.nodes.find((n) => n.id === source)?.type,
    target_type: doc.nodes.find((n) => n.id === target)?.type,
    relation,
    properties: { created_at: utcNowIso(), ...properties },
  };
  const idx = doc.edges.findIndex((e) => (e.id ?? edgeId(e.source, e.relation, e.target)) === id);
  if (idx >= 0) {
    doc.edges[idx] = {
      ...doc.edges[idx],
      ...next,
      properties: { ...doc.edges[idx].properties, ...next.properties },
      source_type: next.source_type ?? doc.edges[idx].source_type,
      target_type: next.target_type ?? doc.edges[idx].target_type,
    };
  } else doc.edges.push(next);
}

function clone(doc: ReasoningGraphDoc): MutableDoc {
  return { ...doc, nodes: [...doc.nodes], edges: [...doc.edges] };
}

function findNode(doc: ReasoningGraphDoc, id: string) {
  return doc.nodes.find((n) => n.id === id);
}

function bumpClaimCount(doc: MutableDoc, manuscriptId: string): void {
  const n = findNode(doc, manuscriptId);
  if (!n || n.type !== "Manuscript") return;
  const attrs = n.attributes as ManuscriptAttributes;
  attrs.claim_count = (attrs.claim_count ?? 0) + 0; // no-op placeholder; claim annotator updates
}

/** Manuscript A supports / confirms Manuscript B. */
export function linkManuscriptSupport(
  graphDoc: ReasoningGraphDoc,
  fromId: string,
  toId: string,
  opts?: { relation?: "supports" | "confirms"; confidence?: number },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, fromId, toId, opts?.relation ?? "supports", {
    confidence_score: opts?.confidence,
    citation_intent: "confirmation",
  });
  return finalize(doc);
}

/** Manuscript A refutes / contradicts Manuscript B. */
export function linkManuscriptRefutation(
  graphDoc: ReasoningGraphDoc,
  fromId: string,
  toId: string,
  opts?: { relation?: "refutes" | "contradicts"; pointOfContention?: ReasoningEdgeProperties["point_of_contention"] },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, fromId, toId, opts?.relation ?? "refutes", {
    citation_intent: "contradiction",
    point_of_contention: opts?.pointOfContention ?? "general",
    tone: "critical",
  });
  return finalize(doc);
}

export function linkReplication(
  graphDoc: ReasoningGraphDoc,
  fromId: string,
  toId: string,
  outcome: NonNullable<ReasoningEdgeProperties["replication_outcome"]>,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, fromId, toId, "replicates", { replication_outcome: outcome });
  return finalize(doc);
}

export function linkSupersedes(graphDoc: ReasoningGraphDoc, newerId: string, olderId: string): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, newerId, olderId, "supersedes", {});
  const older = findNode(doc, olderId);
  if (older?.type === "Manuscript") {
    (older.attributes as ManuscriptAttributes).consensus_alignment = "Superseded";
  }
  return finalize(doc);
}

/** Formal rebuttal discourse: B rebuts A. */
export function linkRebuttal(
  graphDoc: ReasoningGraphDoc,
  rebuttalManuscriptId: string,
  originalManuscriptId: string,
  opts?: {
    pointOfContention?: ReasoningEdgeProperties["point_of_contention"];
    tone?: string;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, rebuttalManuscriptId, originalManuscriptId, "rebuts", {
    point_of_contention: opts?.pointOfContention ?? "methodology",
    tone: opts?.tone ?? "critical",
  });
  return finalize(doc);
}

export function linkReplyToRebuttal(
  graphDoc: ReasoningGraphDoc,
  replyManuscriptId: string,
  rebuttalManuscriptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, replyManuscriptId, rebuttalManuscriptId, "replies_to_rebuttal", {
    tone: "constructive",
  });
  return finalize(doc);
}

export function linkCommentary(
  graphDoc: ReasoningGraphDoc,
  commentaryId: string,
  targetManuscriptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, commentaryId, targetManuscriptId, "comments_on", {});
  return finalize(doc);
}

export function linkErratum(
  graphDoc: ReasoningGraphDoc,
  correctionId: string,
  originalId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, correctionId, originalId, "corrects_erratum", {});
  return finalize(doc);
}

export function linkDedication(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  personOrAuthorId: string,
  dedicationText: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, personOrAuthorId, "dedicated_to", {
    dedication_text: dedicationText,
  });
  return finalize(doc);
}

export function linkAcknowledgment(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  authorId: string,
  acknowledgmentType: NonNullable<ReasoningEdgeProperties["acknowledgment_type"]>,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, authorId, "acknowledges_discussion_with", {
    acknowledgment_type: acknowledgmentType,
  });
  return finalize(doc);
}

/** Author → Manuscript with order / contribution. */
export function linkAuthorship(
  graphDoc: ReasoningGraphDoc,
  authorId: string,
  manuscriptId: string,
  opts?: {
    coauthor?: boolean;
    authorOrder?: ReasoningEdgeProperties["author_order"];
    contributionType?: string;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, authorId, manuscriptId, opts?.coauthor ? "coauthored" : "authored", {
    author_order: opts?.authorOrder,
    contribution_type: opts?.contributionType,
  });
  return finalize(doc);
}

/** Direct Author ↔ Author coauthorship (derived from shared manuscripts). */
export function linkCoauthors(
  graphDoc: ReasoningGraphDoc,
  authorA: string,
  authorB: string,
  opts?: { collaborationCount?: number; firstYear?: number; latestYear?: number },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, authorA, authorB, "coauthored_with", {
    collaboration_count: opts?.collaborationCount ?? 1,
    first_coauthored_year: opts?.firstYear,
    latest_coauthored_year: opts?.latestYear,
  });
  return finalize(doc);
}

export function linkMentorship(
  graphDoc: ReasoningGraphDoc,
  mentorId: string,
  menteeId: string,
  role: string,
  institution?: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, mentorId, menteeId, "mentored", {
    mentorship_role: role,
    institution,
  });
  const mentee = findNode(doc, menteeId);
  if (mentee?.type === "Author") {
    const attrs = mentee.attributes as AuthorAttributes;
    const links = new Set([...(attrs.mentorship_links ?? []), mentorId]);
    attrs.mentorship_links = [...links];
  }
  return finalize(doc);
}

/** Derive in_formal_debate_with when authors dispute via rebuttal manuscripts. */
export function deriveFormalDebate(
  graphDoc: ReasoningGraphDoc,
  authorA: string,
  authorB: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, authorA, authorB, "in_formal_debate_with", {});
  upsertEdge(doc, authorB, authorA, "in_formal_debate_with", {});
  return finalize(doc);
}

export function linkConceptPrerequisite(
  graphDoc: ReasoningGraphDoc,
  prerequisiteConceptId: string,
  advancedConceptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, prerequisiteConceptId, advancedConceptId, "prerequisite_for", {});
  return finalize(doc);
}

export function linkSpecializesIn(
  graphDoc: ReasoningGraphDoc,
  authorId: string,
  conceptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, authorId, conceptId, "specializes_in", {});
  return finalize(doc);
}

export function linkAppliesConcept(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  conceptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, conceptId, "applies_concept", {});
  bumpClaimCount(doc, manuscriptId);
  return finalize(doc);
}

export function linkDefinesConcept(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  conceptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, manuscriptId, conceptId, "defines_concept", {});
  return finalize(doc);
}

/** LayExplanation → Manuscript audit trail. */
export function linkSimplifiedFrom(
  graphDoc: ReasoningGraphDoc,
  layExplanationId: string,
  manuscriptId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, layExplanationId, manuscriptId, "simplified_from", {});
  return finalize(doc);
}

/**
 * Walk a discourse thread motif: original ← rebuttal ← reply.
 * Returns ordered manuscript ids from root to tip.
 */
export function discourseThread(
  graphDoc: ReasoningGraphDoc,
  rootManuscriptId: string,
): string[] {
  const thread = [rootManuscriptId];
  let cursor = rootManuscriptId;
  const visited = new Set([cursor]);
  // Follow incoming rebuts then replies_to_rebuttal chains length-bounded
  for (let i = 0; i < 12; i++) {
    const rebuttal = graphDoc.edges.find((e) => e.relation === "rebuts" && e.target === cursor);
    if (rebuttal && !visited.has(rebuttal.source)) {
      visited.add(rebuttal.source);
      thread.push(rebuttal.source);
      cursor = rebuttal.source;
      continue;
    }
    const reply = graphDoc.edges.find(
      (e) => e.relation === "replies_to_rebuttal" && e.target === cursor,
    );
    if (reply && !visited.has(reply.source)) {
      visited.add(reply.source);
      thread.push(reply.source);
      cursor = reply.source;
      continue;
    }
    break;
  }
  return thread;
}
