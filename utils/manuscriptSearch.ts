import { MANUSCRIPT_INTENT_PROTOTYPES } from "@/constants/manuscriptIntents";
import type { ManuscriptBlock, ParsedManuscript } from "@/constants/manuscript";
import { hashEmbed } from "@/utils/embeddings/hashEmbed";
import {
  INTENT_THRESHOLD,
  buildProtoVectors,
  classifyIntent,
  type IntentMatch,
  type ProtoVectors,
} from "@/utils/embeddings/intentClassifier";
import type { ManuscriptChunk, ManuscriptVectorIndex } from "@/utils/manuscriptVectorIndex";

export interface SearchHit {
  chunk: ManuscriptChunk;
  score: number;
}

export interface ManuscriptAskResult {
  intent: IntentMatch | null;
  hits: SearchHit[];
  folioJump: { folioId: string; lineNumber?: string } | null;
  elapsedMs: number;
  mode: "folio" | "filtered" | "search";
}

/**
 * Captures navigational folio references in free-form queries.
 * Use `\bfolio\b` / `fol.` (dot required for the short form) so "folio" is not
 * partially matched as `fol`.
 */
const FOLIO_QUERY_RE =
  /(?:\[?\s*fol\.\s*|\bfolio\s+|\bpage\s+)([a-z0-9]+[rvd]?[a-d]?)\s*\]?/i;

const BARE_FOLIO_RE = /^\s*\[?\s*fol\.\s*([a-z0-9]+[rvd]?[a-d]?)\s*\]?\s*$/i;

/** "go to 2v" / "goto 1r" without an explicit fol. keyword. */
const GOTO_BARE_SIDE_RE =
  /(?:go(?:\s+to)?|goto|turn\s+to)\s+([a-z0-9]*\d+[rvd][a-d]?|[ivxlcdm]+[rvd][a-d]?)\b/i;

let cachedIntentProtos: ProtoVectors | null = null;

function manuscriptIntentProtos(): ProtoVectors {
  if (!cachedIntentProtos) {
    cachedIntentProtos = buildProtoVectors({ ...MANUSCRIPT_INTENT_PROTOTYPES });
  }
  return cachedIntentProtos;
}

/** Resolve a folio id mentioned in the query against the parsed witness. */
export function resolveFolioJump(
  query: string,
  parsed: ParsedManuscript,
): { folioId: string; lineNumber?: string } | null {
  const q = query.trim();
  if (!q || parsed.folios.length === 0) return null;

  const match = q.match(BARE_FOLIO_RE) ?? q.match(FOLIO_QUERY_RE) ?? q.match(GOTO_BARE_SIDE_RE);
  if (!match) return null;

  const raw = match[1].trim();
  const needle = raw.toLowerCase();

  const exact = parsed.folios.find((f) => f.id.toLowerCase() === needle);
  if (exact) return { folioId: exact.id };

  const prefixed = parsed.folios.find(
    (f) => f.id.toLowerCase() === needle || f.id.toLowerCase().startsWith(needle),
  );
  if (prefixed) return { folioId: prefixed.id };

  const contained = parsed.folios.find((f) => f.id.toLowerCase().includes(needle));
  if (contained) return { folioId: contained.id };

  return null;
}

function intentTypeFilter(intent: string | undefined): ManuscriptBlock["type"][] | null {
  switch (intent) {
    case "find_rubric":
      return ["rubric"];
    case "find_gloss":
      return ["gloss", "addendum"];
    default:
      return null;
  }
}

export function searchManuscriptIndex(
  query: string,
  index: ManuscriptVectorIndex,
  topK: number = 5,
  minScore: number = 0.25,
  typeFilter?: ManuscriptBlock["type"][] | null,
): SearchHit[] {
  const q = query.trim();
  if (!q || index.chunks.length === 0) return [];

  const qVec = hashEmbed(q, index.dim);
  const { chunks, matrix, dim } = index;
  const count = chunks.length;
  const scored: SearchHit[] = [];

  for (let i = 0; i < count; i++) {
    const chunk = chunks[i];
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(chunk.type)) {
      continue;
    }
    const offset = i * dim;
    let dot = 0;
    for (let j = 0; j < dim; j++) {
      dot += qVec[j] * matrix[offset + j];
    }
    if (dot >= minScore) {
      scored.push({ chunk, score: dot });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Local manuscript assistant router:
 * 1. Folio regex fast-path
 * 2. Intent classification
 * 3. Vector search (optionally type-filtered)
 */
export function askManuscript(
  query: string,
  parsed: ParsedManuscript,
  index: ManuscriptVectorIndex,
  options?: { topK?: number; minScore?: number; protoVecs?: ProtoVectors },
): ManuscriptAskResult {
  const t0 = performance.now();
  const q = query.trim();
  if (!q) {
    return {
      intent: null,
      hits: [],
      folioJump: null,
      elapsedMs: 0,
      mode: "search",
    };
  }

  const folioJump = resolveFolioJump(q, parsed);
  const protoVecs = options?.protoVecs ?? manuscriptIntentProtos();
  const [top] = classifyIntent(q, protoVecs);
  const intent = top ?? null;
  const confidentIntent =
    intent && intent.score >= INTENT_THRESHOLD ? intent : null;

  // Deterministic folio navigation beats vector search when a leaf is named.
  if (folioJump) {
    return {
      intent: confidentIntent ?? intent,
      hits: [],
      folioJump,
      elapsedMs: performance.now() - t0,
      mode: "folio",
    };
  }

  const typeFilter = intentTypeFilter(confidentIntent?.intent);
  const hits = searchManuscriptIndex(
    q,
    index,
    options?.topK ?? 5,
    options?.minScore ?? 0.25,
    typeFilter,
  );

  return {
    intent: confidentIntent ?? intent,
    hits,
    folioJump: null,
    elapsedMs: performance.now() - t0,
    mode: typeFilter ? "filtered" : "search",
  };
}
