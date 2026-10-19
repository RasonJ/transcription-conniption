#!/usr/bin/env node
/**
 * Harden schemas/manuscript-reasoning-graph-v1.json in place.
 * Does NOT bump schema_version (stays at "1.0").
 */
import fs from "node:fs";

const p = "schemas/manuscript-reasoning-graph-v1.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));

s.$id = "https://transcription-conniption.local/schemas/manuscript-reasoning-graph-v1.json";
s.title = "Manuscript Scholarly & Public Knowledge Reasoning Graph v1.0";
s.description =
  "Strict multi-layer scholarly + HSMS philological graph. LOD tiers (MACRO/MESO/MICRO), Claim/Evidence epistemic attrs, if/then node-attribute discriminators (no catch-all), and relation-level source_type/target_type edge gates.";
s.properties.schema_version = { type: "string", const: "1.0" };

s.$defs.LodTier = {
  type: "string",
  enum: ["MACRO_REASONING", "MESO_DISCOURSE", "MICRO_PHILOLOGICAL"],
  description:
    "Level-of-detail tier so GDB engines can exclude MICRO_PHILOLOGICAL containment from macro epistemic traversals.",
};

s.$defs.ClaimAttributes = {
  type: "object",
  required: ["proposition_text"],
  additionalProperties: true,
  properties: {
    claim_id: { type: "string" },
    id: { type: "string" },
    proposition_text: { type: "string" },
    truth_value: {
      type: "string",
      enum: ["true", "false", "unknown", "partial"],
    },
    epistemic_status: {
      type: "string",
      enum: [
        "accepted",
        "accepted_consensus",
        "emerging_hypothesis",
        "actively_contested",
        "contested",
        "refuted",
        "unverified",
        "superseded",
      ],
    },
    certainty_degree: { type: "number", minimum: 0, maximum: 1 },
    confidence_score: { type: "number", minimum: 0, maximum: 1 },
    consensus_status: { type: "string" },
    is_lay_accessible: { type: "boolean" },
  },
};

s.$defs.EvidenceAttributes = {
  type: "object",
  required: ["evidence_type"],
  additionalProperties: true,
  properties: {
    evidence_id: { type: "string" },
    id: { type: "string" },
    evidence_type: {
      type: "string",
      enum: [
        "empirical_data",
        "philological_witness",
        "citation",
        "citation_aggregate",
        "statistical_result",
        "archival_record",
      ],
    },
    description: { type: "string" },
    sample_size: { type: "string" },
    p_value_or_effect_size: { type: "string" },
    statistical_significance: { type: "string" },
    source_locator: { type: "string" },
    location_in_source: { type: "string" },
    methodology_type: { type: "string" },
  },
};

const DEFAULT_LOD = {
  Manuscript: "MACRO_REASONING",
  Author: "MACRO_REASONING",
  Claim: "MACRO_REASONING",
  Evidence: "MACRO_REASONING",
  Concept: "MACRO_REASONING",
  Work: "MACRO_REASONING",
  Witness: "MACRO_REASONING",
  WitnessStats: "MACRO_REASONING",
  Journal_Venue: "MACRO_REASONING",
  FrequentQuestion: "MESO_DISCOURSE",
  AnswerSnippet: "MESO_DISCOURSE",
  Question: "MESO_DISCOURSE",
  LayExplanation: "MESO_DISCOURSE",
  Actor: "MESO_DISCOURSE",
  Person: "MESO_DISCOURSE",
  Agent: "MESO_DISCOURSE",
  Hand: "MESO_DISCOURSE",
  LanguageSpan: "MESO_DISCOURSE",
  AdministrativeBarrierNode: "MESO_DISCOURSE",
  CounterfactualIntervention: "MESO_DISCOURSE",
  Confounder: "MESO_DISCOURSE",
  Mediator: "MESO_DISCOURSE",
  InstrumentalVariable: "MESO_DISCOURSE",
  OutcomeVariable: "MESO_DISCOURSE",
  Event: "MESO_DISCOURSE",
  Folio: "MICRO_PHILOLOGICAL",
  Column: "MICRO_PHILOLOGICAL",
  Line: "MICRO_PHILOLOGICAL",
  Block: "MICRO_PHILOLOGICAL",
  Token: "MICRO_PHILOLOGICAL",
  DropInitial: "MICRO_PHILOLOGICAL",
  FigureAnchor: "MICRO_PHILOLOGICAL",
  Expansion: "MICRO_PHILOLOGICAL",
  EditorialIntervention: "MICRO_PHILOLOGICAL",
  Punctuation: "MICRO_PHILOLOGICAL",
  LemmaNode: "MICRO_PHILOLOGICAL",
  DamageRegion: "MICRO_PHILOLOGICAL",
  PhysicalAnomaly: "MICRO_PHILOLOGICAL",
  VariantForm: "MICRO_PHILOLOGICAL",
};

