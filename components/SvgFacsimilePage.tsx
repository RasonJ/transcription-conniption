import { useT } from "@/i18n/runtime";
import { FigureImageContext } from "@/components/FigurePlaceholder";
import { renderOrnateInitialSvg } from "@/components/svgFacsimile/renderOrnateInitial";
import { buildInitialScene, type InitialTradition } from "@/utils/initials/scene";
import { resolveInitialSpec } from "@/utils/initials/spec";
import { getPrintableBlocks, flattenFolioLayoutGroups, groupFolioLayout } from "@/components/svgFacsimile/folioGroups";
import { renderJustifiedNativeLine } from "@/components/svgFacsimile/justifiedNativeLine";
import { segsLineWidth } from "@/components/svgFacsimile/glyphMetrics";
import {
  blockToSegs,
  coalesceSegs,
  stripDropCapPrefixFromSegs,
  type DisplaySettings,
  type Seg,
  FS,
  LH,
  RUBRIC_FILL,
  PROSE_FILL,
  FAINT_FILL,
  seg,
} from "@/components/svgFacsimile/tokenRendering";
import {
  BLOCK_GAP,
  BLOCK_GAP_AFTER_INITIAL,
  CANVAS_W,
  CAP_GUTTER,
  columnWidth,
  GUTTER_WIDTH,
  HEADING_GAP,
  innerCanvasWidth,
  LINE_NUM_W,
  MARGIN,
  PAGE_PAD_BOT,
  PAGE_PAD_TOP,
  PARCHMENT_BG,
  RULE_STROKE,
} from "@/components/svgFacsimile/pageLayout";
import type { FolioSide, ManuscriptBlock } from "@/constants/manuscript";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import { blockIsMetadataLeak } from "@/utils/metadataBlocks";
import { formatRunningHeaderText } from "@/utils/metadataText";
import React, { useContext, useMemo } from "react";
import { Platform, ScrollView, View, StyleSheet } from "react-native";
import Svg, {
  Image as SvgImage,
  Line as SvgLine,
  Rect,
  Text as SvgText,
  TSpan,
} from "react-native-svg";

// ── Layout constants (CANVAS_W, MARGIN, … from pageLayout.ts) ───────────────
const FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, 'Times New Roman', serif",
}) as string;

interface ColumnCapState {
  textX: number;
  rowsLeft: number;
}

function defaultCapState(colX: number): ColumnCapState {
  return { textX: colX, rowsLeft: 0 };
}

// ── One physical line — centered rubric / gloss (no micro-tracking) ───────────
function renderPhysicalLine(
  segs: Seg[],
  baselineY: number,
  startX: number,
  colW: number,
  keyPrefix: string,
  centerInColumn: boolean,
  wrapBackSuffix?: string,
): React.ReactNode[] {
  const visible = coalesceSegs(segs.filter((s) => s.text));
  const nodes: React.ReactNode[] = [];

  if (visible.length > 0) {
    let anchorX = startX;
    if (centerInColumn) {
      anchorX = startX + Math.max(0, (colW - segsLineWidth(visible)) / 2);
    }

    nodes.push(
      <SvgText
        key={keyPrefix}
        x={anchorX}
        y={baselineY}
        fontFamily={FONT}
        fontSize={FS}
        fill={PROSE_FILL}
      >
        {visible.map((s, i) => (
          <TSpan
            key={i}
            fontSize={s.fs}
            fill={s.fill}
            fontStyle={s.italic ? "italic" : "normal"}
            fontWeight={s.bold ? "bold" : "normal"}
            dy={s.super ? -FS * 0.28 : 0}
            textDecoration={
              s.strike ? "line-through" : s.underline ? "underline" : "none"
            }
          >
            {s.text}
          </TSpan>
        ))}
      </SvgText>,
    );

    if (wrapBackSuffix) {
      const mainW = segsLineWidth(visible);
      nodes.push(
        <SvgText
          key={`${keyPrefix}-wb`}
          x={anchorX + mainW + 6}
          y={baselineY}
          fontFamily={FONT}
          fontSize={FS}
          fill={FAINT_FILL}
          fontStyle="italic"
        >
          {wrapBackSuffix}
        </SvgText>,
      );
    }
  } else if (wrapBackSuffix) {
    nodes.push(
      <SvgText
        key={`${keyPrefix}-wb`}
        x={startX}
        y={baselineY}
        fontFamily={FONT}
        fontSize={FS}
        fill={FAINT_FILL}
        fontStyle="italic"
      >
        {wrapBackSuffix}
      </SvgText>,
    );
  }

  return nodes;
}

