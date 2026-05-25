import type { FolioSide, ManuscriptBlock, Token } from "@/constants/manuscript";
import { blockIsMetadataLeak } from "@/utils/metadataBlocks";

/** Visio-spatial document tree (maps HSMS {CB.}/{IN.}/{RUB.} to layout units). */
export type SpatialNodeType =
  | "Folio"
  | "Header"
  | "ColumnBlock"
  | "Line"
  | "DropCap"
  | "Rubric"
  | "Gloss"
  | "Addendum"
  | "LanguageSpan"
  | "Diagram"
  | "TextSpan"
  | "LineWrap"
  | "BlankSpace"
  | "Figure";

export interface SpatialNode {
  type: SpatialNodeType;
  props?: Record<string, unknown>;
  children?: SpatialNode[];
  text?: string;
}

export type ColumnTrack = "left" | "right" | "full";

/** One physical manuscript line (one HSMS source row inside a {CB.} envelope). */
export interface SpatialLine {
  block: ManuscriptBlock;
  bi: number;
  track: ColumnTrack;
  /** %2 wrap-back fragment rendered into the preceding line's right margin. */
  wrapBackSuffix?: string;
  ast?: SpatialNode[];
}

/** A contiguous {CBn.} column-format run on a folio side. */
export interface SpatialColumnBlock {
  layout: 1 | 2;
  lines: SpatialLine[];
}

export interface SpatialFolio {
  id: string;
  headers: SpatialNode[];
  columnBlocks: SpatialColumnBlock[];
  catchword?: string;
  signature?: string;
}

function tokenToSpatialNode(tok: Token, blockType: ManuscriptBlock["type"]): SpatialNode | null {
  switch (tok.type) {
    case "drop_initial":
      return {
        type: "DropCap",
        text: tok.value,
        props: { depth: tok.initialDepth ?? 3 },
      };
    case "figure_anchor":
      return {
        type: "Figure",
        text: tok.figureType ?? "FIG",
        props: { figureId: tok.figureId, figureType: tok.figureType },
      };
    case "blank_space":
      return { type: "BlankSpace", text: tok.value };
    case "calderon_two":
      return { type: "LineWrap", props: { direction: "previous" } };
    case "calderon_three":
      return { type: "LineWrap", props: { direction: "following" } };
    case "calderon":
      return { type: "TextSpan", text: "¶", props: { variant: "calderon" } };
    case "env_open":
    case "env_close":
      return null;
    default:
      return {
        type: "TextSpan",
        text: tok.normalized ?? tok.value,
        props: {
          variant: tok.type,
          blockType,
          envLayers: tok.envLayers,
        },
      };
  }
}

/** Inline token tree for one line (nested env layers preserved on TextSpan props). */
export function lineToAstNodes(block: ManuscriptBlock): SpatialNode[] {
  const nodes: SpatialNode[] = [];
  if (block.type === "diagram") {
    return [{ type: "Diagram", props: { columns: block.columns } }];
  }
  if (block.type === "rubric") {
    nodes.push({ type: "Rubric", children: [] });
  } else if (block.type === "gloss") {
    nodes.push({ type: "Gloss", children: [] });
  } else if (block.type === "addendum") {
    nodes.push({ type: "Addendum", children: [] });
  } else if (block.type === "language_span") {
    nodes.push({ type: "LanguageSpan", props: { language: block.language } });
  }

  for (const tok of block.tokens) {
    const n = tokenToSpatialNode(tok, block.type);
    if (n) nodes.push(n);
  }
  return nodes;
}

function assignCb2Tracks(blocks: ManuscriptBlock[], startBi: number): SpatialLine[] {
  const lines: SpatialLine[] = [];
  let leftCount = 0;
  let rightCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const track: ColumnTrack =
      block.type === "gloss" || leftCount > rightCount ? "right" : "left";
    if (track === "left") leftCount++;
    else rightCount++;
    lines.push({
      block,
      bi: startBi + i,
      track,
      ast: lineToAstNodes(block),
    });
  }
  return lines;
}

function applyWrapBackLines(lines: SpatialLine[]): void {
  for (let li = 1; li < lines.length; li++) {
    const tokens = lines[li].block.tokens;
    const wrapIdx = tokens.findIndex((t) => t.type === "calderon_two");
    if (wrapIdx < 0) continue;

    const leadingOk =
      wrapIdx === 0 ||
      (wrapIdx === 1 && tokens[0]?.type === "drop_initial") ||
      (wrapIdx > 0 && tokens.slice(0, wrapIdx).every((t) => t.type === "env_open"));

    if (!leadingOk) continue;

    const suffixTokens = tokens.slice(wrapIdx + 1);
    if (suffixTokens.length === 0) continue;

    const prev = lines[li - 1];
    if (prev.track === lines[li].track || lines[li].track === "full") {
      prev.wrapBackSuffix = suffixTokens.map((t) => t.normalized ?? t.value).join("");
      // Carrier row keeps only tokens through %2 — suffix renders on the previous line.
      lines[li] = {
        ...lines[li],
        block: {
          ...lines[li].block,
          tokens: tokens.slice(0, wrapIdx + 1),
        },
      };
    }
  }
}

/** Attach %2 wrap-back suffixes to preceding lines (mutates `lines` in place). */
export function applyWrapBackLinesInPlace(lines: SpatialLine[]): void {
  applyWrapBackLines(lines);
}

function segmentColumnBlocks(printableBlocks: ManuscriptBlock[]): SpatialColumnBlock[] {
  const out: SpatialColumnBlock[] = [];
  let i = 0;

  while (i < printableBlocks.length) {
    const layout = (printableBlocks[i].columns || 1) as 1 | 2;
    const startBi = i;
    const segment: ManuscriptBlock[] = [];

    while (i < printableBlocks.length && (printableBlocks[i].columns || 1) === layout) {
      segment.push(printableBlocks[i]);
      i++;
    }

    const lines =
      layout === 1
        ? segment.map((block, j) => ({
            block,
            bi: startBi + j,
            track: "full" as const,
            ast: lineToAstNodes(block),
          }))
        : assignCb2Tracks(segment, startBi);

    applyWrapBackLines(lines);
    out.push({ layout, lines });
  }

  return out;
}

/** Build nested spatial document for one folio side from the compiled block stream. */
export function buildSpatialFolio(folio: FolioSide): SpatialFolio {
  const printable = folio.blocks.filter((b) => !blockIsMetadataLeak(b));

  return {
    id: folio.id,
    headers: folio.headings.map((h) => ({ type: "Header", text: h })),
    columnBlocks: segmentColumnBlocks(printable),
    catchword: folio.catchword,
    signature: folio.signature,
  };
}

/** Row-major zip of left/right tracks inside one {CB2.} column block. */
export function zipColumnBlockRows(columnBlock: SpatialColumnBlock): Array<{
  left?: SpatialLine;
  right?: SpatialLine;
}> {
  if (columnBlock.layout !== 2) {
    return columnBlock.lines.map((line) => ({ left: line }));
  }

  const left = columnBlock.lines.filter((l) => l.track === "left");
  const right = columnBlock.lines.filter((l) => l.track === "right");
  const rowCount = Math.max(left.length, right.length);
  const rows: Array<{ left?: SpatialLine; right?: SpatialLine }> = [];

  for (let ri = 0; ri < rowCount; ri++) {
    rows.push({ left: left[ri], right: right[ri] });
  }
  return rows;
}
