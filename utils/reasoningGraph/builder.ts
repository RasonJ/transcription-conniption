/**
 * Manuscript reasoning graph builder (dental RCM graph surgery adapted to epistemic DAG).
 * Stable hash locks, AdministrativeBarrierNode, Pearlian do(X) edge mutilation.
 */
import type { ParsedManuscript } from "../../constants/manuscript";
import { computeReasoningDagHash } from "./hash";
import { seedSpatialStructure, type SpatialSeedMode } from "./spatialStructure";
import { makeNodeUri } from "./uri";
import {
  DEFAULT_LOD_BY_TYPE,
  HSMS_BARRIER_SPECS,
  REASONING_GRAPH_SCHEMA_VERSION,
  type AuthorAttributes,
  type BarrierStatus,
  type ClaimAttributes,
  type EvidenceAttributes,
  type ManuscriptAttributes,
  type ReasoningEdge,
  type ReasoningGraphDoc,
  type ReasoningNode,
  type ReasoningNodeType,
  type ReasoningRelation,
} from "./types";

function utcNowIso(): string {
  return new Date().toISOString();
}

export function emptyReasoningGraph(): ReasoningGraphDoc {
  return {
    schema_version: REASONING_GRAPH_SCHEMA_VERSION,
    domain: "hsms_scriptorium",
    lifecycle_stages: ["INGEST", "VALIDATE", "EDIT", "ANALYZE", "EXPORT", "LIBRARY"],
    nodes: [],
    edges: [],
    dag_hash: computeReasoningDagHash({
      schema_version: REASONING_GRAPH_SCHEMA_VERSION,
      nodes: [],
      edges: [],
    }),
  };
}

function resolveNodeType(doc: ReasoningGraphDoc, id: string): ReasoningNodeType | undefined {
  return doc.nodes.find((n) => n.id === id)?.type;
}

function upsertNode(doc: ReasoningGraphDoc, node: ReasoningNode): void {
  const withUri: ReasoningNode = {
    ...node,
    uri: node.uri ?? makeNodeUri(node.type, node.id),
    lod_tier: node.lod_tier ?? DEFAULT_LOD_BY_TYPE[node.type],
  };
  const idx = doc.nodes.findIndex((n) => n.id === withUri.id);
  if (idx >= 0) {
    doc.nodes[idx] = {
      ...doc.nodes[idx],
      ...withUri,
      attributes: { ...doc.nodes[idx].attributes, ...withUri.attributes },
      uri: withUri.uri ?? doc.nodes[idx].uri,
      lod_tier: withUri.lod_tier ?? doc.nodes[idx].lod_tier,
    };
  } else doc.nodes.push(withUri);
}

