/**
 * Question-Answering & Mapping Layer — bridges NL FAQs to manuscripts, claims, evidence.
 * Supports lay lookup (answered_by → LayExplanation → Manuscript) and scholar deep-dive
 * (supported_by_evidence, contested answers via rebuts/refutes).
 */
import { computeReasoningDagHash } from "./hash";
import type {
  AnswerSnippetAttributes,
  FrequentQuestionAttributes,
  ReasoningEdgeProperties,
  ReasoningGraphDoc,
  ReasoningNode,
  ReasoningRelation,
} from "./types";
import { MACRO_QUERY_TIERS, projectLod } from "./lod";

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
  const next = { id, source, target, relation, properties: { created_at: utcNowIso(), ...properties } };
  const idx = doc.edges.findIndex((e) => (e.id ?? `E:${e.source}:${e.relation}:${e.target}`) === id);
  if (idx >= 0) {
    doc.edges[idx] = {
      ...doc.edges[idx],
      ...next,
      properties: { ...doc.edges[idx].properties, ...next.properties },
    };
  } else doc.edges.push(next);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((t) => t.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export type RegisterFaqOptions = {
  questionId: string;
  canonicalText: string;
  alternatePhrasings?: string[];
  targetAudience?: FrequentQuestionAttributes["target_audience"];
  searchFrequencyTier?: FrequentQuestionAttributes["search_frequency_tier"];
  conceptId?: string;
  conceptName?: string;
  authorId?: string;
  manuscriptId?: string;
  claimId?: string;
  evidenceId?: string;
  answerText?: string;
  readingLevel?: AnswerSnippetAttributes["reading_level"];
  verifiedByEditor?: boolean;
  consensusStatus?: ReasoningEdgeProperties["consensus_status"];
  relevanceScore?: number;
  contestedManuscriptIds?: string[];
  spurredByManuscriptId?: string;
};

/** Upsert a FrequentQuestion and wire answer / concept / manuscript / consensus edges. */
export function registerFrequentQuestion(
  graphDoc: ReasoningGraphDoc,
  opts: RegisterFaqOptions,
): ReasoningGraphDoc {
  const doc = clone(graphDoc);
  const qId = opts.questionId.startsWith("FAQ:") ? opts.questionId : `FAQ:${opts.questionId}`;
  const attrs: FrequentQuestionAttributes = {
    question_id: qId,
    canonical_text: opts.canonicalText,
    alternate_phrasings: opts.alternatePhrasings ?? [],
    target_audience: opts.targetAudience ?? "all",
    search_frequency_tier: opts.searchFrequencyTier ?? "medium",
  };
  upsertNode(doc, { id: qId, type: "FrequentQuestion", attributes: attrs });

  if (opts.answerText) {
    const answerId = `ANSWER:${opts.questionId.replace(/^FAQ:/, "")}`;
    const answerAttrs: AnswerSnippetAttributes = {
      answer_text: opts.answerText,
      reading_level: opts.readingLevel ?? "general_public",
      last_updated_date: utcNowIso().slice(0, 10),
      verified_by_editor: opts.verifiedByEditor ?? false,
    };
    upsertNode(doc, { id: answerId, type: "AnswerSnippet", attributes: answerAttrs });
    upsertEdge(doc, qId, answerId, "answered_by", {
      relevance_score: opts.relevanceScore ?? 1,
      consensus_status: opts.consensusStatus,
    });
    if (opts.claimId) {
      const claimNode = opts.claimId.startsWith("CLAIM:") ? opts.claimId : `CLAIM:${opts.claimId}`;
      upsertEdge(doc, answerId, claimNode, "summarizes_claim", {
        relevance_score: opts.relevanceScore ?? 0.9,
      });
    }
    if (opts.evidenceId) {
      const ev = opts.evidenceId.startsWith("EVIDENCE:") ? opts.evidenceId : `EVIDENCE:${opts.evidenceId}`;
      upsertEdge(doc, answerId, ev, "supported_by_evidence", {
        relevance_score: opts.relevanceScore ?? 0.85,
      });
    }
    if (opts.manuscriptId) {
      upsertEdge(doc, answerId, opts.manuscriptId, "supported_by_manuscript", {
        relevance_score: opts.relevanceScore ?? 0.9,
      });
    }
  }

  if (opts.claimId) {
    const claimNode = opts.claimId.startsWith("CLAIM:") ? opts.claimId : `CLAIM:${opts.claimId}`;
    upsertEdge(doc, qId, claimNode, "answered_by", {
      relevance_score: opts.relevanceScore ?? 0.85,
      consensus_status: opts.consensusStatus,
    });
    if (opts.consensusStatus === "settled_consensus") {
      upsertEdge(doc, qId, claimNode, "has_consensus_answer", {
        consensus_status: "settled_consensus",
        relevance_score: opts.relevanceScore ?? 0.95,
      });
    }
    if (opts.manuscriptId) {
      upsertEdge(doc, opts.manuscriptId, claimNode, "asserts", {
        relevance_score: opts.relevanceScore ?? 0.9,
      });
    }
  }

  if (opts.manuscriptId) {
    upsertEdge(doc, qId, opts.manuscriptId, "supported_by_manuscript", {
      relevance_score: opts.relevanceScore ?? 0.85,
      consensus_status: opts.consensusStatus,
    });
  }

  if (opts.conceptId || opts.conceptName) {
    const conceptId = `CONCEPT:${opts.conceptId ?? opts.conceptName}`;
    upsertNode(doc, {
      id: conceptId,
      type: "Concept",
      attributes: { canonical_name: opts.conceptName ?? opts.conceptId },
    });
    upsertEdge(doc, qId, conceptId, "mapped_to_concept", {
      relevance_score: opts.relevanceScore ?? 0.8,
    });
    if (opts.manuscriptId) {
      upsertEdge(doc, conceptId, opts.manuscriptId, "addressed_in", {
        relevance_score: opts.relevanceScore ?? 0.75,
      });
    }
  }

  if (opts.authorId) {
    upsertEdge(doc, qId, opts.authorId, "addressed_by_author", {
      relevance_score: opts.relevanceScore ?? 0.7,
    });
  }

  if (opts.spurredByManuscriptId) {
    upsertEdge(doc, opts.spurredByManuscriptId, qId, "spurs_question", {
      relevance_score: opts.relevanceScore ?? 0.8,
    });
  }

  for (const mid of opts.contestedManuscriptIds ?? []) {
    upsertEdge(doc, qId, mid, "has_contested_answer", {
      consensus_status: "actively_contested",
      relevance_score: opts.relevanceScore ?? 0.7,
    });
  }

  return finalize(doc);
}

export interface FaqMatch {
  questionId: string;
  score: number;
  canonicalText: string;
  targetAudience?: string;
}

/** Rank FrequentQuestion nodes against a free-text query (Jaccard over phrasing tokens). */
export function matchFrequentQuestions(
  graphDoc: ReasoningGraphDoc,
  query: string,
  options?: { limit?: number; minScore?: number; audience?: "lay" | "scholar" | "all" },
): FaqMatch[] {
  const qTokens = tokenSet(query);
  const minScore = options?.minScore ?? 0.15;
  const limit = options?.limit ?? 5;
  const audience = options?.audience;
  const hits: FaqMatch[] = [];

  for (const node of projectLod(graphDoc, MACRO_QUERY_TIERS).nodes) {
    if (node.type !== "FrequentQuestion") continue;
    const attrs = node.attributes as FrequentQuestionAttributes;
    if (audience && audience !== "all" && attrs.target_audience && attrs.target_audience !== "all") {
      if (attrs.target_audience !== audience) continue;
    }
    const phrases = [attrs.canonical_text ?? "", ...(attrs.alternate_phrasings ?? [])];
    let best = 0;
    for (const p of phrases) {
      const score = jaccard(qTokens, tokenSet(p));
      if (score > best) best = score;
      // Exact / substring boost for high-frequency FAQs
      const nq = normalize(query);
      const np = normalize(p);
      if (np && (nq.includes(np) || np.includes(nq))) best = Math.max(best, 0.92);
    }
    if (best >= minScore) {
      hits.push({
        questionId: node.id,
        score: best,
        canonicalText: attrs.canonical_text ?? node.id,
        targetAudience: attrs.target_audience,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface FaqResolution {
  questionId: string;
  score: number;
  canonicalText: string;
  answerText?: string;
  answerNodeId?: string;
  claimIds: string[];
  manuscriptIds: string[];
  evidenceIds: string[];
  conceptIds: string[];
  authorIds: string[];
  consensusStatus?: ReasoningEdgeProperties["consensus_status"];
  contested: boolean;
  prerequisiteConceptIds: string[];
}

function neighbors(
  doc: ReasoningGraphDoc,
  sourceId: string,
  relation: ReasoningRelation,
): string[] {
  return doc.edges.filter((e) => e.source === sourceId && e.relation === relation).map((e) => e.target);
}

/**
 * Resolve a matched FAQ into a lay/scholar package:
 * answered_by → AnswerSnippet/Claim → manuscripts / evidence / concepts.
 */
export function resolveFaqAnswer(
  graphDoc: ReasoningGraphDoc,
  questionId: string,
  matchScore = 1,
): FaqResolution | null {
  const node = graphDoc.nodes.find((n) => n.id === questionId && n.type === "FrequentQuestion");
  if (!node) return null;
  const attrs = node.attributes as FrequentQuestionAttributes;

  const answeredTargets = neighbors(graphDoc, questionId, "answered_by");
  let answerText: string | undefined;
  let answerNodeId: string | undefined;
  const claimIds: string[] = [];

  for (const tid of answeredTargets) {
    const t = graphDoc.nodes.find((n) => n.id === tid);
    if (!t) continue;
    if (t.type === "AnswerSnippet" || t.type === "LayExplanation") {
      answerNodeId = tid;
      answerText =
        (t.attributes.answer_text as string | undefined) ??
        (t.attributes.analogy_text as string | undefined);
      claimIds.push(...neighbors(graphDoc, tid, "summarizes_claim"));
    } else if (t.type === "Claim") {
      claimIds.push(tid);
    }
  }

  claimIds.push(...neighbors(graphDoc, questionId, "has_consensus_answer"));

  const manuscriptIds = [
    ...neighbors(graphDoc, questionId, "supported_by_manuscript"),
    ...answeredTargets.flatMap((tid) => neighbors(graphDoc, tid, "supported_by_manuscript")),
  ];
  const evidenceIds = answeredTargets.flatMap((tid) => neighbors(graphDoc, tid, "supported_by_evidence"));
  const conceptIds = neighbors(graphDoc, questionId, "mapped_to_concept");
  const authorIds = neighbors(graphDoc, questionId, "addressed_by_author");
  const contestedIds = neighbors(graphDoc, questionId, "has_contested_answer");

  const consensusEdge = graphDoc.edges.find(
    (e) => e.source === questionId && (e.relation === "has_consensus_answer" || e.relation === "answered_by"),
  );
  const prerequisiteConceptIds = conceptIds.flatMap((cid) =>
    graphDoc.edges.filter((e) => e.relation === "prerequisite_for" && e.target === cid).map((e) => e.source),
  );

  return {
    questionId,
    score: matchScore,
    canonicalText: attrs.canonical_text ?? questionId,
    answerText,
    answerNodeId,
    claimIds: [...new Set(claimIds)],
    manuscriptIds: [...new Set(manuscriptIds)],
    evidenceIds: [...new Set(evidenceIds)],
    conceptIds: [...new Set(conceptIds)],
    authorIds: [...new Set(authorIds)],
    consensusStatus: consensusEdge?.properties?.consensus_status,
    contested: contestedIds.length > 0,
    prerequisiteConceptIds: [...new Set(prerequisiteConceptIds)],
  };
}

/** Match query → best FAQ → full resolution package (Scenario A / B entrypoint). */
export function answerFrequentQuestion(
  graphDoc: ReasoningGraphDoc,
  query: string,
  options?: { audience?: "lay" | "scholar" | "all"; minScore?: number },
): FaqResolution | null {
  const [top] = matchFrequentQuestions(graphDoc, query, {
    limit: 1,
    minScore: options?.minScore ?? 0.2,
    audience: options?.audience,
  });
  if (!top) return null;
  return resolveFaqAnswer(graphDoc, top.questionId, top.score);
}

/**
 * Seed high-frequency HSMS / paleography FAQs onto an existing witness graph.
 * Domain-mapped from "Vitamin D / CRISPR" examples → catchwords, folios, orthography.
 */
export function seedHsmsFaqBundle(
  graphDoc: ReasoningGraphDoc,
  opts?: { manuscriptId?: string; authorId?: string },
): ReasoningGraphDoc {
  const manuscriptId =
    opts?.manuscriptId ??
    graphDoc.nodes.find((n) => n.type === "Manuscript")?.id ??
    "MANUSCRIPT:open";
  const authorId = opts?.authorId ?? graphDoc.nodes.find((n) => n.type === "Author")?.id;

  let doc = graphDoc;

  // Ensure claim exists before FAQ wires answered_by / summarizes_claim.
  if (!doc.nodes.some((n) => n.id === "CLAIM:catchword-quire")) {
    const d = clone(doc);
    upsertNode(d, {
      id: "CLAIM:catchword-quire",
      type: "Claim",
      attributes: {
        proposition_text: "Catchwords mark quire boundaries in this witness.",
        epistemic_status: "accepted",
        certainty_degree: 0.9,
        truth_value: "unknown",
        is_lay_accessible: true,
      },
    });
    upsertEdge(d, manuscriptId, "CLAIM:catchword-quire", "asserts", {
      relevance_score: 0.9,
      confidence_score: 0.9,
      consensus_status: "settled_consensus",
    });
    doc = finalize(d);
  }

  doc = registerFrequentQuestion(doc, {
    questionId: "what-are-catchwords",
    canonicalText: "What are catchwords in a manuscript?",
    alternatePhrasings: [
      "what is a catchword",
      "what are reclamos",
      "explain catchwords at folio feet",
      "qué son los reclamos",
    ],
    targetAudience: "all",
    searchFrequencyTier: "high",
    conceptName: "Catchword",
    manuscriptId,
    authorId,
    answerText:
      "Catchwords (reclamos) are words written at the foot of a page that match the opening of the next quire, helping binders assemble the book in order.",
    readingLevel: "general_public",
    verifiedByEditor: true,
    consensusStatus: "settled_consensus",
    claimId: "catchword-quire",
    relevanceScore: 0.95,
  });

  doc = registerFrequentQuestion(doc, {
    questionId: "recto-vs-verso",
    canonicalText: "What is the difference between recto and verso?",
    alternatePhrasings: [
      "what does folio 1r mean",
      "recto versus verso",
      "qué es recto y verso",
    ],
    targetAudience: "lay",
    searchFrequencyTier: "high",
    conceptName: "Foliation",
    manuscriptId,
    answerText:
      "Recto (r) is the front of a leaf; verso (v) is the back. So folio 1r is the front of the first leaf.",
    readingLevel: "grade_school",
    verifiedByEditor: true,
    consensusStatus: "settled_consensus",
    relevanceScore: 0.98,
  });

  // Prerequisite: Foliation before Catchword
  const d2 = clone(doc);
  upsertEdge(d2, "CONCEPT:Foliation", "CONCEPT:Catchword", "prerequisite_for", {
    relevance_score: 0.9,
  });
  doc = finalize(d2);

  doc = registerFrequentQuestion(doc, {
    questionId: "modern-orthography",
    canonicalText: "What does modern orthography mean in the editor?",
    alternatePhrasings: [
      "toggle modern orthography",
      "ortografía moderna",
      "normalized spelling view",
    ],
    targetAudience: "scholar",
    searchFrequencyTier: "medium",
    conceptName: "Orthography",
    manuscriptId,
    answerText:
      "Modern orthography expands abbreviations and normalizes historical spelling for readability without changing the diplomatic transcription underneath.",
    readingLevel: "undergraduate",
    consensusStatus: "settled_consensus",
    relevanceScore: 0.9,
  });

  return doc;
}
