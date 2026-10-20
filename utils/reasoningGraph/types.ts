/** Manuscript scholarly & public knowledge reasoning graph (v1). */

export const REASONING_GRAPH_SCHEMA_VERSION = "1.0" as const;

export type ReasoningNodeType =
  | "Manuscript"
  | "Author"
  | "Claim"
  | "Evidence"
  | "Concept"
  | "LayExplanation"
  | "AnswerSnippet"
  | "Question"
  | "FrequentQuestion"
  | "Actor"
  | "Journal_Venue"
  | "Folio"
  | "Witness"
  | "Column"
  | "Line"
  | "Block"
  | "Token"
  | "DropInitial"
  | "FigureAnchor"
  | "Expansion"
  | "EditorialIntervention"
  | "Punctuation"
  | "LemmaNode"
  | "AdministrativeBarrierNode"
  | "CounterfactualIntervention"
  | "Person"
  /** Unified historical / scholarly actor (author, scribe, patron, …). */
  | "Agent"
  /** Abstract literary work distinct from a physical Manuscript witness. */
  | "Work"
  /** Precompiled lexical profile from hsms-facets/1 sidecars. */
  | "WitnessStats"
  /** Secondary scribal hand attested in facet counts. */
  | "Hand"
  /** Language / code-switch span aggregate. */
  | "LanguageSpan"
  // Pearlian causal structural roles
  | "Confounder"
  | "Mediator"
  | "InstrumentalVariable"
  | "OutcomeVariable"
  // Temporal provenance
  | "Event"
  // Codicological damage
  | "DamageRegion"
  | "PhysicalAnomaly"
  // Orthographic variants
  | "VariantForm"
  /** Offline Tier-1 recipe. Lookup does not traverse the graph. */
  | "PrecompiledChain";

export type EventSubtype =
  | "Production"
  | "Insolvency_Sale"
  | "Rebinding"
  | "Shelfmark_Reassignment"
  | "Digitization"
  | "Scribal_Correction"
  | string;

/** Level-of-detail tier for GDB query filtering (macro vs micro). */
export type LodTier = "MACRO_REASONING" | "MESO_DISCOURSE" | "MICRO_PHILOLOGICAL";

export const DEFAULT_LOD_BY_TYPE: Record<ReasoningNodeType, LodTier> = {
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
  PrecompiledChain: "MESO_DISCOURSE",
};

/** Intrinsic claim fields only — confidence / consensus live on edges. */
export interface ClaimAttributes {
  claim_id?: string;
  id?: string;
  proposition_text: string;
  truth_value?: "true" | "false" | "unknown" | "partial";
  epistemic_status?:
    | "accepted"
    | "accepted_consensus"
    | "emerging_hypothesis"
    | "actively_contested"
    | "contested"
    | "refuted"
    | "unverified"
    | "superseded";
  certainty_degree?: number;
  is_lay_accessible?: boolean;
  /** Dense vector for GraphRAG. Typical widths are 384 or 1536. */
  embedding?: number[];
}

export interface EvidenceAttributes {
  evidence_id?: string;
  id?: string;
  evidence_type:
    | "empirical_data"
    | "philological_witness"
    | "citation"
    | "citation_aggregate"
    | "statistical_result"
    | "archival_record"
    | string;
  description?: string;
  sample_size?: string;
  p_value_or_effect_size?: string;
  statistical_significance?: string;
  source_locator?: string;
  location_in_source?: string;
  methodology_type?: string;
  embedding?: number[];
  [key: string]: unknown;
}

/** Axis-aligned layout box (facsimile / SVG space). */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CausalVariableAttributes {
  id?: string;
  label?: string;
  variable_name?: string;
  [key: string]: unknown;
}

