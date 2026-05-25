import type { ManuscriptBlock, ParsedManuscript } from "../constants/manuscript";

const RMK_PATTERN = /\{RMK:\s*[^}]+\}/i;

/** True when a parsed block still carries remark/metadata markup that must not render as body text. */
export function blockIsMetadataLeak(block: ManuscriptBlock): boolean {
  const raw = block.tokens.map((t) => t.raw || t.value).join(" ");
  return RMK_PATTERN.test(raw);
}

/** Remove remark/header blocks that leaked into folio body streams. */
export function filterMetadataBlocksFromFolios(parsed: ParsedManuscript): ParsedManuscript {
  return {
    ...parsed,
    folios: parsed.folios.map((folio) => ({
      ...folio,
      blocks: folio.blocks.filter((block) => !blockIsMetadataLeak(block)),
    })),
  };
}
