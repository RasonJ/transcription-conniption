import type { ManuscriptBlock, ParsedManuscript } from "@/constants/manuscript";
import { DEFAULT_DIM, hashEmbedInto } from "@/utils/embeddings/hashEmbed";
import { renderNormalizedBlock } from "@/utils/normalizedText";

export interface ManuscriptChunk {
  id: string;
  folioId: string;
  lineNumber?: string;
  blockIndex: number;
  type: ManuscriptBlock["type"];
  text: string;
}

export interface ManuscriptVectorIndex {
  chunks: ManuscriptChunk[];
  /** Contiguous N × dim matrix for cache-friendly cosine dots. */
  matrix: Float32Array;
  dim: number;
}

const SKIP_BLOCK_TYPES = new Set<ManuscriptBlock["type"]>(["diagram", "initial_container"]);

export function buildManuscriptVectorIndex(
  parsed: ParsedManuscript,
  dim: number = DEFAULT_DIM,
): ManuscriptVectorIndex {
  const chunks: ManuscriptChunk[] = [];

  for (const folio of parsed.folios) {
    for (let bi = 0; bi < folio.blocks.length; bi++) {
      const block = folio.blocks[bi];
      if (SKIP_BLOCK_TYPES.has(block.type)) continue;

      const plainText = renderNormalizedBlock(block);
      if (!plainText || plainText.length < 3) continue;

      chunks.push({
        id: `${folio.id}_b${bi}_l${block.lineNumber ?? bi}`,
        folioId: folio.id,
        lineNumber: block.lineNumber,
        blockIndex: bi,
        type: block.type,
        text: plainText,
      });
    }
  }

  const count = chunks.length;
  const matrix = new Float32Array(count * dim);

  for (let i = 0; i < count; i++) {
    const offset = i * dim;
    hashEmbedInto(chunks[i].text, matrix, offset, dim, true);
  }

  return { chunks, matrix, dim };
}