// ── Per-block SVG layout ──────────────────────────────────────────────────────
interface LayoutResult {
  elements: React.ReactNode[];
  heightUsed: number;
  capState: ColumnCapState;
}

function layoutBlock(
  block: ManuscriptBlock,
  startY: number,
  colX: number,
  colW: number,
  capState: ColumnCapState,
  uploadedImages: Record<string, string>,
  settings: DisplaySettings,
  folioId: string,
  blockIndex: number,
  bkey: string,
  triggerPick?: (id: string) => void,
  wrapBackSuffix?: string,
  isLastLine = false,
  initialTradition: InitialTradition = "ms.penwork",
): LayoutResult {
  const elems: React.ReactNode[] = [];
  let nextCapState = capState;

  if (blockIsMetadataLeak(block)) {
    return { elements: elems, heightUsed: 0, capState: nextCapState };
  }

  // ── Diagram block ─────────────────────────────────────────────────────────
  if (block.type === "diagram") {
    const figToks = block.tokens.filter((t) => t.type === "figure_anchor");
    const boxH = 100;
    const renderFigBox = (fx: number, fw: number, label: string, imgUri: string | undefined, k: string) => {
      const bw = fw - 6;
      const bx = fx + 3;
      if (imgUri) {
        elems.push(
          <SvgImage key={k} x={bx} y={startY} width={bw} height={boxH}
            href={imgUri} preserveAspectRatio="xMidYMid meet" />,
        );
        return;
      }
      const pad = 6;
      // Outer frame — warm parchment with brown border
      elems.push(
        <Rect key={`${k}o`} x={bx} y={startY} width={bw} height={boxH} fill="#ede3c4" stroke="#a07030" strokeWidth={1.5} rx={3} />,
        // Inner panel
        <Rect key={`${k}i`} x={bx + pad} y={startY + pad} width={bw - pad * 2} height={boxH - pad * 2} fill="#f5edcf" stroke="#c09040" strokeWidth={0.7} rx={1.5} />,
        // Picture-frame cross-hair lines
        <SvgLine key={`${k}h`} x1={bx + pad + 4} y1={startY + boxH / 2} x2={bx + bw - pad - 4} y2={startY + boxH / 2} stroke="#c09040" strokeWidth={0.6} />,
        <SvgLine key={`${k}v`} x1={bx + bw / 2} y1={startY + pad + 4} x2={bx + bw / 2} y2={startY + boxH - pad - 4} stroke="#c09040" strokeWidth={0.6} />,
        // Corner ticks
        <SvgLine key={`${k}c1`} x1={bx + pad} y1={startY + pad} x2={bx + pad + 6} y2={startY + pad} stroke="#a07030" strokeWidth={1} />,
        <SvgLine key={`${k}c2`} x1={bx + pad} y1={startY + pad} x2={bx + pad} y2={startY + pad + 6} stroke="#a07030" strokeWidth={1} />,
        <SvgLine key={`${k}c3`} x1={bx + bw - pad - 6} y1={startY + pad} x2={bx + bw - pad} y2={startY + pad} stroke="#a07030" strokeWidth={1} />,
        <SvgLine key={`${k}c4`} x1={bx + bw - pad} y1={startY + pad} x2={bx + bw - pad} y2={startY + pad + 6} stroke="#a07030" strokeWidth={1} />,
        // Label
        <SvgText key={`${k}l`} x={bx + bw / 2} y={startY + boxH - pad - 4}
          fontFamily={FONT} fontSize={10} fill="#6b4510" textAnchor="middle" fontStyle="italic">
          {label}
        </SvgText>,
      );
    };

    if (figToks.length > 0) {
      const fw = colW / figToks.length;
      figToks.forEach((ft, i) => {
        const typeLabel = ft.figureType === "MIN" ? "Miniature" : ft.figureType === "ILL" ? "Illumination"
          : ft.figureType === "DIAG" ? "Diagram" : ft.figureType === "SYMB" ? "Symbol" : "Figure";
        renderFigBox(colX + i * fw, fw, typeLabel, ft.figureId ? uploadedImages[ft.figureId] : undefined, `${bkey}-fb${i}`);
      });
    } else {
      renderFigBox(colX, colW, "Diagram schema", undefined, `${bkey}-emptydiag`);
    }
    return { elements: elems, heightUsed: boxH, capState: nextCapState };
  }

  const dropTok = block.tokens.find((t) => t.type === "drop_initial") ?? null;
  const figToks = block.tokens.filter((t) => t.type === "figure_anchor");
  let lineSegs = blockToSegs(block, settings);

  const initialLetter = dropTok?.value ?? null;
  const initialDepth = dropTok?.initialDepth ?? 3;
  const baselineY = startY + FS;

  let textX = nextCapState.rowsLeft > 0 ? nextCapState.textX : colX;

  if (initialLetter && dropTok) {
    if (initialDepth <= 1) {
      const inlineFS = Math.round(FS * 1.4);
      lineSegs.unshift(seg({ text: initialLetter, fill: RUBRIC_FILL, bold: true, fs: inlineFS }));
    } else {
      const scene = buildInitialScene(
        resolveInitialSpec({
          letter: initialLetter,
          depth: initialDepth,
          tradition: initialTradition,
          illuminated: true,
          sequence: blockIndex,
          seed: `${folioId}|${initialLetter}|${blockIndex}`,
        }),
        LH,
      );
      const capH = scene.boxHeight;
      const capW = scene.boxWidth;
      const dropcapId = `dc_${bkey}`;
      const storedUri = uploadedImages[dropcapId];
      const displayUri = storedUri ? resolveStoredFileUri(storedUri) : undefined;

      elems.push(
        ...renderOrnateInitialSvg(
          initialLetter,
          colX,
          startY,
          capW,
          capH,
          capH * 0.72,
          folioId,
          blockIndex,
          bkey,
          displayUri,
          triggerPick ? () => triggerPick(dropcapId) : undefined,
          { tradition: initialTradition, depth: initialDepth },
        ),
      );

      textX = colX + capW + CAP_GUTTER;
      nextCapState = { textX, rowsLeft: initialDepth - 1 };
      lineSegs = stripDropCapPrefixFromSegs(lineSegs, initialLetter);
    }
  } else if (nextCapState.rowsLeft > 0) {
    textX = nextCapState.textX;
    nextCapState = { ...nextCapState, rowsLeft: nextCapState.rowsLeft - 1 };
  }

  if (block.lineNumber && settings.showLineNumbers !== false) {
    // Right edge of a LINE_NUM_W gutter, left of the column and of any drop cap.
    elems.push(
      <SvgText
        key={`${bkey}-ln`}
        x={colX - Math.min(8, LINE_NUM_W)}
        y={baselineY}
        fontFamily="monospace"
        fontSize={11}
        fontWeight="700"
        fill={FAINT_FILL}
        textAnchor="end"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
        pointerEvents="none"
      >
        {block.lineNumber}
      </SvgText>,
    );
  }

  const isRubric = block.type === "rubric";
  const isHeading = block.type === "heading";
  const isGloss = block.type === "gloss";
  const trackWidth = colW - (textX - colX);

  if (isRubric || isHeading || isGloss) {
    elems.push(
      ...renderPhysicalLine(
        lineSegs,
        baselineY,
        textX,
        trackWidth,
        bkey,
        isRubric || isHeading,
        wrapBackSuffix,
      ),
    );
  } else {
    const mainLine = renderJustifiedNativeLine({
      segs: lineSegs,
      baselineY,
      startX: textX,
      trackWidth,
      keyPrefix: bkey,
      isLastLine,
      fontFamily: FONT,
      defaultFill: PROSE_FILL,
    });
    if (mainLine) elems.push(mainLine);

    if (wrapBackSuffix) {
      const visible = coalesceSegs(lineSegs.filter((s) => s.text));
      const mainW = segsLineWidth(visible);
      elems.push(
        <SvgText
          key={`${bkey}-wb`}
          x={textX + mainW + 6}
          y={baselineY}
          fontFamily={FONT}
          fontSize={FS}
          fill={FAINT_FILL}
          fontStyle="italic"
        >
          {wrapBackSuffix}
        </SvgText>,
      );
    }
  }

  if (figToks.length > 0) {
    const figH = 60;
    const figTopY = startY + LH + 4;
    const fw = colW / figToks.length;
    figToks.forEach((ft, i) => {
      const fx = colX + i * fw;
      const imgUri = ft.figureId ? uploadedImages[ft.figureId] : undefined;
      if (imgUri) {
        elems.push(
          <SvgImage
            key={`${bkey}-ifig${i}`}
            x={fx}
            y={figTopY}
            width={fw - 4}
            height={figH}
            href={imgUri}
            preserveAspectRatio="xMidYMid meet"
          />,
        );
      } else {
        elems.push(
          <Rect key={`${bkey}-ifbo${i}`} x={fx} y={figTopY} width={fw - 4} height={figH} fill="#ede3c4" stroke="#a07030" strokeWidth={1.5} rx={3} />,
          <Rect key={`${bkey}-ifbi${i}`} x={fx + 5} y={figTopY + 5} width={fw - 14} height={figH - 10} fill="#f5edcf" stroke="#c09040" strokeWidth={0.6} rx={1.5} />,
          <SvgText
            key={`${bkey}-ifl${i}`}
            x={fx + (fw - 4) / 2}
            y={figTopY + figH - 10}
            fontFamily={FONT}
            fontSize={9}
            fill="#6b4510"
            textAnchor="middle"
            fontStyle="italic"
          >
            {ft.figureType ?? "FIG"}
          </SvgText>,
        );
      }
    });
  }

  let h = LH;
  if (dropTok && (dropTok.initialDepth ?? 3) > 1) {
    h = Math.max(h, (dropTok.initialDepth ?? 3) * LH);
  }
  if (figToks.length > 0) {
    h += 60 + LH;
  }

  return { elements: elems, heightUsed: h, capState: nextCapState };
}

