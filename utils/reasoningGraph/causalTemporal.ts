/**
 * Pearlian causal DAG, temporal Event provenance, damage regions, and VariantForm links.
 */
import { computeReasoningDagHash } from "./hash";
import type {
  BoundingBox,
  CausalInterventionAttributes,
  CausalVariableAttributes,
  DamageRegionAttributes,
  EventAttributes,
  EventSubtype,
  ExpansionAttributes,
  ReasoningEdgeProperties,
  ReasoningGraphDoc,
  ReasoningNode,
  ReasoningNodeType,
  ReasoningRelation,
  VariantFormAttributes,
} from "./types";
import { DEFAULT_LOD_BY_TYPE } from "./types";
import { makeNodeUri } from "./uri";

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

function upsertEdge(
  doc: ReasoningGraphDoc,
  source: string,
  target: string,
  relation: ReasoningRelation,
  properties?: ReasoningEdgeProperties,
): void {
  const source_type = doc.nodes.find((n) => n.id === source)?.type;
  const target_type = doc.nodes.find((n) => n.id === target)?.type;
  const id = `E:${source}:${relation}:${target}`;
  const next = {
    id,
    source,
    target,
    source_type,
    target_type,
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

function causalNode(
  kind: Extract<
    ReasoningNodeType,
    "Confounder" | "Mediator" | "InstrumentalVariable" | "OutcomeVariable"
  >,
  id: string,
  attrs: CausalVariableAttributes,
): ReasoningNode {
  return {
    id,
    type: kind,
    uri: makeNodeUri(kind, id),
    attributes: { id, ...attrs },
  };
}

export function upsertCausalVariable(
  graphDoc: ReasoningGraphDoc,
  kind: "Confounder" | "Mediator" | "InstrumentalVariable" | "OutcomeVariable",
  id: string,
  attrs: CausalVariableAttributes,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertNode(doc, causalNode(kind, id, attrs));
  return finalize(doc);
}

export function linkCausalInfluence(
  graphDoc: ReasoningGraphDoc,
  fromId: string,
  toId: string,
  opts?: { valid_from?: string; valid_until?: string },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, fromId, toId, "causally_influences", opts);
  return finalize(doc);
}

export function linkConfounds(
  graphDoc: ReasoningGraphDoc,
  confounderId: string,
  treatmentId: string,
  outcomeId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, confounderId, treatmentId, "confounds", {});
  upsertEdge(doc, confounderId, outcomeId, "confounds", {});
  return finalize(doc);
}

export function linkMediates(
  graphDoc: ReasoningGraphDoc,
  mediatorId: string,
  fromId: string,
  toId: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, fromId, mediatorId, "causally_influences", {});
  upsertEdge(doc, mediatorId, toId, "mediates", {});
  return finalize(doc);
}

export function linkBlocksCausalPath(
  graphDoc: ReasoningGraphDoc,
  blockerId: string,
  pathEdgeSource: string,
  pathEdgeTarget: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  upsertEdge(doc, blockerId, pathEdgeSource, "blocks_causal_path", {
    blocked_target: pathEdgeTarget,
  } as ReasoningEdgeProperties);
  return finalize(doc);
}

