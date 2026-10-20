import { buildInitialScene, serializeInitialScene } from "@/utils/initials/scene";
import { resolveInitialSpec } from "@/utils/initials/spec";
import { renderJustifiedSvgLine } from "@/components/svgFacsimile/justifiedSvgLine";
import { segsLineWidth } from "@/components/svgFacsimile/glyphMetrics";
import {
  CANVAS_W,
  CAP_GUTTER,
  dropCapBoxWidth,
  columnWidth,
  GUTTER_WIDTH,
  innerCanvasWidth,
  MARGIN,
  PAGE_PAD_BOT,
  PAGE_PAD_TOP,
  PARCHMENT_BG,
} from "@/components/svgFacsimile/pageLayout";
import {
  blockToSegs,
  coalesceSegs,
  stripDropCapPrefixFromSegs,
  type DisplaySettings,
  type Seg,
  FS,
  LH,
  FAINT_FILL,
  RUBRIC_FILL,
  seg,
} from "@/components/svgFacsimile/tokenRendering";
import type { ManuscriptBlock, ParsedManuscript } from "@/constants/manuscript";
import { dropCapFontSize } from "@/utils/dropInitial";
import { blockIsMetadataLeak } from "@/utils/metadataBlocks";
import { formatRunningHeaderText } from "@/utils/metadataText";
import { buildSpatialFolio, zipColumnBlockRows } from "@/utils/spatialAst";

export type SvgExportOptions = {
  showExpanded?: boolean;
  showDeletions?: boolean;
  useNormalizedDiacritics?: boolean;
  suppressOtioseMarks?: boolean;
  canvasWidth?: number;
};

type ResolvedOpts = Required<Omit<SvgExportOptions, "canvasWidth">> & { canvasWidth: number };

