import type { FolioSide, ManuscriptBlock } from "@/constants/manuscript";
import { blockIsMetadataLeak } from "@/utils/metadataBlocks";
import {
  buildSpatialFolio,
  zipColumnBlockRows,
  type SpatialColumnBlock,
  type SpatialLine,
} from "@/utils/spatialAst";

export type BlockEntry = { block: ManuscriptBlock; bi: number; wrapBackSuffix?: string };

export type FolioLayoutGroup =
  | { kind: "single"; block: ManuscriptBlock; bi: number; wrapBackSuffix?: string; isLastLine?: boolean }
  | {
      kind: "two-col";
      left: (BlockEntry | undefined)[];
      right: (BlockEntry | undefined)[];
    }
  | { kind: "column-block"; layout: 1 | 2; groups: FolioLayoutGroup[] };

export function getPrintableBlocks(folio: FolioSide): ManuscriptBlock[] {
  return folio.blocks.filter((b) => !blockIsMetadataLeak(b));
}

function lineToEntry(line: SpatialLine): BlockEntry {
  return {
    block: line.block,
    bi: line.bi,
    wrapBackSuffix: line.wrapBackSuffix,
  };
}

function columnBlockToGroups(cb: SpatialColumnBlock): FolioLayoutGroup[] {
  if (cb.layout === 1) {
    const singleGroups: FolioLayoutGroup[] = [];
    for (let i = 0; i < cb.lines.length; i++) {
      const line = cb.lines[i];
      singleGroups.push({
        kind: "single",
        block: line.block,
        bi: line.bi,
        wrapBackSuffix: line.wrapBackSuffix,
        isLastLine: i === cb.lines.length - 1,
      });
    }
    return singleGroups;
  }

  const rows = zipColumnBlockRows(cb);
  const leftEntries: (BlockEntry | undefined)[] = [];
  const rightEntries: (BlockEntry | undefined)[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    leftEntries.push(r.left ? lineToEntry(r.left) : undefined);
    rightEntries.push(r.right ? lineToEntry(r.right) : undefined);
  }

  return [
    {
      kind: "two-col",
      left: leftEntries,
      right: rightEntries,
    },
  ];
}

/** Physical layout groups derived from spatial {CB.} column blocks. */
export function groupFolioLayout(printableBlocks: ManuscriptBlock[]): FolioLayoutGroup[] {
  const spatial = buildSpatialFolio({ id: "", headings: [], blocks: printableBlocks });
  const groups: FolioLayoutGroup[] = [];

  for (let i = 0; i < spatial.columnBlocks.length; i++) {
    groups.push({
      kind: "column-block",
      layout: spatial.columnBlocks[i].layout,
      groups: columnBlockToGroups(spatial.columnBlocks[i]),
    });
  }

  return groups;
}

/** Flatten column-block wrapper for legacy single/two-col consumers. */
export function flattenFolioLayoutGroups(groups: FolioLayoutGroup[]): FolioLayoutGroup[] {
  const flat: FolioLayoutGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.kind === "column-block") {
      flat.push(...g.groups);
    } else {
      flat.push(g);
    }
  }
  return flat;
}
