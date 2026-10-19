import type { ManuscriptBlock } from "@/constants/manuscript";
import { DEFAULT_DIM, hashEmbedInto } from "@/utils/embeddings/hashEmbed";
import { renderNormalizedBlock } from "@/utils/normalizedText";

/** Bitfield of structural HSMS features on a block (dims 32–47 slot). */
export const MCP_FLAG = {
  SCRIBAL_DELETION: 1 << 0,
  EDITORIAL_DELETION: 1 << 1,
  EXPANSION: 1 << 2,
  RUBRIC: 1 << 3,
  LANGUAGE_SPAN: 1 << 4,
  GLOSS: 1 << 5,
  DROP_INITIAL: 1 << 6,
  FIGURE: 1 << 7,
  RECONSTRUCTION: 1 << 8,
  ILLEGIBLE: 1 << 9,
} as const;

export interface McpBlockVector {
  blockId: string;
  folioId: string;
  lineNumber?: string;
  /** 32-byte quantized semantic fingerprint (top hash dims packed). */
  semanticHash: Uint8Array;
  /** HSMS mnemonic bitfield. */
  featureFlags: number;
  /** Codicological cues: folio progress, columns, word-ish density. */
  codicology: {
    folioProgress: number;
    columns: number;
    charCount: number;
  };
}

function packSemanticHash(text: string, bytes = 32): Uint8Array {
  const dim = Math.max(bytes, 32);
  const buf = new Float32Array(dim);
  hashEmbedInto(text, buf, 0, dim, true);
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    // Map [-1,1] → [0,255]
    const v = Math.max(-1, Math.min(1, buf[i] ?? 0));
    out[i] = Math.round((v + 1) * 127.5);
  }
  return out;
}

export function featureFlagsForBlock(block: ManuscriptBlock): number {
  let flags = 0;
  if (block.type === "rubric" || block.type === "heading") flags |= MCP_FLAG.RUBRIC;
  if (block.type === "gloss" || block.type === "addendum") flags |= MCP_FLAG.GLOSS;
  if (block.type === "language_span") flags |= MCP_FLAG.LANGUAGE_SPAN;

  for (let i = 0; i < block.tokens.length; i++) {
    const tok = block.tokens[i];
    switch (tok.type) {
      case "scribal_deletion":
        flags |= MCP_FLAG.SCRIBAL_DELETION;
        break;
      case "editorial_deletion":
        flags |= MCP_FLAG.EDITORIAL_DELETION;
        break;
      case "expansion":
        flags |= MCP_FLAG.EXPANSION;
        break;
      case "drop_initial":
        flags |= MCP_FLAG.DROP_INITIAL;
        break;
      case "figure_anchor":
        flags |= MCP_FLAG.FIGURE;
        break;
      case "reconstructed_text":
        flags |= MCP_FLAG.RECONSTRUCTION;
        break;
      case "illegible":
        flags |= MCP_FLAG.ILLEGIBLE;
        break;
      default:
        break;
    }
    if (tok.envLayers?.some((l) => l.type === "rubric")) flags |= MCP_FLAG.RUBRIC;
    if (tok.envLayers?.some((l) => l.type === "language_span")) flags |= MCP_FLAG.LANGUAGE_SPAN;
    if (tok.envLayers?.some((l) => l.type === "gloss" || l.type === "addendum")) {
      flags |= MCP_FLAG.GLOSS;
    }
  }
  return flags;
}

/** Hybrid local vector: semantic hash + HSMS flags + light codicology. */
export function encodeMcpBlock(
  block: ManuscriptBlock,
  folioId: string,
  blockIndex: number,
  folioProgress = 0,
): McpBlockVector {
  const text = renderNormalizedBlock(block);
  return {
    blockId: `${folioId}_b${blockIndex}_l${block.lineNumber ?? blockIndex}`,
    folioId,
    lineNumber: block.lineNumber,
    semanticHash: packSemanticHash(text || folioId),
    featureFlags: featureFlagsForBlock(block),
    codicology: {
      folioProgress: Math.max(0, Math.min(1, folioProgress)),
      columns: block.columns ?? 1,
      charCount: text.length,
    },
  };
}

/** Hamming-ish distance on packed semantic bytes (0 = identical). */
export function semanticHashDistance(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

export function flagsMatchQuery(flags: number, required: number): boolean {
  return (flags & required) === required;
}

/** @internal exported for tests — default embed dim used by the semantic packer. */
export const MCP_SEMANTIC_PACK_DIM = DEFAULT_DIM;