// ── Main component ────────────────────────────────────────────────────────────
export interface SvgFacsimilePageProps {
  folio: FolioSide;
  showExpanded?: boolean;
  showDeletions?: boolean;
  suppressOtioseMarks?: boolean;
  useNormalizedDiacritics?: boolean;
  useMufiGraphemes?: boolean;
  usePuaFont?: boolean;
  /** Left-gutter scholarly line numbers (default true). */
  showLineNumbers?: boolean;
  /** Witness-level decorated-initial tradition (from {RMK:}). */
  initialTradition?: InitialTradition;
}

export function SvgFacsimilePage({
  folio,
  showExpanded = true,
  showDeletions = true,
  suppressOtioseMarks = false,
  useNormalizedDiacritics = true,
  useMufiGraphemes = false,
  usePuaFont = true,
  showLineNumbers = true,
  initialTradition = "ms.penwork",
}: SvgFacsimilePageProps) {
  const { uploadedImages, triggerImagePick } = useContext(FigureImageContext);
  const t = useT();

  // Only this folio's figure URIs — avoids redraw when unrelated images update.
  const folioImageSig = useMemo(() => {
    const parts: string[] = [];
    for (const block of folio.blocks) {
      for (const tok of block.tokens) {
        if (tok.figureId) {
          parts.push(`${tok.figureId}=${uploadedImages[tok.figureId] ?? ""}`);
        }
      }
    }
    return parts.join("\0");
  }, [folio, uploadedImages]);
  const folioImages = useMemo(() => {
    const next: Record<string, string> = {};
    for (const block of folio.blocks) {
      for (const tok of block.tokens) {
        if (tok.figureId && uploadedImages[tok.figureId]) {
          next[tok.figureId] = uploadedImages[tok.figureId];
        }
      }
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folio, folioImageSig]);

  const canvasW = CANVAS_W;
  const innerW = innerCanvasWidth();
  const colW = columnWidth();
  const colAX = MARGIN;
  const colBX = MARGIN + colW + GUTTER_WIDTH;

  const settings: DisplaySettings = useMemo(
    () => ({
      showExpanded,
      showDeletions,
      suppressOtioseMarks,
      useNormalizedDiacritics,
      useMufiGraphemes,
      usePuaFont,
      showLineNumbers,
    }),
    [
      showExpanded,
      showDeletions,
      suppressOtioseMarks,
      useNormalizedDiacritics,
      useMufiGraphemes,
      usePuaFont,
      showLineNumbers,
    ],
  );

  const printableBlocks = useMemo(() => getPrintableBlocks(folio), [folio]);
  const groups = useMemo(
    () => flattenFolioLayoutGroups(groupFolioLayout(printableBlocks)),
    [printableBlocks],
  );

  const svgElems: React.ReactNode[] = [];
  let curY = PAGE_PAD_TOP;

  // ── Headings ──────────────────────────────────────────────────────────────
  for (let hi = 0; hi < folio.headings.length; hi++) {
    const headText = formatRunningHeaderText(folio.headings[hi], {
      showExpanded: settings.showExpanded,
      useNormalizedDiacritics: settings.useNormalizedDiacritics,
      suppressOtioseMarks: settings.suppressOtioseMarks,
    });
    if (!headText) continue;
    svgElems.push(
      <SvgText
        key={`head${hi}`}
        x={canvasW / 2}
        y={curY + FS}
        fontFamily={FONT}
        fontSize={FS}
        fontStyle="italic"
        fill={RUBRIC_FILL}
        textAnchor="middle"
      >
        {headText}
      </SvgText>,
    );
    curY += LH + HEADING_GAP;
  }

  // ── Render groups ─────────────────────────────────────────────────────────
  const gapAfter = (block: ManuscriptBlock) =>
    block.tokens.some((t) => t.type === "drop_initial")
      ? BLOCK_GAP_AFTER_INITIAL
      : BLOCK_GAP;

  let proseCap = defaultCapState(MARGIN);

  for (const group of groups) {
    if (group.kind === "single") {
      const { elements, heightUsed, capState } = layoutBlock(
        group.block,
        curY,
        MARGIN,
        innerW,
        proseCap,
        folioImages,
        settings,
        folio.id,
        group.bi,
        `b${group.bi}`,
        triggerImagePick,
        group.wrapBackSuffix,
        group.isLastLine ?? false,
        initialTradition,
      );
      svgElems.push(...elements);
      curY += heightUsed + gapAfter(group.block);
      proseCap = capState;
    } else {
      proseCap = defaultCapState(MARGIN);
      const colW = (innerW - GUTTER_WIDTH) / 2;
      const leftX = MARGIN;
      const rightX = MARGIN + colW + GUTTER_WIDTH;
      let leftCap = defaultCapState(leftX);
      let rightCap = defaultCapState(rightX);
      const rowCount = Math.max(group.left.length, group.right.length);
      const groupStartY = curY;

      for (let ri = 0; ri < rowCount; ri++) {
        const rowY = curY;
        let rowH = LH;
        const isLastLine = ri === rowCount - 1;

        const leftEntry = group.left[ri];
        if (leftEntry) {
          const { block, bi, wrapBackSuffix } = leftEntry;
          const result = layoutBlock(
            block,
            rowY,
            leftX,
            colW,
            leftCap,
            folioImages,
            settings,
            folio.id,
            bi,
            `bl${bi}`,
            triggerImagePick,
            wrapBackSuffix,
            isLastLine,
            initialTradition,
          );
          svgElems.push(...result.elements);
          leftCap = result.capState;
          rowH = Math.max(rowH, result.heightUsed);
        }

        const rightEntry = group.right[ri];
        if (rightEntry) {
          const { block, bi, wrapBackSuffix } = rightEntry;
          const result = layoutBlock(
            block,
            rowY,
            rightX,
            colW,
            rightCap,
            folioImages,
            settings,
            folio.id,
            bi,
            `br${bi}`,
            triggerImagePick,
            wrapBackSuffix,
            isLastLine,
            initialTradition,
          );
          svgElems.push(...result.elements);
          rightCap = result.capState;
          rowH = Math.max(rowH, result.heightUsed);
        }

        curY += rowH + BLOCK_GAP;
      }

      const divX = leftX + colW + GUTTER_WIDTH / 2;
      svgElems.push(
        <SvgLine
          key={`div${groupStartY}`}
          x1={divX}
          y1={groupStartY}
          x2={divX}
          y2={curY - BLOCK_GAP}
          stroke={RULE_STROKE}
          strokeWidth={0.6}
          strokeDasharray="2,4"
        />,
      );
    }
  }

  // ── Catchword / Signature ─────────────────────────────────────────────────
  if (folio.catchword) {
    svgElems.push(
      <SvgText
        key="catchword"
        x={canvasW - MARGIN}
        y={curY + FS - 2}
        fontFamily={FONT}
        fontSize={FS - 2}
        fontStyle="italic"
        fill={FAINT_FILL}
        textAnchor="end"
      >
        {t("studio.catchwordLabel", { text: folio.catchword })}
      </SvgText>,
    );
    curY += LH + 4;
  }

  if (folio.signature) {
    svgElems.push(
      <SvgText
        key="signature"
        x={MARGIN}
        y={curY + FS - 2}
        fontFamily={FONT}
        fontSize={FS - 2}
        fontStyle="italic"
        fill={FAINT_FILL}
      >
        {t("studio.signatureLabel", { text: folio.signature })}
      </SvgText>,
    );
    curY += LH + 4;
  }

  const totalH = curY + PAGE_PAD_BOT;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.scrollContent}
      style={styles.scrollOuter}
    >
      <View style={{ width: canvasW }}>
        <Svg width={canvasW} height={totalH}>
        {/* Parchment background */}
        <Rect x={0} y={0} width={canvasW} height={totalH} fill={PARCHMENT_BG} rx={4} />

        {/* Lead-point column ruling grid */}
        <SvgLine x1={colAX} y1={16} x2={colAX} y2={totalH - 16} stroke={RULE_STROKE} strokeWidth={0.75} />
        <SvgLine
          x1={colAX + colW}
          y1={16}
          x2={colAX + colW}
          y2={totalH - 16}
          stroke={RULE_STROKE}
          strokeWidth={0.5}
          strokeDasharray="2,4"
        />
        <SvgLine
          x1={colBX}
          y1={16}
          x2={colBX}
          y2={totalH - 16}
          stroke={RULE_STROKE}
          strokeWidth={0.5}
          strokeDasharray="2,4"
        />
        <SvgLine
          x1={canvasW - MARGIN}
          y1={16}
          x2={canvasW - MARGIN}
          y2={totalH - 16}
          stroke={RULE_STROKE}
          strokeWidth={0.75}
        />

        {svgElems}
        </Svg>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollOuter: {
    width: "100%",
    marginVertical: 6,
  },
  scrollContent: {
    alignItems: "flex-start",
  },
});