const DEFAULT_OPTS: ResolvedOpts = {
  showExpanded: true,
  showDeletions: true,
  useNormalizedDiacritics: true,
  suppressOtioseMarks: false,
  canvasWidth: CANVAS_W,
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function displaySettings(opts: ResolvedOpts): DisplaySettings {
  return {
    showExpanded: opts.showExpanded,
    showDeletions: opts.showDeletions,
    suppressOtioseMarks: opts.suppressOtioseMarks,
    useNormalizedDiacritics: opts.useNormalizedDiacritics,
  };
}

function serializeOrnateInitial(
  letter: string,
  cx: number,
  cy: number,
  _capW: number,
  capH: number,
  _capFS: number,
  folioId: string,
  blockIndex: number,
  _bkey: string,
): string[] {
  const depth = Math.max(1, Math.round(capH / LH));
  const scene = buildInitialScene(
    resolveInitialSpec({
      letter,
      depth,
      tradition: "print.woodcut",
      sequence: blockIndex,
      seed: `${folioId}|${letter}|${blockIndex}`,
    }),
    capH / depth,
  );
  return [serializeInitialScene(scene, cx, cy)];
}

/** Word-gap justified line — compact `<tspan>` groups (matches SvgFacsimilePage). */
function renderJustifiedSegs(
  segs: Seg[],
  targetWidth: number,
  startX: number,
  baselineY: number,
  isLastLine: boolean,
  skipJustify: boolean,
  centerInColumn: boolean,
): { elements: string[]; endX: number } {
  const visible = coalesceSegs(segs.filter((s) => s.text));
  if (visible.length === 0) {
    return { elements: [], endX: startX };
  }

  let textStartX = startX;
  if (centerInColumn) {
    textStartX = startX + Math.max(0, (targetWidth - segsLineWidth(visible)) / 2);
  }

  const lineXml = renderJustifiedSvgLine(
    visible,
    textStartX,
    baselineY,
    targetWidth,
    isLastLine,
    skipJustify || centerInColumn,
  );

  const skip = skipJustify || centerInColumn;
  const endX =
    skip || isLastLine ? textStartX + segsLineWidth(visible) : textStartX + targetWidth;
  return { elements: lineXml ? [lineXml] : [], endX };
}

interface ColumnCapState {
  textX: number;
  rowsLeft: number;
}

function defaultCapState(colX: number): ColumnCapState {
  return { textX: colX, rowsLeft: 0 };
}

function paintBlockRow(
  block: ManuscriptBlock,
  opts: ResolvedOpts,
  settings: DisplaySettings,
  folioId: string,
  blockIndex: number,
  startX: number,
  baselineY: number,
  targetWidth: number,
  capState: ColumnCapState,
  isLastLine: boolean,
  bkey: string,
  wrapBackSuffix?: string,
): { elements: string[]; nextCap: ColumnCapState } {
  const elements: string[] = [];
  let nextCap = { ...capState };

  if (blockIsMetadataLeak(block)) {
    return { elements, nextCap };
  }

  if (block.type === "diagram") {
    elements.push(
      `<rect x="${startX}" y="${baselineY - FS}" width="${targetWidth}" height="60" fill="none" stroke="${RUBRIC_FILL}" stroke-dasharray="4,4"/>`,
      `<text x="${(startX + targetWidth / 2).toFixed(2)}" y="${(baselineY + 20).toFixed(2)}" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${FAINT_FILL}">[Diagram]</text>`,
    );
    return { elements, nextCap };
  }

  const dropTok = block.tokens.find((t) => t.type === "drop_initial") ?? null;
  let lineSegs = blockToSegs(block, settings);

  let textX = nextCap.rowsLeft > 0 ? nextCap.textX : startX;
  let rowWidth = targetWidth;

  if (dropTok) {
    const depth = dropTok.initialDepth ?? 3;
    const letter = dropTok.value ?? "?";
    if (depth <= 1) {
      lineSegs.unshift(seg({ text: letter, fill: RUBRIC_FILL, bold: true, fs: FS * 1.4 }));
    } else {
      const capH = depth * LH;
      const letterCount = Math.max(1, letter.length);
      const capW = dropCapBoxWidth(capH, letterCount);
      const capFS =
        Math.min(dropCapFontSize(depth), capH * 0.78) /
        (letterCount > 1 ? 1 + 0.22 * (letterCount - 1) : 1);
      const capTopY = baselineY - FS;
      elements.push(
        ...serializeOrnateInitial(
          letter,
          startX,
          capTopY,
          capW,
          capH,
          capFS,
          folioId,
          blockIndex,
          bkey,
        ),
      );
      textX = startX + capW + CAP_GUTTER;
      rowWidth = targetWidth - (capW + CAP_GUTTER);
      nextCap = { textX, rowsLeft: depth - 1 };
      lineSegs = stripDropCapPrefixFromSegs(lineSegs, letter);
    }
  } else if (nextCap.rowsLeft > 0) {
    rowWidth = targetWidth - (textX - startX);
    nextCap = { ...nextCap, rowsLeft: nextCap.rowsLeft - 1 };
  }

  if (block.lineNumber) {
    elements.push(
      `<text x="${(startX - 14).toFixed(2)}" y="${baselineY.toFixed(2)}" text-anchor="end" font-family="monospace" font-size="11" fill="${FAINT_FILL}">${escapeXml(block.lineNumber)}</text>`,
    );
  }

  const isRubric = block.type === "rubric" || block.type === "heading";
  const isGloss = block.type === "gloss";
  const skipJustify = isRubric || isGloss;

  const rendered = renderJustifiedSegs(
    lineSegs,
    rowWidth,
    textX,
    baselineY,
    isLastLine,
    skipJustify,
    isRubric,
  );
  elements.push(...rendered.elements);

  if (wrapBackSuffix) {
    elements.push(
      `<text x="${(rendered.endX + 6).toFixed(2)}" y="${baselineY.toFixed(2)}" font-family="Georgia, serif" font-size="${FS}" fill="${FAINT_FILL}" font-style="italic">${escapeXml(wrapBackSuffix)}</text>`,
    );
  }

  return { elements, nextCap };
}

/**
 * Standalone SVG document for all folios (export / rasterization source).
 * Uses spatial column blocks and word-gap justification — same model as facsimile preview.
 */
export function exportToSvgDocument(parsed: ParsedManuscript, options: SvgExportOptions = {}): string {
  const opts: ResolvedOpts = { ...DEFAULT_OPTS, ...options };
  const settings = displaySettings(opts);
  const innerW = innerCanvasWidth();
  const colW = columnWidth();
  const leftColX = MARGIN;
  const rightColX = MARGIN + colW + GUTTER_WIDTH;

  const parts: string[] = [];
  let currentY = PAGE_PAD_TOP;

  const title = escapeXml(parsed.metadata.title || "Manuscript preview");
  parts.push(
    `<text x="${opts.canvasWidth / 2}" y="${currentY + 20}" text-anchor="middle" font-family="Georgia, serif" font-size="20" font-weight="bold" fill="#1a0a05">${title}</text>`,
  );
  currentY += 36;

  if (parsed.metadata.author) {
    parts.push(
      `<text x="${opts.canvasWidth / 2}" y="${currentY + 14}" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#6d5339">${escapeXml(parsed.metadata.author)}</text>`,
    );
    currentY += 24;
  }

  for (let fi = 0; fi < parsed.folios.length; fi++) {
    const folio = parsed.folios[fi];
    const spatialFolio = buildSpatialFolio(folio);

    parts.push(
      `<text x="${opts.canvasWidth - MARGIN}" y="${currentY + 12}" text-anchor="end" font-family="Georgia, serif" font-size="12" font-weight="bold" fill="#6d5339">folio ${escapeXml(folio.id)}</text>`,
    );
    currentY += 24;

    for (let hi = 0; hi < folio.headings.length; hi++) {
      const headText = formatRunningHeaderText(folio.headings[hi], {
        showExpanded: settings.showExpanded,
        useNormalizedDiacritics: settings.useNormalizedDiacritics,
        suppressOtioseMarks: settings.suppressOtioseMarks,
      });
      if (!headText) continue;
      parts.push(
        `<text x="${opts.canvasWidth / 2}" y="${currentY + FS}" text-anchor="middle" font-family="Georgia, serif" font-size="${FS}" font-style="italic" fill="${RUBRIC_FILL}">${escapeXml(headText)}</text>`,
      );
      currentY += LH;
    }

    for (let cbi = 0; cbi < spatialFolio.columnBlocks.length; cbi++) {
      const cb = spatialFolio.columnBlocks[cbi];
      const rows = zipColumnBlockRows(cb);

      let capState = defaultCapState(leftColX);
      let leftCap = defaultCapState(leftColX);
      let rightCap = defaultCapState(rightColX);

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const isLastLine = ri === rows.length - 1;
        const baselineY = currentY + FS;

        if (cb.layout === 1) {
          if (row.left) {
            const res = paintBlockRow(
              row.left.block,
              opts,
              settings,
              folio.id,
              row.left.bi,
              leftColX,
              baselineY,
              innerW,
              capState,
              isLastLine,
              `f${fi}-b${row.left.bi}`,
              row.left.wrapBackSuffix,
            );
            parts.push(...res.elements);
            capState = res.nextCap;
          }
        } else {
          if (row.left) {
            const res = paintBlockRow(
              row.left.block,
              opts,
              settings,
              folio.id,
              row.left.bi,
              leftColX,
              baselineY,
              colW,
              leftCap,
              isLastLine,
              `f${fi}-bl${row.left.bi}`,
              row.left.wrapBackSuffix,
            );
            parts.push(...res.elements);
            leftCap = res.nextCap;
          }
          if (row.right) {
            const res = paintBlockRow(
              row.right.block,
              opts,
              settings,
              folio.id,
              row.right.bi,
              rightColX,
              baselineY,
              colW,
              rightCap,
              isLastLine,
              `f${fi}-br${row.right.bi}`,
              row.right.wrapBackSuffix,
            );
            parts.push(...res.elements);
            rightCap = res.nextCap;
          }
        }

        currentY += LH;
      }
      currentY += 12;
    }

    if (folio.catchword) {
      parts.push(
        `<text x="${opts.canvasWidth - MARGIN}" y="${currentY + FS}" text-anchor="end" font-family="Georgia, serif" font-size="12" font-style="italic" fill="${FAINT_FILL}">Reclamo: ${escapeXml(folio.catchword)}</text>`,
      );
      currentY += LH;
    }
    if (folio.signature) {
      parts.push(
        `<text x="${MARGIN}" y="${currentY + FS}" font-family="Georgia, serif" font-size="12" font-style="italic" fill="${FAINT_FILL}">Signatura: ${escapeXml(folio.signature)}</text>`,
      );
      currentY += LH;
    }

    currentY += 24;
  }

  const height = currentY + PAGE_PAD_BOT;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.canvasWidth}" height="${height}" viewBox="0 0 ${opts.canvasWidth} ${height}">\n` +
    `<rect width="100%" height="100%" fill="${PARCHMENT_BG}"/>\n` +
    parts.join("\n") +
    `\n</svg>`
  );
}

export function estimateSvgDocumentHeight(parsed: ParsedManuscript): number {
  let h = PAGE_PAD_TOP + 80;
  for (const f of parsed.folios) {
    h += 40 + f.headings.length * LH;
    const spatial = buildSpatialFolio(f);
    for (const cb of spatial.columnBlocks) {
      const rowCount =
        cb.layout === 1
          ? cb.lines.length
          : Math.max(
              cb.lines.filter((l) => l.track === "left").length,
              cb.lines.filter((l) => l.track === "right").length,
            );
      h += rowCount * LH + 12;
    }
    if (f.catchword || f.signature) h += LH;
  }
  return h + PAGE_PAD_BOT;
}
