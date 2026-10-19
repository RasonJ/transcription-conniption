/**
 * Lift hsms-facets/1 sidecars (e.g. assets/library/facets/1500__auto_02.json)
 * into Manuscript / WitnessStats / LemmaNode / Hand / LanguageSpan nodes and
 * inferred edges (contains_term, exhibits_hand, has_rubric_hit, …).
 */
import type { PrecompiledFacets } from "../corpusPrecompute";
import { computeReasoningDagHash } from "./hash";
import type {
  AgentAttributes,
  DropInitialAttributes,
  HandAttributes,
  LanguageSpanAttributes,
  LemmaNodeAttributes,
  ManuscriptAttributes,
  ReasoningGraphDoc,
  ReasoningNode,
  ReasoningRelation,
  WitnessStatsAttributes,
} from "./types";
import { REASONING_GRAPH_SCHEMA_VERSION } from "./types";

export type FacetsCatalogHints = {
  title?: string;
  author?: string;
  year?: string;
  city?: string;
  printer?: string;
  shelfmark?: string;
  keywords?: string;
};

function utcNowIso(): string {
  return new Date().toISOString();
}

function emptyDoc(): ReasoningGraphDoc {
  return {
    schema_version: REASONING_GRAPH_SCHEMA_VERSION,
    domain: "hsms_scriptorium",
    lifecycle_stages: ["INGEST", "VALIDATE", "EDIT", "ANALYZE", "EXPORT", "LIBRARY"],
    nodes: [],
    edges: [],
  };
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
  properties?: Record<string, unknown>,
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

function finalize(doc: ReasoningGraphDoc): ReasoningGraphDoc {
  doc.dag_hash = computeReasoningDagHash(doc);
  return doc;
}

export type SeedFacetsOptions = {
  /** Cap LemmaNode / contains_term edges (default 80). */
  topTerms?: number;
  /** Terms with tf===1 become has_hapax_term as well when ≤ this many (default 40). */
  maxHapaxEdges?: number;
  catalog?: FacetsCatalogHints;
  manuscriptId?: string;
};

/**
 * Build or extend a reasoning graph from a precompiled facets sidecar.
 * Infers:
 *   Manuscript ─has_stats→ WitnessStats
 *   Manuscript ─contains_term→ LemmaNode (weight=tf)
 *   Manuscript ─exhibits_hand→ Hand
 *   Manuscript ─code_switches_to→ LanguageSpan
 *   Manuscript ─uses_block_type / uses_token_type→ Concept
 *   Manuscript ─has_rubric_hit / has_gloss_hit / has_drop_initial_hit→ hit nodes
 *   Author ─authored→ Manuscript (when catalog.author present)
 */
export function seedFacetsIntoGraph(
  facets: PrecompiledFacets,
  existing?: ReasoningGraphDoc,
  options?: SeedFacetsOptions,
): ReasoningGraphDoc {
  const doc = existing
    ? { ...existing, nodes: [...existing.nodes], edges: [...existing.edges] }
    : emptyDoc();

  const base = facets.baseName;
  const manuscriptId = options?.manuscriptId ?? `MANUSCRIPT:${base}`;
  const witnessId = `WITNESS:${base}`;
  const statsId = `STATS:${base}`;
  const topTerms = options?.topTerms ?? 80;
  const maxHapax = options?.maxHapaxEdges ?? 40;
  const cat = options?.catalog;

  const msAttrs: ManuscriptAttributes = {
    manuscript_id: manuscriptId,
    id: manuscriptId,
    baseName: base,
    witnessHash: facets.witnessHash,
    title: cat?.title ?? base,
    author: cat?.author,
    publication_date: cat?.year,
    dateCreated: cat?.year,
    city: cat?.city,
    shelfmark: cat?.shelfmark,
    wordCount: facets.wordCount,
    typeCount: facets.typeCount,
    ttr: facets.ttr,
    sttr: facets.sttr,
    hapax: facets.hapax,
    blockCounts: facets.facets.blockCounts,
    tokenCounts: facets.facets.tokenCounts,
    paper_type: "Critical Edition",
    peer_review_status: "Transcription",
    field_of_study: ["Philology", "Manuscript Studies"],
    claim_count: 0,
    retraction_flag: false,
  };
  upsertNode(doc, { id: manuscriptId, type: "Manuscript", attributes: msAttrs });
  upsertNode(doc, {
    id: witnessId,
    type: "Witness",
    attributes: { label: base, witnessHash: facets.witnessHash },
  });
  upsertEdge(doc, witnessId, manuscriptId, "contains", {});

  const statsAttrs: WitnessStatsAttributes = {
    id: statsId,
    baseName: base,
    witnessHash: facets.witnessHash,
    wordCount: facets.wordCount,
    typeCount: facets.typeCount,
    ttr: facets.ttr,
    sttr: facets.sttr,
    hapax: facets.hapax,
    rubricCount: facets.facets.rubrics.length,
    glossCount: facets.facets.glosses.length,
    dropInitialCount: facets.facets.dropInitials.length,
    blockCounts: facets.facets.blockCounts,
    tokenCounts: facets.facets.tokenCounts,
  };
  upsertNode(doc, { id: statsId, type: "WitnessStats", attributes: statsAttrs });
  upsertEdge(doc, manuscriptId, statsId, "has_stats", {});

  if (cat?.author?.trim()) {
    const authorId = `AGENT:${cat.author.toLowerCase().replace(/\s+/g, "_")}`;
    const agentAttrs: AgentAttributes = {
      id: authorId,
      name: cat.author,
      type: "author",
      flourishedPeriod: cat.year,
    };
    upsertNode(doc, { id: authorId, type: "Agent", attributes: agentAttrs });
    upsertNode(doc, {
      id: authorId.replace(/^AGENT:/, "AUTHOR:"),
      type: "Author",
      attributes: { full_name: cat.author, name: cat.author, author_id: authorId },
    });
    upsertEdge(doc, authorId, manuscriptId, "authored", { author_order: "1st_author" });
    upsertEdge(doc, manuscriptId, authorId, "attributed_to", {});
  }

  // Block / token type usage concepts
  for (const [blockType, count] of Object.entries(facets.facets.blockCounts ?? {})) {
    const conceptId = `CONCEPT:block_type:${blockType}`;
    upsertNode(doc, {
      id: conceptId,
      type: "Concept",
      attributes: { canonical_name: blockType, field_code: "block_type" },
    });
    upsertEdge(doc, manuscriptId, conceptId, "uses_block_type", { count, tf: count });
  }
  for (const [tokenType, count] of Object.entries(facets.facets.tokenCounts ?? {})) {
    const conceptId = `CONCEPT:token_type:${tokenType}`;
    upsertNode(doc, {
      id: conceptId,
      type: "Concept",
      attributes: { canonical_name: tokenType, field_code: "token_type" },
    });
    upsertEdge(doc, manuscriptId, conceptId, "uses_token_type", { count, tf: count });
  }

  // Hands
  for (const h of facets.facets.hands ?? []) {
    const handId = `HAND:${base}:${h.hand}`;
    const attrs: HandAttributes = { id: handId, hand: h.hand, count: h.count };
    upsertNode(doc, { id: handId, type: "Hand", attributes: attrs });
    upsertEdge(doc, manuscriptId, handId, "exhibits_hand", { count: h.count, tf: h.count });
  }

  // Code-switching language spans
  for (const cs of facets.facets.codeSwitching ?? []) {
    const langId = `LANG:${base}:${cs.lang}`;
    const attrs: LanguageSpanAttributes = {
      id: langId,
      lang: cs.lang,
      words: cs.words,
      tokens: cs.tokens,
      spans: cs.spans,
    };
    upsertNode(doc, { id: langId, type: "LanguageSpan", attributes: attrs });
    upsertEdge(doc, manuscriptId, langId, "code_switches_to", {
      count: cs.spans,
      tf: cs.words,
    });
  }

  // Rubric / gloss / drop-initial hits
  facets.facets.rubrics.forEach((hit, i) => {
    const id = `RUBRIC:${base}:${i}:${hit.folioId}`;
    upsertNode(doc, {
      id,
      type: "Block",
      attributes: {
        type: "rubric",
        folioId: hit.folioId,
        lineNumber: hit.line,
        excerpt: hit.text,
      },
    });
    upsertEdge(doc, manuscriptId, id, "has_rubric_hit", {
      folioId: hit.folioId,
      line: hit.line,
    });
  });
  facets.facets.glosses.forEach((hit, i) => {
    const id = `GLOSS:${base}:${i}:${hit.folioId}`;
    upsertNode(doc, {
      id,
      type: "Block",
      attributes: {
        type: "gloss",
        folioId: hit.folioId,
        lineNumber: hit.line,
        excerpt: hit.text,
        language: hit.type,
      },
    });
    upsertEdge(doc, manuscriptId, id, "has_gloss_hit", {
      folioId: hit.folioId,
      line: hit.line,
    });
  });
  facets.facets.dropInitials.forEach((hit, i) => {
    const id = `DROP:${base}:${i}:${hit.folioId}`;
    const attrs: DropInitialAttributes = {
      id,
      letter: hit.letter ?? hit.text?.slice(0, 1),
      depthInLines: hit.depth,
      style: "ornate",
    };
    upsertNode(doc, { id, type: "DropInitial", attributes: attrs });
    upsertEdge(doc, manuscriptId, id, "has_drop_initial_hit", {
      folioId: hit.folioId,
      line: hit.line,
    });
  });

  // Term frequency → LemmaNode
  const ranked = Object.entries(facets.termFreq ?? {}).sort((a, b) => b[1] - a[1]);
  let hapaxLinked = 0;
  for (const [term, tf] of ranked.slice(0, topTerms)) {
    const lemmaId = `LEMMA:${term}`;
    const lemmaAttrs: LemmaNodeAttributes = { id: lemmaId, lemma: term };
    upsertNode(doc, { id: lemmaId, type: "LemmaNode", attributes: lemmaAttrs });
    upsertEdge(doc, manuscriptId, lemmaId, "contains_term", { tf, count: tf, weight: tf });
    if (tf === 1 && hapaxLinked < maxHapax) {
      upsertEdge(doc, manuscriptId, lemmaId, "has_hapax_term", { tf: 1 });
      hapaxLinked += 1;
    }
  }
  // Remaining hapax among top slice already handled; if topTerms cut off hapax, pull a few more tf=1
  if (hapaxLinked < maxHapax) {
    for (const [term, tf] of ranked) {
      if (tf !== 1) continue;
      if (hapaxLinked >= maxHapax) break;
      const lemmaId = `LEMMA:${term}`;
      if (doc.edges.some((e) => e.relation === "has_hapax_term" && e.target === lemmaId)) continue;
      upsertNode(doc, {
        id: lemmaId,
        type: "LemmaNode",
        attributes: { id: lemmaId, lemma: term } satisfies LemmaNodeAttributes,
      });
      upsertEdge(doc, manuscriptId, lemmaId, "has_hapax_term", { tf: 1 });
      hapaxLinked += 1;
    }
  }

  return finalize(doc);
}

/** Top terms by contains_term weight for a manuscript. */
export function topTermsForManuscript(
  graphDoc: ReasoningGraphDoc,
  manuscriptId: string,
  limit = 20,
): Array<{ lemma: string; tf: number }> {
  return graphDoc.edges
    .filter((e) => e.source === manuscriptId && e.relation === "contains_term")
    .map((e) => ({
      lemma: String(graphDoc.nodes.find((n) => n.id === e.target)?.attributes.lemma ?? e.target),
      tf: Number(e.properties?.tf ?? e.properties?.weight ?? 0),
    }))
    .sort((a, b) => b.tf - a.tf)
    .slice(0, limit);
}