/** Full do(X) counterfactual with SEM / back-door metadata. */
export function annotateDoIntervention(
  graphDoc: ReasoningGraphDoc,
  opts: {
    id?: string;
    manuscriptId: string;
    doAction: string;
    intervenedVariable: string;
    treatmentValue?: string | number;
    counterfactualState: string;
    backdoorAdjusted?: boolean;
    estimatedDaysSaved?: number;
    expectedNetRoi?: number;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const id = opts.id ?? `CF:${opts.manuscriptId}:${opts.doAction}`;
  const attrs: CausalInterventionAttributes = {
    id,
    do_action: opts.doAction,
    intervened_variable: opts.intervenedVariable,
    treatment_value: opts.treatmentValue,
    counterfactual_state: opts.counterfactualState,
    backdoor_adjusted: opts.backdoorAdjusted ?? false,
    estimated_days_saved: opts.estimatedDaysSaved,
    expected_net_roi: opts.expectedNetRoi,
    created_at: utcNowIso(),
  };
  upsertNode(doc, {
    id,
    type: "CounterfactualIntervention",
    uri: makeNodeUri("CounterfactualIntervention", id),
    attributes: attrs,
  });
  upsertEdge(doc, opts.manuscriptId, id, "annotated_claim", {
    do_action: opts.doAction,
    intervened_variable: opts.intervenedVariable,
  });
  return finalize(doc);
}

export function annotateProvenanceEvent(
  graphDoc: ReasoningGraphDoc,
  opts: {
    eventId: string;
    subtype: EventSubtype;
    agentId?: string;
    targetId: string;
    date?: string;
    dateFuzzy?: string;
    place?: string;
    notes?: string;
    valid_from?: string;
    valid_until?: string;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const eventId = opts.eventId.startsWith("EVENT:") ? opts.eventId : `EVENT:${opts.eventId}`;
  const attrs: EventAttributes = {
    id: eventId,
    subtype: opts.subtype,
    date: opts.date,
    date_fuzzy: opts.dateFuzzy,
    place: opts.place,
    notes: opts.notes,
    label: opts.subtype,
  };
  upsertNode(doc, {
    id: eventId,
    type: "Event",
    uri: makeNodeUri("Event", opts.subtype, eventId),
    attributes: attrs,
  });
  if (opts.agentId) {
    upsertEdge(doc, opts.agentId, eventId, "performed_event", {
      valid_from: opts.valid_from ?? opts.date ?? opts.dateFuzzy,
      valid_until: opts.valid_until,
    });
  }
  upsertEdge(doc, eventId, opts.targetId, "affected_target", {
    valid_from: opts.valid_from ?? opts.date ?? opts.dateFuzzy,
    valid_until: opts.valid_until,
  });
  return finalize(doc);
}

export function annotateDamageRegion(
  graphDoc: ReasoningGraphDoc,
  opts: {
    damageId: string;
    damageType: DamageRegionAttributes["damage_type"];
    clobbers: string[];
    boundingBox?: BoundingBox;
    polygon?: Array<[number, number]>;
    severity?: number;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const id = opts.damageId.startsWith("DAMAGE:") ? opts.damageId : `DAMAGE:${opts.damageId}`;
  const attrs: DamageRegionAttributes = {
    id,
    damage_type: opts.damageType,
    boundingBox: opts.boundingBox,
    polygon_coordinates: opts.polygon,
    severity: opts.severity,
  };
  upsertNode(doc, {
    id,
    type: "DamageRegion",
    uri: makeNodeUri("DamageRegion", id),
    attributes: attrs,
  });
  for (const target of opts.clobbers) {
    upsertEdge(doc, id, target, "clobbers_text", {});
  }
  return finalize(doc);
}

export function linkVariantForm(
  graphDoc: ReasoningGraphDoc,
  opts: {
    tokenId: string;
    surface: string;
    lemmaId: string;
    orthographicClass?: string;
  },
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const variantId = `VARIANT:${opts.surface.toLowerCase().replace(/\s+/g, "_")}`;
  const attrs: VariantFormAttributes = {
    id: variantId,
    surface: opts.surface,
    orthographic_class: opts.orthographicClass,
  };
  upsertNode(doc, {
    id: variantId,
    type: "VariantForm",
    uri: makeNodeUri("VariantForm", opts.surface),
    attributes: attrs,
  });
  upsertEdge(doc, opts.tokenId, variantId, "has_variant_form", {});
  const lemmaId = opts.lemmaId.startsWith("LEMMA:") ? opts.lemmaId : `LEMMA:${opts.lemmaId}`;
  upsertEdge(doc, variantId, lemmaId, "standardized_to", {});
  return finalize(doc);
}

export function annotateExpansionDetail(
  graphDoc: ReasoningGraphDoc,
  expansionId: string,
  detail: Pick<ExpansionAttributes, "abbreviation_type" | "graphemic_source" | "suppliedText">,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const node = doc.nodes.find((n) => n.id === expansionId);
  if (!node) {
    upsertNode(doc, {
      id: expansionId,
      type: "Expansion",
      uri: makeNodeUri("Expansion", expansionId),
      attributes: { id: expansionId, ...detail },
    });
  } else {
    node.attributes = { ...node.attributes, ...detail };
  }
  return finalize(doc);
}

/** Stamp valid_from / valid_until on an existing edge (by endpoints + relation). */
export function stampEdgeValidity(
  graphDoc: ReasoningGraphDoc,
  source: string,
  target: string,
  relation: ReasoningRelation,
  valid_from?: string,
  valid_until?: string,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  doc.edges = doc.edges.map((e) => {
    if (e.source !== source || e.target !== target || e.relation !== relation) return e;
    return {
      ...e,
      properties: { ...e.properties, valid_from, valid_until },
    };
  });
  return finalize(doc);
}

/** Ensure every node has a uri (idempotent migration aid). */
export function ensureNodeUris(graphDoc: ReasoningGraphDoc): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  doc.nodes = doc.nodes.map((n) => ({
    ...n,
    uri: n.uri ?? makeNodeUri(n.type, n.id),
  }));
  return finalize(doc);
}