function upsertEdge(doc: ReasoningGraphDoc, edge: ReasoningEdge): void {
  const id =
    edge.id ??
    `E:${edge.source}:${edge.relation}:${edge.target}`;
  const next: ReasoningEdge = {
    ...edge,
    id,
    source_type: edge.source_type ?? resolveNodeType(doc, edge.source),
    target_type: edge.target_type ?? resolveNodeType(doc, edge.target),
  };
  const idx = doc.edges.findIndex((e) => (e.id ?? `E:${e.source}:${e.relation}:${e.target}`) === id);
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

function withHash(doc: ReasoningGraphDoc): ReasoningGraphDoc {
  const out = { ...doc, nodes: [...doc.nodes], edges: [...doc.edges] };
  out.dag_hash = computeReasoningDagHash(out);
  return out;
}

export type SeedWitnessOptions = {
  witnessId?: string;
  author?: string;
  shelfmark?: string;
  manuscript?: Partial<ManuscriptAttributes>;
  authorAttrs?: Partial<AuthorAttributes>;
  /** Attach Folio/Column/Block (+ deep Token graph). Default: shallow. */
  spatial?: SpatialSeedMode | false;
  maxTokensPerFolio?: number;
};

/** Seed a reasoning graph from an open HSMS witness (Manuscript + Folios + optional Author). */
export function seedFromWitness(parsed: ParsedManuscript, options?: SeedWitnessOptions): ReasoningGraphDoc {
  const doc = emptyReasoningGraph();
  const witnessId = options?.witnessId ?? "WITNESS:open";
  const manuscriptId = `MANUSCRIPT:${witnessId}`;
  const title = parsed.metadata.title || witnessId;
  const shelfmark = options?.shelfmark ?? parsed.metadata.witness?.shelfmark;
  const venue = parsed.metadata.witness?.library;
  const imprintDate = parsed.metadata.imprint?.date;

  const manuscriptAttrs: ManuscriptAttributes = {
    manuscript_id: manuscriptId,
    id: manuscriptId,
    title,
    shelfmark,
    repository: parsed.metadata.witness?.library,
    city: parsed.metadata.witness?.city ?? parsed.metadata.imprint?.city,
    dateCreated: imprintDate,
    author: parsed.metadata.author || undefined,
    language: "SPA",
    folio_count: parsed.folios.length,
    journal_or_venue: venue,
    publication_date: imprintDate,
    paper_type: "Critical Edition",
    peer_review_status: "Transcription",
    methodology_type: "Archival / Paleographic Transcription",
    field_of_study: ["Philology", "Paleography", "Manuscript Studies"],
    reading_comprehension_level: "Undergraduate",
    lay_summary: title
      ? `A historical manuscript transcription titled “${title}” with ${parsed.folios.length} folio sides.`
      : undefined,
    key_takeaway: shelfmark ? `Witness shelfmark ${shelfmark}.` : undefined,
    consensus_alignment: "Consensus-Conforming",
    evidence_strength_score: 0.7,
    claim_count: 0,
    retraction_flag: false,
    glossary_terms: [
      { term: "folio", definition: "A leaf of the manuscript; r = front (recto), v = back (verso)." },
      { term: "catchword", definition: "A word at the foot of a page that matches the start of the next quire." },
    ],
    ...options?.manuscript,
  };

  upsertNode(doc, {
    id: manuscriptId,
    type: "Manuscript",
    attributes: manuscriptAttrs,
  });
  upsertNode(doc, {
    id: witnessId,
    type: "Witness",
    attributes: { label: witnessId },
  });
  upsertEdge(doc, {
    source: witnessId,
    target: manuscriptId,
    relation: "contains",
    properties: { created_at: utcNowIso() },
  });

  const authorName = (options?.author ?? parsed.metadata.author ?? "").trim();
  if (authorName) {
    const authorId =
      options?.authorAttrs?.author_id ??
      options?.authorAttrs?.orcid ??
      `AUTHOR:${authorName.toLowerCase().replace(/\s+/g, "_")}`;
    const authorNodeId = authorId.startsWith("AUTHOR:") || authorId.startsWith("AUTH-")
      ? authorId
      : `AUTHOR:${authorId}`;
    const authorAttrs: AuthorAttributes = {
      author_id: authorNodeId,
      full_name: authorName,
      name: authorName,
      primary_fields: ["Philology"],
      subfields_and_topics: ["Romance manuscripts", "Paleography"],
      lay_expertise_summary: `Historical author or scribe associated with “${title}”.`,
      publication_count: 1,
      science_communicator_flag: false,
      ...options?.authorAttrs,
    };
    upsertNode(doc, {
      id: authorNodeId,
      type: "Author",
      attributes: authorAttrs,
    });
    upsertEdge(doc, {
      source: authorNodeId,
      target: manuscriptId,
      relation: "authored",
      properties: { created_at: utcNowIso(), author_order: "1st_author" },
    });
  }

  const withMeta = withHash(doc);
  if (options?.spatial === false) return withMeta;
  return seedSpatialStructure(withMeta, parsed, {
    manuscriptId,
    mode: options?.spatial ?? "shallow",
    maxTokensPerFolio: options?.maxTokensPerFolio,
  });
}

/** Attach a paleographic / linguistic claim with optional evidence. */
export function annotateClaim(
  graphDoc: ReasoningGraphDoc,
  opts: {
    manuscriptId: string;
    claimId: string;
    proposition: string;
    confidence?: number;
    epistemicStatus?: ClaimAttributes["epistemic_status"];
    truthValue?: ClaimAttributes["truth_value"];
    certaintyDegree?: number;
    evidenceId?: string;
    evidenceAttrs?: Partial<EvidenceAttributes>;
    conceptId?: string;
    conceptName?: string;
  },
): ReasoningGraphDoc {
  const doc = { ...graphDoc, nodes: [...graphDoc.nodes], edges: [...graphDoc.edges] };
  const claimNodeId = `CLAIM:${opts.claimId}`;
  const claimAttrs: ClaimAttributes = {
    claim_id: claimNodeId,
    proposition_text: opts.proposition,
    certainty_degree: opts.certaintyDegree ?? opts.confidence ?? 0.8,
    epistemic_status: opts.epistemicStatus ?? "accepted",
    truth_value: opts.truthValue ?? "unknown",
    is_lay_accessible: true,
  };
  upsertNode(doc, {
    id: claimNodeId,
    type: "Claim",
    lod_tier: "MACRO_REASONING",
    attributes: claimAttrs,
  });
  upsertEdge(doc, {
    source: opts.manuscriptId,
    target: claimNodeId,
    relation: "contains",
    source_type: "Manuscript",
    target_type: "Claim",
    properties: {
      created_at: utcNowIso(),
      confidence_score: opts.confidence ?? 0.8,
      consensus_status:
        opts.epistemicStatus === "actively_contested" || opts.epistemicStatus === "contested"
          ? "actively_contested"
          : opts.epistemicStatus === "emerging_hypothesis"
            ? "emerging_hypothesis"
            : "settled_consensus",
    },
  });
  const ms = doc.nodes.find((n) => n.id === opts.manuscriptId);
  if (ms?.type === "Manuscript") {
    const attrs = ms.attributes as ManuscriptAttributes;
    attrs.claim_count = (attrs.claim_count ?? 0) + 1;
  }

  if (opts.evidenceId) {
    const evidenceNodeId = `EVIDENCE:${opts.evidenceId}`;
    const evidenceAttrs: EvidenceAttributes = {
      evidence_id: evidenceNodeId,
      evidence_type: opts.evidenceAttrs?.evidence_type ?? "philological_witness",
      methodology_type: opts.evidenceAttrs?.methodology_type ?? "archival",
      ...opts.evidenceAttrs,
    };
    upsertNode(doc, {
      id: evidenceNodeId,
      type: "Evidence",
      lod_tier: "MACRO_REASONING",
      attributes: evidenceAttrs,
    });
    upsertEdge(doc, {
      source: evidenceNodeId,
      target: claimNodeId,
      relation: "supports_claim",
      source_type: "Evidence",
      target_type: "Claim",
      properties: { created_at: utcNowIso() },
    });
  }

  if (opts.conceptId || opts.conceptName) {
    const conceptNodeId = `CONCEPT:${opts.conceptId ?? opts.conceptName}`;
    upsertNode(doc, {
      id: conceptNodeId,
      type: "Concept",
      attributes: { canonical_name: opts.conceptName ?? opts.conceptId },
    });
    upsertEdge(doc, {
      source: claimNodeId,
      target: conceptNodeId,
      relation: "defines_term",
      properties: { created_at: utcNowIso() },
    });
  }

  return withHash(doc);
}

/** Lay-reader translation of a claim or manuscript. */
export function annotateLayExplanation(
  graphDoc: ReasoningGraphDoc,
  opts: {
    sourceId: string;
    explanationId: string;
    analogyText: string;
    readingLevel?: string;
  },
): ReasoningGraphDoc {
  const doc = { ...graphDoc, nodes: [...graphDoc.nodes], edges: [...graphDoc.edges] };
  const layId = `LAY:${opts.explanationId}`;
  upsertNode(doc, {
    id: layId,
    type: "LayExplanation",
    attributes: {
      analogy_text: opts.analogyText,
      reading_level: opts.readingLevel ?? "general_public",
      verified_by_author_flag: false,
    },
  });
  upsertEdge(doc, {
    source: opts.sourceId,
    target: layId,
    relation: "translates_to_lay",
    properties: {
      created_at: utcNowIso(),
      reading_level: opts.readingLevel ?? "general_public",
      verified_by_author: false,
    },
  });
  upsertEdge(doc, {
    source: layId,
    target: opts.sourceId,
    relation: "simplified_from",
    properties: { created_at: utcNowIso() },
  });
  return withHash(doc);
}

/**
 * Attach an AdministrativeBarrierNode (HSMS preflight blockers).
 * Links witness/manuscript via stalled_by_barrier until Pearlian do(X) clearance.
 */
export function annotateManuscriptBarrier(
  graphDoc: ReasoningGraphDoc,
  opts: {
    witnessId: string;
    barrierType: string;
    resolutionAction?: string;
    frictionDelta?: number;
    estimatedDelayDays?: number;
    status?: BarrierStatus;
    folioId?: string;
  },
): ReasoningGraphDoc {
  const doc = { ...graphDoc, nodes: [...graphDoc.nodes], edges: [...graphDoc.edges] };
  const spec = HSMS_BARRIER_SPECS[opts.barrierType] ?? {
    resolution_action: "RUN_LINT",
    friction_delta: 0.5,
    estimated_delay_days: 1,
  };
  const barrierId = `BARRIER:${opts.witnessId}:${opts.barrierType}`;
  const friction = Math.max(0, Math.min(1, opts.frictionDelta ?? spec.friction_delta));
  const resolution = opts.resolutionAction ?? spec.resolution_action;

  upsertNode(doc, {
    id: barrierId,
    type: "AdministrativeBarrierNode",
    attributes: {
      barrier_id: barrierId,
      barrier_type: opts.barrierType,
      friction_index_delta: friction,
      resolution_action: resolution,
      estimated_resolution_time_days: opts.estimatedDelayDays ?? spec.estimated_delay_days,
      status: opts.status ?? "OPEN",
      folio_id: opts.folioId,
    },
  });

  const sourceId = opts.folioId ? `FOLIO:${opts.folioId}` : `MANUSCRIPT:${opts.witnessId}`;
  upsertEdge(doc, {
    id: `E-BARRIER-${opts.witnessId}-${opts.barrierType}`,
    source: sourceId,
    target: barrierId,
    relation: "stalled_by_barrier",
    properties: {
      created_at: utcNowIso(),
      barrier_id: barrierId,
      weight: friction,
      do_action: resolution,
    },
  });

  return withHash(doc);
}

/** Pearlian do(X): flip stalled_by_barrier → bypasses_barrier and mark mutilation. */
export function clearManuscriptBarrier(
  graphDoc: ReasoningGraphDoc,
  opts: { witnessId: string; barrierType: string; doAction?: string },
): ReasoningGraphDoc {
  const doc = { ...graphDoc, nodes: [...graphDoc.nodes], edges: [...graphDoc.edges] };
  const barrierId = `BARRIER:${opts.witnessId}:${opts.barrierType}`;

  doc.nodes = doc.nodes.map((n) => {
    if (n.id !== barrierId) return n;
    return {
      ...n,
      attributes: {
        ...n.attributes,
        status: "BYPASSED",
        cleared_by: opts.doAction ?? n.attributes.resolution_action,
        cleared_at: utcNowIso(),
      },
    };
  });

  doc.edges = doc.edges.map((e) => {
    if (e.target !== barrierId || e.relation !== "stalled_by_barrier") return e;
    return {
      ...e,
      relation: "bypasses_barrier" as ReasoningRelation,
      properties: {
        ...e.properties,
        is_mutilated_edge: true,
        interventional_action_applied: opts.doAction ?? String(e.properties?.do_action ?? "BYPASS"),
        created_at: utcNowIso(),
      },
    };
  });

  return withHash(doc);
}

/** Mark edges of a given relation as mutilated (Pearlian graph surgery). */
export function mutilateEdgesByRelation(
  graphDoc: ReasoningGraphDoc,
  opts: { targetRelation: ReasoningRelation; interventionalAction?: string },
): { graph: ReasoningGraphDoc; mutilatedEdgeCount: number; relation: string } {
  const action = opts.interventionalAction ?? "DO_SURGERY";
  let mutilated = 0;
  const edges = graphDoc.edges.map((edge) => {
    if (edge.relation !== opts.targetRelation) return edge;
    mutilated += 1;
    return {
      ...edge,
      properties: {
        ...edge.properties,
        is_mutilated_edge: true,
        interventional_action_applied: action,
      },
    };
  });
  const graph = withHash({ ...graphDoc, nodes: [...graphDoc.nodes], edges });
  return { graph, mutilatedEdgeCount: mutilated, relation: opts.targetRelation };
}

/**
 * Counterfactual editorial / transcription lab:
 * What if we bypass a barrier without mutating the live witness?
 */
export function annotateCounterfactualIntervention(
  graphDoc: ReasoningGraphDoc,
  opts: {
    witnessId: string;
    doAction: string;
    estimatedDaysSaved?: number;
    laborCostUnits?: number;
    expectedNetRoi?: number;
    /** Pearlian do(X) SEM fields */
    intervenedVariable?: string;
    treatmentValue?: string | number;
    counterfactualState?: string;
    backdoorAdjusted?: boolean;
  },
): {
  graph: ReasoningGraphDoc;
  action: string;
  mutilatedEdgeCount: number;
  dagHash: string;
  method: string;
} {
  let doc = { ...graphDoc, nodes: [...graphDoc.nodes], edges: [...graphDoc.edges] };
  const interventionId = `CF:${opts.witnessId}:${opts.doAction}`;
  upsertNode(doc, {
    id: interventionId,
    type: "CounterfactualIntervention",
    attributes: {
      do_action: opts.doAction,
      intervened_variable: opts.intervenedVariable ?? "barrier_status",
      treatment_value: opts.treatmentValue ?? "bypassed",
      counterfactual_state:
        opts.counterfactualState ??
        `What if ${opts.doAction} cleared barriers on ${opts.witnessId}?`,
      backdoor_adjusted: opts.backdoorAdjusted ?? false,
      estimated_days_saved: opts.estimatedDaysSaved ?? 0,
      labor_cost_units: opts.laborCostUnits ?? 0,
      expected_net_roi: opts.expectedNetRoi ?? 0,
      created_at: utcNowIso(),
    },
  });

  const manuscriptId = `MANUSCRIPT:${opts.witnessId}`;
  upsertEdge(doc, {
    source: manuscriptId,
    target: interventionId,
    relation: "annotated_claim",
    properties: {
      created_at: utcNowIso(),
      do_action: opts.doAction,
      estimated_days_saved: opts.estimatedDaysSaved ?? 0,
      expected_net_roi: opts.expectedNetRoi ?? 0,
    },
  });

  const surgery = mutilateEdgesByRelation(doc, {
    targetRelation: "stalled_by_barrier",
    interventionalAction: opts.doAction,
  });
  doc = surgery.graph;

  return {
    graph: doc,
    action: opts.doAction,
    mutilatedEdgeCount: surgery.mutilatedEdgeCount,
    dagHash: doc.dag_hash ?? computeReasoningDagHash(doc),
    method: "manuscript_causal_do_calculus_proxy",
  };
}

export { computeReasoningDagHash };
