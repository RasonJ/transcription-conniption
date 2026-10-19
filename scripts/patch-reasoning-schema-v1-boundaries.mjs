#!/usr/bin/env node
/**
 * Harden v1 schema boundaries: node/edge attribute split, FAQ+causal gates, enums.
 * Does NOT bump schema_version (stays "1.0").
 */
import fs from "node:fs";

const p = "schemas/manuscript-reasoning-graph-v1.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));

if (s.properties.schema_version?.const !== "1.0") {
  throw new Error(`Refusing to patch: expected schema_version 1.0, got ${s.properties.schema_version?.const}`);
}

s.description =
  "Multi-layer scholarly + philological reasoning graph. LOD tiers, non-overlapping node/edge attributes, relation-level source_type/target_type gates, explicit FAQ/Causal bindings. schema_version=1.0.";

// --- Manuscript enums ---
const ms = s.$defs.ManuscriptAttributes;
ms.properties.paper_type = {
  type: "string",
  enum: [
    "Empirical Study",
    "Meta-Analysis",
    "Systematic Review",
    "Pre-print",
    "Editorial",
    "Replication Study",
    "Critical Edition",
    "Transcription",
  ],
};
ms.properties.peer_review_status = {
  type: "string",
  enum: ["Peer-Reviewed", "Pre-Print / Unreviewed", "Retracted", "Transcription"],
};
ms.properties.reading_comprehension_level = {
  type: "string",
  enum: ["General Public", "High School Science", "Undergraduate", "Specialist"],
};
ms.properties.consensus_alignment = {
  type: "string",
  enum: ["Consensus-Conforming", "Contrarian / Frontier", "Superseded", "Disproven"],
};

// --- FAQ / Answer enums ---
s.$defs.FrequentQuestionAttributes.properties.target_audience = {
  type: "string",
  enum: ["lay", "scholar", "all"],
};
s.$defs.FrequentQuestionAttributes.properties.search_frequency_tier = {
  type: "string",
  enum: ["high", "medium", "low"],
};
s.$defs.FrequentQuestionAttributes.additionalProperties = false;

s.$defs.AnswerSnippetAttributes.properties.reading_level = {
  type: "string",
  enum: ["General Public", "High School Science", "Undergraduate", "Specialist", "grade_school", "general_public", "undergraduate", "specialist"],
};
s.$defs.AnswerSnippetAttributes.additionalProperties = false;

// --- Claim: intrinsic only (no confidence_score / consensus_status — those are edge props) ---
s.$defs.ClaimAttributes = {
  type: "object",
  required: ["proposition_text"],
  additionalProperties: false,
  properties: {
    claim_id: { type: "string" },
    id: { type: "string" },
    proposition_text: { type: "string" },
    truth_value: { type: "string", enum: ["true", "false", "unknown", "partial"] },
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
    is_lay_accessible: { type: "boolean", default: true },
  },
};

s.$defs.EvidenceAttributes = {
  type: "object",
  required: ["evidence_type"],
  additionalProperties: false,
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

// Edge properties: keep relational dynamics; document node/edge split
const edgeProps = s.$defs.ReasoningEdge.properties.properties.properties;
edgeProps.confidence_score = {
  type: "number",
  minimum: 0,
  maximum: 1,
  description: "Edge-only: strength of this relational assertion (not a node intrinsic).",
};
edgeProps.relevance_score = {
  type: "number",
  minimum: 0,
  maximum: 1,
  description: "Edge-only: how strongly source answers / relates to target question.",
};
edgeProps.consensus_status = {
  type: "string",
  enum: ["settled_consensus", "emerging_hypothesis", "actively_contested"],
  description: "Edge-only: consensus state of this relational answer/link.",
};
edgeProps.do_action = {
  type: "string",
  description: "Edge-only interventional label; CounterfactualIntervention nodes hold SEM fields.",
};

const CAUSAL_TYPES = [
  "Confounder",
  "Mediator",
  "InstrumentalVariable",
  "OutcomeVariable",
  "Claim",
  "Manuscript",
  "CounterfactualIntervention",
  "AdministrativeBarrierNode",
];

function gate(relation, thenProps) {
  return {
    if: { properties: { relation: { const: relation } }, required: ["relation"] },
    then: { properties: thenProps },
  };
}

function gateEnumRel(relations, thenProps) {
  return {
    if: { properties: { relation: { enum: relations } }, required: ["relation"] },
    then: { properties: thenProps },
  };
}

const existing = s.$defs.ReasoningEdge.allOf ?? [];
const byKey = new Map();
for (const g of existing) {
  const rel = g?.if?.properties?.relation?.const ?? g?.if?.properties?.relation?.enum?.join("|");
  if (rel) byKey.set(rel, g);
}

const additions = [
  gate("prerequisite_for", {
    source_type: { const: "Concept" },
    target_type: { const: "Concept" },
  }),
  gate("answered_by", {
    source_type: { const: "FrequentQuestion" },
    target_type: { enum: ["AnswerSnippet", "LayExplanation"] },
  }),
  gate("answers_question", {
    source_type: { enum: ["Claim", "Evidence", "Manuscript", "LayExplanation"] },
    target_type: { enum: ["Question", "FrequentQuestion"] },
  }),
  gate("mapped_to_concept", {
    target_type: { const: "Concept" },
  }),
  gate("has_consensus_answer", {
    source_type: { const: "FrequentQuestion" },
    target_type: { enum: ["Claim", "AnswerSnippet", "LayExplanation"] },
  }),
  gate("has_contested_answer", {
    source_type: { const: "FrequentQuestion" },
    target_type: { enum: ["Claim", "AnswerSnippet"] },
  }),
  gate("supported_by_manuscript", {
    target_type: { const: "Manuscript" },
  }),
  gate("spurs_question", {
    target_type: { enum: ["Question", "FrequentQuestion"] },
  }),
  gate("addressed_by_author", {
    target_type: { enum: ["Author", "Agent"] },
  }),
  gate("defines_concept", {
    source_type: { enum: ["Manuscript", "Claim", "Author"] },
    target_type: { const: "Concept" },
  }),
  gate("applies_concept", {
    target_type: { const: "Concept" },
  }),
  gate("specializes_in", {
    source_type: { enum: ["Author", "Agent"] },
    target_type: { const: "Concept" },
  }),
  gateEnumRel(["causally_influences", "confounds", "mediates", "blocks_causal_path"], {
    source_type: { enum: CAUSAL_TYPES },
    target_type: { enum: CAUSAL_TYPES },
  }),
  gate("translates_to_lay", {
    target_type: { const: "LayExplanation" },
  }),
  gate("simplified_from", {
    source_type: { const: "LayExplanation" },
  }),
];

for (const g of additions) {
  const rel = g.if.properties.relation.const ?? g.if.properties.relation.enum.join("|");
  byKey.set(rel, g);
}

// Ensure answered_by allows LayExplanation (replace prior AnswerSnippet-only gate)
byKey.set("answered_by", additions.find((g) => g.if.properties.relation.const === "answered_by"));

s.$defs.ReasoningEdge.allOf = [...byKey.values()];

fs.writeFileSync(p, `${JSON.stringify(s, null, 2)}\n`);
console.log(
  `[patch-v1-boundaries] schema_version=${s.properties.schema_version.const} edgeGates=${s.$defs.ReasoningEdge.allOf.length}`,
);