export interface CausalInterventionAttributes {
  id?: string;
  do_action?: string;
  intervened_variable?: string;
  treatment_value?: string | number;
  counterfactual_state?: string;
  backdoor_adjusted?: boolean;
  estimated_days_saved?: number;
  labor_cost_units?: number;
  expected_net_roi?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface EventAttributes {
  id?: string;
  subtype?: EventSubtype;
  label?: string;
  date?: string;
  date_fuzzy?: string;
  place?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface DamageRegionAttributes {
  id?: string;
  damage_type?: "wormhole" | "ink_corrosion" | "trimmed_margin" | "water_stain" | "lacuna" | string;
  boundingBox?: BoundingBox;
  polygon_coordinates?: Array<[number, number]>;
  severity?: number;
  [key: string]: unknown;
}

export interface VariantFormAttributes {
  id?: string;
  surface?: string;
  orthographic_class?: string;
  phonological_notes?: string;
  mufi_char?: string;
  unicode_pua?: string;
  hsms_ascii_raw?: string;
  [key: string]: unknown;
}

export type AgentRole =
  | "author"
  | "scribe"
  | "translator"
  | "commentator"
  | "patron"
  | "editor"
  | string;

/** Unified Agent / Person identity for intellectual & social networks. */
export interface AgentAttributes {
  id?: string;
  name?: string;
  type?: AgentRole;
  birthYear?: number | string;
  deathYear?: number | string;
  flourishedPeriod?: string;
  geographicOrigin?: string;
  /** Bridge to ORCID / AuthorAttributes when the agent is also a modern author. */
  orcid?: string;
  name_variants?: string[];
  [key: string]: unknown;
}

export interface WorkAttributes {
  id?: string;
  title?: string;
  originalLanguage?: string;
  compositionDate?: string;
  genre?: string;
  [key: string]: unknown;
}

/** Recurring FAQ / user query mapped into the reasoning graph. */
export interface FrequentQuestionAttributes {
  question_id?: string;
  canonical_text?: string;
  alternate_phrasings?: string[];
  target_audience?: "lay" | "scholar" | "all";
  search_frequency_tier?: "high" | "medium" | "low";
  embedding?: number[];
  [key: string]: unknown;
}

/** Short answer crafted for a FrequentQuestion (may also use LayExplanation). */
export interface AnswerSnippetAttributes {
  answer_text?: string;
  reading_level?:
    | "General Public"
    | "High School Science"
    | "Undergraduate"
    | "Specialist"
    | "grade_school"
    | "general_public"
    | "undergraduate"
    | "specialist";
  last_updated_date?: string;
  verified_by_editor?: boolean;
  embedding?: number[];
}

/** Bibliographic + epistemic + lay accessibility for Manuscript / Witness anchors. */
export interface ManuscriptAttributes {
  manuscript_id?: string;
  id?: string;
  title?: string;
  doi?: string;
  publication_date?: string;
  /** Physical / bibliographic layer aliases. */
  dateCreated?: string;
  journal_or_venue?: string;
  license?: string;
  /** HSMS shelfmark when the artifact is a witness transcription. */
  shelfmark?: string;
  repository?: string;
  city?: string;
  country?: string;
  author?: string;
  language?: string | string[];
  supportMaterial?: "vellum" | "paper" | "papyrus" | "parchment" | string;
  folio_count?: number;

  abstract?: string;
  paper_type?: string;
  peer_review_status?: string;
  methodology_type?: string;
  sample_size?: string;
  field_of_study?: string[];

  lay_summary?: string;
  key_takeaway?: string;
  reading_comprehension_level?: string;
  practical_implications?: string;
  glossary_terms?: Array<{ term: string; definition: string }>;

  consensus_alignment?: string;
  evidence_strength_score?: number;
  claim_count?: number;
  retraction_flag?: boolean;
  open_questions?: string[];

  /** From hsms-facets/1 sidecars. */
  baseName?: string;
  witnessHash?: string;
  wordCount?: number;
  typeCount?: number;
  ttr?: number;
  sttr?: number;
  hapax?: number;
  blockCounts?: Record<string, number>;
  tokenCounts?: Record<string, number>;

  [key: string]: unknown;
}

export interface WitnessStatsAttributes {
  id?: string;
  baseName?: string;
  witnessHash?: string;
  wordCount?: number;
  typeCount?: number;
  ttr?: number;
  sttr?: number;
  hapax?: number;
  rubricCount?: number;
  glossCount?: number;
  dropInitialCount?: number;
  blockCounts?: Record<string, number>;
  tokenCounts?: Record<string, number>;
  [key: string]: unknown;
}

export interface HandAttributes {
  id?: string;
  hand?: string;
  label?: string;
  count?: number;
  [key: string]: unknown;
}

export interface LanguageSpanAttributes {
  id?: string;
  lang?: string;
  words?: number;
  tokens?: number;
  spans?: number;
  [key: string]: unknown;
}

/** Physical folio / leaf side. */
export interface FolioAttributes {
  id?: string;
  folioNumber?: string;
  side?: "recto" | "verso";
  sequenceIndex?: number;
  catchword?: string;
  signature?: string;
  /** Frame for boxes and polygons on this leaf. */
  coordinate_system?: "normalized_1000" | "iiif_pixels" | "svg_user_units";
  canvas_width?: number;
  canvas_height?: number;
  [key: string]: unknown;
}

export interface ColumnAttributes {
  id?: string;
  columnIndex?: number;
  layoutType?: "CB1" | "CB2" | string;
  [key: string]: unknown;
}

export interface LineAttributes {
  id?: string;
  lineNumber?: string;
  sequenceIndex?: number;
  yPosition?: number;
  boundingBox?: BoundingBox;
  polygon_coordinates?: Array<[number, number]>;
  [key: string]: unknown;
}

export interface DropInitialAttributes {
  id?: string;
  letter?: string;
  depthInLines?: number;
  style?: "ornate" | "rubricated" | string;
  color?: string;
  boundingBox?: BoundingBox;
  polygon_coordinates?: Array<[number, number]>;
  [key: string]: unknown;
}

export interface FigureAnchorAttributes {
  id?: string;
  figureId?: string;
  mnemonicType?: "ILL" | "MIN" | "DIAG" | "SYMB" | string;
  caption?: string;
  imageUri?: string;
  [key: string]: unknown;
}

export interface BlockAttributes {
  id?: string;
  type?: "prose" | "rubric" | "gloss" | "addendum" | "heading" | string;
  language?: string;
  columns?: number;
  boundingBox?: BoundingBox;
  polygon_coordinates?: Array<[number, number]>;
  folioId?: string;
  lineNumber?: string;
  excerpt?: string;
  embedding?: number[];
  [key: string]: unknown;
}

export interface TokenAttributes {
  id?: string;
  raw?: string;
  diplomaticValue?: string;
  normalizedValue?: string;
  posTag?: string;
  tokenType?: string;
  hand?: string;
  mufi_char?: string;
  unicode_pua?: string;
  hsms_ascii_raw?: string;
  [key: string]: unknown;
}

export interface ExpansionAttributes {
  id?: string;
  suppliedText?: string;
  type?: "abbreviation" | "ligature" | string;
  abbreviation_type?: "suspension" | "contraction" | "superscript_letter" | "brevigraph" | string;
  graphemic_source?: string;
  [key: string]: unknown;
}

export interface EditorialInterventionAttributes {
  id?: string;
  interventionType?:
    | "scribal_deletion"
    | "scribal_insertion"
    | "editorial_deletion"
    | "editorial_insertion"
    | string;
  hand?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface PunctuationAttributes {
  id?: string;
  type?: "scribal_punctuation" | "calderon" | "calderon_two" | string;
  raw?: string;
  [key: string]: unknown;
}

export interface LemmaNodeAttributes {
  id?: string;
  lemma?: string;
  language?: string;
  [key: string]: unknown;
}

/** Identity, expertise, impact, and graph-dynamics for Author nodes. */
export interface AuthorAttributes {
  author_id?: string;
  full_name?: string;
  /** @deprecated prefer full_name */
  name?: string;
  name_variants?: string[];
  orcid?: string;
  primary_affiliation?: string;
  affiliation_history?: string[];

  primary_fields?: string[];
  subfields_and_topics?: string[];
  lay_expertise_summary?: string;
  active_years_range?: string;

  publication_count?: number;
  citation_count?: number;
  h_index?: number;
  peer_review_contributions?: string[];
  notable_awards?: string[];

  frequent_collaborators?: string[];
  mentorship_links?: string[];
  science_communicator_flag?: boolean;
  conflict_of_interest_disclosures?: string[];

  [key: string]: unknown;
}

export type ReasoningRelation =
  // Author / Agent ↔ Manuscript / Work
  | "authored"
  | "coauthored"
  | "translated"
  | "attributed_to"
  | "composed_gloss_on"
  | "patronized"
  | "dedicated_work_to"
  | "contains_work"
  // Agent ↔ Agent (intellectual & social network)
  | "influenced_by"
  | "contemporary_of"
  | "corresponded_with"
  | "studied_under"
  | "criticized_by"
  | "refuted"
  // Manuscript ↔ Manuscript (epistemic / structural)
  | "cites_work"
  | "supports"
  | "confirms"
  | "refutes"
  | "contradicts"
  | "replicates"
  | "supersedes"
  | "extends"
  | "builds_upon"
  | "reviews_and_summarizes"
  // Formal debate / discourse
  | "rebuts"
  | "replies_to_rebuttal"
  | "comments_on"
  | "corrects_erratum"
  // Personal / lineage
  | "dedicated_to"
  | "acknowledges_discussion_with"
  | "funded_by_grant_of"
  | "intellectual_descendant_of"
  // Author ↔ Author
  | "coauthored_with"
  | "mentored"
  | "advised"
  | "frequent_collaborator_of"
  | "peer_reviewed_work_by"
  | "in_formal_debate_with"
  // Concept bridges
  | "defines_concept"
  | "applies_concept"
  | "specializes_in"
  | "prerequisite_for"
  | "defines_term"
  // Claim / evidence
  | "contains"
  | "supports_claim"
  | "refutes_claim"
  | "evidence_of"
  // Lay / audience
  | "translates_to_lay"
  | "simplified_from"
  | "answers_question"
  | "explores_topic"
  | "annotated_claim"
  | "bookmarked_work"
  | "queries_graph"
  // FAQ / question-mapping layer
  | "answered_by"
  | "supported_by_manuscript"
  | "supported_by_evidence"
  | "mapped_to_concept"
  | "addressed_by_author"
  | "addressed_in"
  | "spurs_question"
  | "has_consensus_answer"
  | "has_contested_answer"
  | "summarizes_claim"
  | "asserts"
  // Spatial & structural containment (HSMS physical layer)
  | "has_folio"
  | "has_column"
  | "contains_block"
  | "contains_line"
  | "contains_token"
  | "has_heading"
  | "has_footer"
  // Sequential & flow
  | "next_folio"
  | "next_line"
  | "next_token"
  | "hyphenated_to"
  // Layout constraints
  | "indents"
  | "glosses_line"
  // Philological mappings
  | "has_expansion"
  | "has_intervention"
  | "maps_to_lemma"
  | "located_at"
  // Facets sidecar → reasoning graph
  | "has_stats"
  | "contains_term"
  | "has_hapax_term"
  | "exhibits_hand"
  | "uses_block_type"
  | "uses_token_type"
  | "code_switches_to"
  | "has_rubric_hit"
  | "has_gloss_hit"
  | "has_drop_initial_hit"
  // Pearlian causal DAG
  | "causally_influences"
  | "confounds"
  | "mediates"
  | "blocks_causal_path"
  // Temporal provenance
  | "performed_event"
  | "affected_target"
  // Damage / physical anomaly
  | "clobbers_text"
  // Orthographic variants
  | "has_variant_form"
  | "standardized_to"
  // HSMS operational
  | "stalled_by_barrier"
  | "bypasses_barrier"
  /** GraphRAG jump. Weight is properties.cosine_similarity. */
  | "semantically_similar_to"
  /** DamageRegion or FigureAnchor → Folio canvas. */
  | "represented_on_canvas"
  /** Token or Block → Hand or Agent (scribe). */
  | "written_by_hand"
  /** EditorialIntervention → Hand. */
  | "corrected_by";

export interface ReasoningEdgeProperties {
  created_at?: string;
  confidence_score?: number;
  citation_intent?:
    | "background"
    | "methodology_use"
    | "contradiction"
    | "confirmation"
    | "extends"
    | "comparative_discussion";
  frequency_in_text?: number;
  replication_outcome?: "successful" | "failed" | "inconclusive";
  author_order?: "1st_author" | "last_author" | "corresponding" | "middle";
  contribution_type?: string;
  collaboration_count?: number;
  first_coauthored_year?: number;
  latest_coauthored_year?: number;
  mentorship_role?: "PhD_Advisor" | "Postdoc_Mentor" | string;
  institution?: string;
  point_of_contention?:
    | "methodology"
    | "data_interpretation"
    | "statistical_power"
    | "ethics"
    | "general";
  tone?: "critical" | "constructive" | string;
  dedication_text?: string;
  acknowledgment_type?:
    | "conceptual_feedback"
    | "data_sharing"
    | "informal_review"
    | "lab_support"
    | "informal_peer_review";
  reading_level?: string;
  verified_by_author?: boolean;
  is_mutilated_edge?: boolean;
  interventional_action_applied?: string;
  do_action?: string;
  weight?: number;
  estimated_days_saved?: number;
  expected_net_roi?: number;
  barrier_id?: string;
  /** FAQ mapping: how strongly a manuscript/claim answers the question. */
  relevance_score?: number;
  consensus_status?: "settled_consensus" | "emerging_hypothesis" | "actively_contested";
  /** Agent influence / social-network edge properties. */
  influenceType?: "direct_quote" | "paraphrase" | "conceptual" | string;
  degreeOfCertainty?: number;
  sharedLocation?: string;
  timeWindow?: string;
  /** Term frequency / facet hit weight. */
  tf?: number;
  count?: number;
  folioId?: string;
  line?: string;
  /** Temporal validity (ISO-8601 or fuzzy century e.g. "s. XIV", "c. 1280"). */
  valid_from?: string;
  valid_until?: string;
  /** Cosine between endpoint embeddings on semantically_similar_to. */
  cosine_similarity?: number;
  [key: string]: unknown;
}

export interface ReasoningNode {
  id: string;
  /** Globally unique URN/IRI for distributed merges. */
  uri?: string;
  type: ReasoningNodeType;
  /** LOD tier — filter MICRO_PHILOLOGICAL out of macro epistemic traversals. */
  lod_tier?: LodTier;
  /** Optional document-structure / discourse subgraph id for LOD isolation. */
  subgraph?: string;
  /** Ordered node ids for a Tier-1 short-circuit. Also stored on PrecompiledChain attributes. */
  precompiled_execution_path?: string[];
  attributes: Record<string, unknown>;
}

export interface ReasoningEdge {
  id?: string;
  source: string;
  target: string;
  /** Optional type gate (validated against relation constraints in schema). */
  source_type?: ReasoningNodeType;
  target_type?: ReasoningNodeType;
  relation: ReasoningRelation;
  properties?: ReasoningEdgeProperties;
}

export interface ReasoningGraphDoc {
  schema_version: typeof REASONING_GRAPH_SCHEMA_VERSION;
  domain?: "hsms_scriptorium";
  dag_hash?: string;
  lifecycle_stages?: string[];
  nodes: ReasoningNode[];
  edges: ReasoningEdge[];
}

export type BarrierStatus = "OPEN" | "RESOLVED" | "BYPASSED" | "EXPIRED";

export const HSMS_BARRIER_SPECS: Record<
  string,
  { resolution_action: string; friction_delta: number; estimated_delay_days: number }
> = {
  EMPTY_COLUMN_ENVELOPE: {
    resolution_action: "RUN_LINT",
    friction_delta: 0.7,
    estimated_delay_days: 1,
  },
  MISSING_FOLIO_MARKER: {
    resolution_action: "JUMP_FOLIO",
    friction_delta: 0.55,
    estimated_delay_days: 0.5,
  },
  UNREVIEWED_SIDECAR: {
    resolution_action: "MARK_REVIEWED",
    friction_delta: 0.45,
    estimated_delay_days: 2,
  },
  LOW_CONFIDENCE_LINES: {
    resolution_action: "PASS_TWO_REPAIR",
    friction_delta: 0.6,
    estimated_delay_days: 3,
  },
};