const attrRefs = [
  ["Manuscript", "ManuscriptAttributes"],
  ["Author", "AuthorAttributes"],
  ["Claim", "ClaimAttributes"],
  ["Evidence", "EvidenceAttributes"],
  ["FrequentQuestion", "FrequentQuestionAttributes"],
  ["AnswerSnippet", "AnswerSnippetAttributes"],
  ["Line", "LineAttributes"],
  ["Block", "BlockAttributes"],
  ["DropInitial", "DropInitialAttributes"],
  ["Token", "TokenAttributes"],
  ["Folio", "FolioAttributes"],
  ["Column", "ColumnAttributes"],
  ["Expansion", "ExpansionAttributes"],
  ["EditorialIntervention", "EditorialInterventionAttributes"],
  ["Punctuation", "PunctuationAttributes"],
  ["FigureAnchor", "FigureAnchorAttributes"],
  ["Agent", "AgentAttributes"],
  ["Work", "WorkAttributes"],
  ["WitnessStats", "WitnessStatsAttributes"],
  ["Hand", "HandAttributes"],
  ["LanguageSpan", "LanguageSpanAttributes"],
  ["CounterfactualIntervention", "CausalInterventionAttributes"],
  ["Event", "EventAttributes"],
  ["DamageRegion", "DamageRegionAttributes"],
  ["PhysicalAnomaly", "DamageRegionAttributes"],
  ["VariantForm", "VariantFormAttributes"],
  ["Confounder", "CausalVariableAttributes"],
  ["Mediator", "CausalVariableAttributes"],
  ["InstrumentalVariable", "CausalVariableAttributes"],
  ["OutcomeVariable", "CausalVariableAttributes"],
  ["LemmaNode", "LemmaNodeAttributes"],
];

// Ensure supporting $defs exist (may already be present from prior Pearlian patch).
const ensure = {
  BoundingBox: {
    type: "object",
    required: ["x", "y", "width", "height"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number" },
      height: { type: "number" },
    },
  },
  CausalInterventionAttributes: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      intervened_variable: { type: "string" },
      do_action: { type: "string" },
      treatment_value: { type: ["string", "number"] },
      counterfactual_state: { type: "string" },
      backdoor_adjusted: { type: "boolean" },
    },
  },
  CausalVariableAttributes: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      variable_name: { type: "string" },
    },
  },
  EventAttributes: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      subtype: { type: "string" },
      label: { type: "string" },
      date: { type: "string" },
      date_fuzzy: { type: "string" },
    },
  },
  DamageRegionAttributes: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      damage_type: { type: "string" },
      boundingBox: { $ref: "#/$defs/BoundingBox" },
      polygon_coordinates: {
        type: "array",
        items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      },
    },
  },
  VariantFormAttributes: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      surface: { type: "string" },
      orthographic_class: { type: "string" },
    },
  },
};
for (const [k, v] of Object.entries(ensure)) {
  if (!s.$defs[k]) s.$defs[k] = v;
}

s.$defs.ReasoningNode = {
  type: "object",
  required: ["id", "type", "attributes"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    uri: { type: "string" },
    type: { $ref: "#/$defs/ReasoningNodeType" },
    lod_tier: { $ref: "#/$defs/LodTier" },
    subgraph: {
      type: "string",
      description:
        "Optional document-structure / discourse subgraph id (e.g. 'docstruct:WITNESS:TRS') for LOD isolation.",
    },
    attributes: {
      type: "object",
      description: "Polymorphic bag; validated by allOf if/then on type (no catch-all).",
    },
  },
  allOf: attrRefs.map(([t, a]) => ({
    if: { properties: { type: { const: t } }, required: ["type"] },
    then: {
      properties: {
        attributes: { $ref: `#/$defs/${a}` },
        lod_tier: {
          ...(DEFAULT_LOD[t]
            ? { default: DEFAULT_LOD[t] }
            : { $ref: "#/$defs/LodTier" }),
        },
      },
    },
  })),
};

// Edge type gates
const edge = s.$defs.ReasoningEdge;
edge.properties.source_type = { $ref: "#/$defs/ReasoningNodeType" };
edge.properties.target_type = { $ref: "#/$defs/ReasoningNodeType" };

const edgeGates = [
  { relation: "rebuts", source_type: "Manuscript", target_type: "Manuscript" },
  { relation: "replies_to_rebuttal", source_type: "Manuscript", target_type: "Manuscript" },
  { relation: "supports_claim", target_type: "Claim" },
  { relation: "refutes_claim", target_type: "Claim" },
  { relation: "evidence_of", source_type: "Evidence", target_type: "Claim" },
  { relation: "authored", source_type: "Author", target_type: "Manuscript" },
  { relation: "coauthored_with", source_type: "Author", target_type: "Author" },
  { relation: "mentored", source_type: "Author", target_type: "Author" },
  { relation: "has_folio", source_type: "Manuscript", target_type: "Folio" },
  { relation: "contains_line", target_type: "Line" },
  { relation: "contains_token", target_type: "Token" },
  { relation: "answered_by", source_type: "FrequentQuestion", target_type: "AnswerSnippet" },
  { relation: "supported_by_evidence", target_type: "Evidence" },
  { relation: "has_variant_form", source_type: "Token", target_type: "VariantForm" },
  { relation: "standardized_to", source_type: "VariantForm", target_type: "LemmaNode" },
  { relation: "clobbers_text", source_type: "DamageRegion" },
  { relation: "performed_event", target_type: "Event" },
  { relation: "affected_target", source_type: "Event" },
];

edge.allOf = edgeGates.map((g) => {
  const thenProps = {};
  if (g.source_type) thenProps.source_type = { const: g.source_type };
  if (g.target_type) thenProps.target_type = { const: g.target_type };
  return {
    if: { properties: { relation: { const: g.relation } }, required: ["relation"] },
    then: { properties: thenProps },
  };
});

fs.writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
console.log(
  `[patch-v1-lod] schema_version=${s.properties.schema_version.const} discriminators=${attrRefs.length} edgeGates=${edgeGates.length}`,
);
