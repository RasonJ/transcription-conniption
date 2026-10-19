import { t as tNow, useT } from "@/i18n/runtime";
import { FigureImageContext } from "@/components/FigurePlaceholder";
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
  RULE_STROKE,
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
  PROSE_FILL,
  GLOSS_FILL,
  seg,
} from "@/components/svgFacsimile/tokenRendering";
import { wordGapExtra } from "@/components/svgFacsimile/glyphMetrics";
import { HtmlOrnateDropCap } from "@/components/svgFacsimile/HtmlOrnateDropCap";
import type { FolioSide, ManuscriptBlock, Token } from "@/constants/manuscript";
import { blockIsMetadataLeak } from "@/utils/metadataBlocks";
import { formatRunningHeaderText } from "@/utils/metadataText";
import {
  buildSpatialFolio,
  zipColumnBlockRows,
  type SpatialColumnBlock,
  type SpatialLine,
} from "@/utils/spatialAst";
import React, { createElement, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { ForeignObject, Line as SvgLine, Rect } from "react-native-svg";

/** Fixed left gutter for scholarly line numbers (outside copyable body text). */
const LINE_NUM_W = 40;

/** HSMS {GLL.}/{GLR.} (and AD*) → which margin rail to use. */
function glossMarginSide(block: ManuscriptBlock): "left" | "right" | null {
  if (block.type !== "gloss" && block.type !== "addendum") return null;
  for (let i = 0; i < block.tokens.length; i++) {
    const layers = block.tokens[i].envLayers;
    if (!layers) continue;
    for (let j = 0; j < layers.length; j++) {
      const code = layers[j].code?.toUpperCase() ?? "";
      if (code === "GLL" || code === "ADL") return "left";
      if (code === "GLR" || code === "ADR") return "right";
      if (code.startsWith("GL") || code.startsWith("AD")) return "right";
    }
  }
  return "right";
}

/** Plain gloss label for vertical left-margin print (e.g. SEVILLA). */
function leftGlossGutterLabel(block: ManuscriptBlock): string | undefined {
  if (glossMarginSide(block) !== "left") return undefined;
  const parts: string[] = [];
  for (const tok of block.tokens) {
    if (tok.type === "env_open" || tok.type === "env_close") continue;
    const v = (tok.value ?? "").trim();
    if (v) parts.push(v);
  }
  const label = parts.join(" ").replace(/^\[|\]$/g, "").trim();
  return label || undefined;
}

function LineNumberGutter(props: {
  lineNumber?: string;
  show: boolean;
  glossLabel?: string;
}): React.ReactNode {
  if (!props.show) {
    return <span style={htmlStyles.lineNumberSpacerHidden} aria-hidden />;
  }
  return (
    <span style={htmlStyles.leftLineGutter} aria-hidden>
      {props.glossLabel ? (
        <span style={htmlStyles.marginaliaLabel}>{props.glossLabel}</span>
      ) : null}
      <span style={htmlStyles.gutterLineNum}>{props.lineNumber ?? ""}</span>
    </span>
  );
}

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
}

interface HtmlCapState {
  padLeft: number;
  rowsLeft: number;
}

function defaultCapState(): HtmlCapState {
  return { padLeft: 0, rowsLeft: 0 };
}

function charSpanStyle(s: Seg, useMufiFont?: boolean): React.CSSProperties {
  return {
    color: s.fill,
    fontFamily: useMufiFont
      ? "'Junicode', 'Andron Scriptor Web', 'Andron Scriptor', Georgia, 'Times New Roman', serif"
      : "Georgia, 'Times New Roman', serif",
    fontStyle: s.italic ? "italic" : "normal",
    fontWeight: s.bold ? "bold" : "normal",
    fontSize: `${s.fs}px`,
    lineHeight: `${LH}px`,
    textDecoration: s.strike ? "line-through" : s.underline ? "underline" : undefined,
    position: "relative",
    top: s.super ? "-0.35em" : undefined,
    // Inline — never flex/grid items; those stretch glyphs under justify.
    display: "inline",
    whiteSpace: "pre-wrap",
  };
}

function renderJustifiedCharacters(
  segs: Seg[],
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
  keyPrefix: string,
  useMufiFont?: boolean,
): React.ReactNode {
  const visible = coalesceSegs(segs.filter((s) => s.text));
  if (visible.length === 0) return null;

  const gapExtra = wordGapExtra(visible, targetWidth, isLastLine, skipJustify);

  // One inline run of coalesced segments. Word-spacing expands gaps only —
  // never letter-spacing, never per-glyph flex children.
  return (
    <span
      style={{
        display: "inline",
        whiteSpace: "pre-wrap",
        wordSpacing: gapExtra > 0 ? `${gapExtra}px` : undefined,
      }}
    >
      {visible.map((s, i) => (
        <span key={`${keyPrefix}-s${i}`} style={charSpanStyle(s, useMufiFont)}>
          {s.text}
        </span>
      ))}
    </span>
  );
}

function HtmlLineRow({
  line,
  settings,
  capState,
  trackWidth,
  uploadedImages,
  isLastLine,
  folioId,
  triggerPick,
}: {
  line?: SpatialLine;
  settings: DisplaySettings;
  capState: HtmlCapState;
  trackWidth: number;
  uploadedImages: Record<string, string>;
  isLastLine: boolean;
  folioId: string;
  triggerPick?: (id: string) => void;
}): { node: React.ReactNode | null; nextCap: HtmlCapState } {
  if (!line) return { node: null, nextCap: capState };

  const block = line.block;
  if (blockIsMetadataLeak(block)) {
    return { node: null, nextCap: capState };
  }

  const bkey = `b${line.bi}`;
  let nextCap = capState;

  if (block.type === "diagram") {
    return {
      nextCap,
      node: (
        <Div
          key={bkey}
          style={{
            border: "1px dashed #9b2217",
            backgroundColor: "#faf6eb",
            padding: 16,
            textAlign: "center",
            margin: "8px 0",
            color: "#5a2317",
            fontStyle: "italic",
            width: `${trackWidth}px`,
            boxSizing: "border-box",
          }}
        >
          {tNow("facsimile.diagram")}
        </Div>
      ),
    };
  }

  const dropTok = block.tokens.find((t) => t.type === "drop_initial") ?? null;
  const figToks = block.tokens.filter((t) => t.type === "figure_anchor");
  let lineSegs = blockToSegs(block, settings);

  const isRubric = block.type === "rubric";
  const isHeading = block.type === "heading";
  const isGloss = block.type === "gloss" || block.type === "addendum";
  const glossSide = glossMarginSide(block);
  const skipJustify = isRubric || isHeading || isGloss;
  let lineIndent = nextCap.rowsLeft > 0 ? nextCap.padLeft : 0;
  let currentLineWidth = trackWidth;
  if (glossSide) {
    // Marginal glosses occupy a side rail, not the full prose measure.
    currentLineWidth = Math.min(trackWidth * 0.46, trackWidth - 24);
    lineIndent = 0;
  }

  let dropCapNode: React.ReactNode = null;
  const dropcapId = `dc_${bkey}`;

  if (dropTok) {
    const depth = dropTok.initialDepth ?? 3;
    if (depth <= 1) {
      lineSegs.unshift(seg({ text: dropTok.value, fill: RUBRIC_FILL, bold: true, fs: FS * 1.4 }));
    } else {
      const boxH = depth * LH;
      const boxW = dropCapBoxWidth(boxH, Math.max(1, dropTok.value.length));
      dropCapNode = (
        <HtmlOrnateDropCap
          token={dropTok}
          folioId={folioId}
          blockIndex={line.bi}
          bkey={bkey}
          imageUri={uploadedImages[dropcapId]}
          onPress={triggerPick ? () => void triggerPick(dropcapId) : undefined}
        />
      );
      lineIndent = 0;
      currentLineWidth = trackWidth - (boxW + CAP_GUTTER);
      nextCap = { padLeft: boxW + CAP_GUTTER, rowsLeft: depth - 1 };
      lineSegs = stripDropCapPrefixFromSegs(lineSegs, dropTok.value);
    }
  } else if (nextCap.rowsLeft > 0) {
    currentLineWidth = trackWidth - lineIndent;
    nextCap = { ...nextCap, rowsLeft: nextCap.rowsLeft - 1 };
  }

  const textStyle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${isHeading ? FS * 1.1 : FS}px`,
    lineHeight: `${isHeading ? LH * 1.2 : LH}px`,
    color: PROSE_FILL,
    display: "block",
    textAlign: isRubric || isHeading ? "center" : glossSide === "right" ? "left" : "left",
    marginLeft: glossSide === "right" ? "auto" : lineIndent > 0 ? `${lineIndent}px` : undefined,
    marginRight: glossSide === "left" ? "auto" : undefined,
    width: `${isHeading ? trackWidth : currentLineWidth}px`,
    maxWidth: glossSide ? `${currentLineWidth}px` : undefined,
    boxSizing: "border-box",
    minHeight: `${LH}px`,
    ...(isRubric || isHeading
      ? { color: RUBRIC_FILL, fontWeight: "bold", marginTop: isHeading ? 6 : undefined, marginBottom: isHeading ? 6 : undefined }
      : {}),
    ...(isGloss
      ? {
          color: GLOSS_FILL,
          fontStyle: "italic",
          fontSize: `${FS * 0.85}px`,
          borderLeftWidth: glossSide === "right" ? 2 : undefined,
          borderLeftStyle: glossSide === "right" ? "solid" : undefined,
          borderLeftColor: glossSide === "right" ? "rgba(74,48,96,0.35)" : undefined,
          paddingLeft: glossSide === "right" ? 8 : undefined,
        }
      : {}),
  };

  const textBody = (
    <>
      {renderJustifiedCharacters(
        lineSegs,
        currentLineWidth,
        isLastLine,
        skipJustify,
        bkey,
        settings.useMufiGraphemes,
      )}
      {figToks.map((ft, i) => (
        <span
          key={`${bkey}-fig${i}`}
          style={{ color: "#1a3a5a", fontStyle: "italic", fontSize: `${FS}px` }}
        >
          [{ft.figureType ?? "FIG"}]
        </span>
      ))}
      {line.wrapBackSuffix ? (
        <span style={htmlStyles.wrapBackOverlay}>{line.wrapBackSuffix}</span>
      ) : null}
    </>
  );

  const showNums = settings.showLineNumbers !== false;

  return {
    nextCap,
    node: (
      <Div key={bkey} style={htmlStyles.blockRow}>
        <LineNumberGutter
          lineNumber={block.lineNumber}
          show={showNums}
          glossLabel={leftGlossGutterLabel(block)}
        />
        {dropCapNode ? (
          <Div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              width: `${trackWidth}px`,
              flex: "0 0 auto",
            }}
          >
            <Div style={{ flexShrink: 0, marginRight: `${CAP_GUTTER}px` }}>{dropCapNode}</Div>
            <Div
              style={{
                ...textStyle,
                marginLeft: undefined,
                position: line.wrapBackSuffix ? "relative" : undefined,
              }}
            >
              {textBody}
            </Div>
          </Div>
        ) : (
          <Div
            style={{
              ...textStyle,
              position: line.wrapBackSuffix ? "relative" : undefined,
            }}
          >
            {textBody}
          </Div>
        )}
      </Div>
    ),
  };
}

/**
 * Renders a multi-line drop cap (depth > 1) as a single 2-column container:
 * left column = ornate cap box spanning all n line-heights,
 * right column = vertical stack of the n body lines.
 * This keeps body lines 2–n alongside the cap instead of below it.
 */
function renderDropCapSection(
  lines: SpatialLine[],
  dropTok: Token,
  settings: DisplaySettings,
  uploadedImages: Record<string, string>,
  trackW: number,
  folioId: string,
  blockIdx: number,
  triggerPick?: (id: string) => void,
): React.ReactNode {
  const depth = dropTok.initialDepth ?? 3;
  const boxH = depth * LH;
  const boxW = dropCapBoxWidth(boxH, Math.max(1, dropTok.value.length));
  const bodyW = trackW - boxW - CAP_GUTTER;
  const firstLine = lines[0];
  const dropcapId = `dc_b${firstLine.bi}`;

  const showNums = settings.showLineNumbers !== false;

  const gutterColumn = (
    <Div style={htmlStyles.dropCapGutterCol} aria-hidden>
      {lines.map((line) => (
        <LineNumberGutter
          key={`ln-b${line.bi}`}
          lineNumber={line.block.lineNumber}
          show={showNums}
          glossLabel={undefined}
        />
      ))}
    </Div>
  );

  const bodyLineNodes = lines.map((line, di) => {
    const block = line.block;
    if (blockIsMetadataLeak(block)) return null;

    const isLast = di === lines.length - 1;
    const isRubric = block.type === "rubric";
    const isHeading = block.type === "heading";
    const isGloss = block.type === "gloss";
    const figToks = block.tokens.filter((t) => t.type === "figure_anchor");

    let lineSegs = blockToSegs(block, settings);
    if (di === 0) lineSegs = stripDropCapPrefixFromSegs(lineSegs, dropTok.value);

    const lineStyle: React.CSSProperties = {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: isGloss ? `${FS * 0.85}px` : isHeading ? `${FS * 1.1}px` : `${FS}px`,
      lineHeight: `${LH}px`,
      color: isRubric || isHeading ? RUBRIC_FILL : isGloss ? GLOSS_FILL : PROSE_FILL,
      fontWeight: isRubric || isHeading ? "bold" : "normal",
      fontStyle: isGloss ? "italic" : "normal",
      display: "block",
      textAlign: isRubric || isHeading ? "center" : "left",
      width: `${bodyW}px`,
      minHeight: `${LH}px`,
      boxSizing: "border-box",
      position: line.wrapBackSuffix ? "relative" : undefined,
    };

    return (
      <Div key={`b${line.bi}`} style={lineStyle}>
        {renderJustifiedCharacters(
          lineSegs,
          bodyW,
          isLast,
          isRubric || isHeading || isGloss,
          `b${line.bi}`,
          settings.useMufiGraphemes,
        )}
        {figToks.map((ft, i) => (
          <span
            key={`b${line.bi}-fig${i}`}
            style={{ color: "#1a3a5a", fontStyle: "italic", fontSize: `${FS}px` }}
          >
            [{ft.figureType ?? "FIG"}]
          </span>
        ))}
        {line.wrapBackSuffix ? (
          <span style={htmlStyles.wrapBackOverlay}>{line.wrapBackSuffix}</span>
        ) : null}
      </Div>
    );
  });

  return (
    <Div key={`dropcap-${blockIdx}`} style={htmlStyles.blockRow}>
      {gutterColumn}
      <Div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          flex: "0 0 auto",
        }}
      >
        <Div style={{ marginRight: `${CAP_GUTTER}px`, flexShrink: 0 }}>
          <HtmlOrnateDropCap
            token={dropTok}
            folioId={folioId}
            blockIndex={firstLine.bi}
            bkey={`b${firstLine.bi}`}
            imageUri={uploadedImages[dropcapId]}
            onPress={triggerPick ? () => void triggerPick(dropcapId) : undefined}
          />
        </Div>
        <Div style={{ display: "flex", flexDirection: "column" }}>{bodyLineNodes}</Div>
      </Div>
    </Div>
  );
}

/**
 * Two-column-aware drop cap section: left column shows cap+body lines,
 * right column shows the corresponding right-column content for those rows.
 */
function renderDropCapSection2Col(
  capLines: SpatialLine[],
  rightLines: (SpatialLine | undefined)[],
  dropTok: Token,
  settings: DisplaySettings,
  uploadedImages: Record<string, string>,
  colW: number,
  folioId: string,
  blockIdx: number,
  triggerPick?: (id: string) => void,
): React.ReactNode {
  const depth = dropTok.initialDepth ?? 3;
  const boxH = depth * LH;
  const boxW = dropCapBoxWidth(boxH, Math.max(1, dropTok.value.length));
  const effectiveColW = colW - LINE_NUM_W;
  const bodyW = effectiveColW - boxW - CAP_GUTTER;
  const firstLine = capLines[0];
  const dropcapId = `dc_b${firstLine.bi}`;

  const leftBodyNodes = capLines.map((line, di) => {
    const block = line.block;
    if (blockIsMetadataLeak(block)) return null;
    const isLast = di === capLines.length - 1;
    const isRubric = block.type === "rubric";
    const isHeading = block.type === "heading";
    const isGloss = block.type === "gloss";
    const figToks = block.tokens.filter((t) => t.type === "figure_anchor");
    let lineSegs = blockToSegs(block, settings);
    if (di === 0) lineSegs = stripDropCapPrefixFromSegs(lineSegs, dropTok.value);
    return (
      <Div
        key={`b${line.bi}`}
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: isGloss ? `${FS * 0.85}px` : isHeading ? `${FS * 1.1}px` : `${FS}px`,
          lineHeight: `${LH}px`,
          color: isRubric || isHeading ? RUBRIC_FILL : isGloss ? GLOSS_FILL : PROSE_FILL,
          fontWeight: isRubric || isHeading ? "bold" : "normal",
          fontStyle: isGloss ? "italic" : "normal",
          display: "block",
          textAlign: isRubric || isHeading ? "center" : "left",
          width: `${bodyW}px`,
          minHeight: `${LH}px`,
          boxSizing: "border-box",
        }}
      >
        {renderJustifiedCharacters(
          lineSegs,
          bodyW,
          isLast,
          isRubric || isHeading || isGloss,
          `b${line.bi}`,
          settings.useMufiGraphemes,
        )}
        {figToks.map((ft, i) => (
          <span key={`b${line.bi}-fig${i}`} style={{ color: "#1a3a5a", fontStyle: "italic", fontSize: `${FS}px` }}>
            [{ft.figureType ?? "FIG"}]
          </span>
        ))}
      </Div>
    );
  });

  let rightCapState = defaultCapState();
  const rightColNodes = rightLines.map((line, di) => {
    const result = HtmlLineRow({
      line,
      settings,
      capState: rightCapState,
      trackWidth: effectiveColW,
      uploadedImages,
      isLastLine: di === rightLines.length - 1,
      folioId,
      triggerPick,
    });
    rightCapState = result.nextCap;
    return result.node;
  });

  const showNums = settings.showLineNumbers !== false;
  const gutterColumn = (
    <Div style={htmlStyles.dropCapGutterCol} aria-hidden>
      {capLines.map((line) => (
        <LineNumberGutter
          key={`ln2-b${line.bi}`}
          lineNumber={line.block.lineNumber}
          show={showNums}
        />
      ))}
    </Div>
  );

  return (
    <Div key={`dropcap2col-${blockIdx}`} style={htmlStyles.rowLayout}>
      <Div style={{ ...htmlStyles.columnTrack, width: `${colW}px` }}>
        <Div style={htmlStyles.blockRow}>
          {gutterColumn}
          <Div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
            <Div style={{ marginRight: `${CAP_GUTTER}px`, flexShrink: 0 }}>
              <HtmlOrnateDropCap
                token={dropTok}
                folioId={folioId}
                blockIndex={firstLine.bi}
                bkey={`b${firstLine.bi}`}
                imageUri={uploadedImages[dropcapId]}
                onPress={triggerPick ? () => void triggerPick(dropcapId) : undefined}
              />
            </Div>
            <Div style={{ display: "flex", flexDirection: "column" }}>{leftBodyNodes}</Div>
          </Div>
        </Div>
      </Div>
      <Div style={{ ...htmlStyles.columnTrack, width: `${colW}px` }}>
        {rightColNodes}
      </Div>
    </Div>
  );
}

function renderColumnBlock(
  cb: SpatialColumnBlock,
  blockIdx: number,
  settings: DisplaySettings,
  uploadedImages: Record<string, string>,
  innerW: number,
  colW: number,
  folioId: string,
  triggerPick?: (id: string) => void,
): React.ReactNode {
  const rows = zipColumnBlockRows(cb);
  let capState = defaultCapState();
  let leftCap = defaultCapState();
  let rightCap = defaultCapState();
  const rowNodes: React.ReactNode[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const isLastLine = rowIdx === rows.length - 1;

    if (cb.layout === 1) {
      const block = row.left?.block;
      const dropTok = block?.tokens.find((t) => t.type === "drop_initial") ?? null;
      const depth = dropTok?.initialDepth ?? 1;

      if (dropTok && depth > 1 && row.left) {
        const capLines: SpatialLine[] = [];
        for (let di = 0; di < depth && rowIdx + di < rows.length; di++) {
          const r = rows[rowIdx + di].left;
          if (r) capLines.push(r);
        }
        rowNodes.push(
          renderDropCapSection(
            capLines, dropTok, settings, uploadedImages,
            innerW - LINE_NUM_W, folioId, blockIdx, triggerPick,
          ),
        );
        rowIdx += capLines.length - 1;
        continue;
      }

      const result = HtmlLineRow({
        line: row.left,
        settings,
        capState,
        trackWidth: innerW - LINE_NUM_W,
        uploadedImages,
        isLastLine,
        folioId,
        triggerPick,
      });
      capState = result.nextCap;
      if (result.node) rowNodes.push(result.node);
    } else {
      const leftBlock = row.left?.block;
      const dropTok2 = leftBlock?.tokens.find((t) => t.type === "drop_initial") ?? null;
      const depth2 = dropTok2?.initialDepth ?? 1;

      if (dropTok2 && depth2 > 1 && row.left) {
        const capLines: SpatialLine[] = [];
        const rightLines: (SpatialLine | undefined)[] = [];
        for (let di = 0; di < depth2 && rowIdx + di < rows.length; di++) {
          const r = rows[rowIdx + di];
          if (r.left) capLines.push(r.left);
          rightLines.push(r.right);
        }
        rowNodes.push(
          renderDropCapSection2Col(
            capLines, rightLines, dropTok2, settings, uploadedImages,
            colW, folioId, blockIdx, triggerPick,
          ),
        );
        rowIdx += capLines.length - 1;
        continue;
      }

      const leftResult = HtmlLineRow({
        line: row.left,
        settings,
        capState: leftCap,
        trackWidth: colW - LINE_NUM_W,
        uploadedImages,
        isLastLine,
        folioId,
        triggerPick,
      });
      leftCap = leftResult.nextCap;

      const rightResult = HtmlLineRow({
        line: row.right,
        settings,
        capState: rightCap,
        trackWidth: colW - LINE_NUM_W,
        uploadedImages,
        isLastLine,
        folioId,
        triggerPick,
      });
      rightCap = rightResult.nextCap;

      rowNodes.push(
        <Div key={`cb${blockIdx}-r${rowIdx}`} style={htmlStyles.rowLayout}>
          <Div style={{ ...htmlStyles.columnTrack, width: `${colW}px` }}>{leftResult.node}</Div>
          <Div style={{ ...htmlStyles.columnTrack, width: `${colW}px` }}>{rightResult.node}</Div>
        </Div>,
      );
    }
  }

  const containerStyle =
    cb.layout === 2 ? htmlStyles.twoColContainer : htmlStyles.oneColContainer;

  return (
    <Div key={`cb-${blockIdx}`} style={containerStyle}>
      {rowNodes}
    </Div>
  );
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
}: SvgFacsimilePageProps) {
  const t = useT();
  const { uploadedImages, triggerImagePick } = useContext(FigureImageContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(480);
  // Only re-render SVG when this folio's figure URIs change (ignore unrelated uploads).
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
    // folioImageSig captures the relevant URI values.
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

  const spatialFolio = useMemo(() => buildSpatialFolio(folio), [folio]);

  const htmlBody = useMemo(() => {
    const rows: React.ReactNode[] = [];

    for (let hi = 0; hi < folio.headings.length; hi++) {
      const headText = formatRunningHeaderText(folio.headings[hi], {
        showExpanded: settings.showExpanded,
        useNormalizedDiacritics: settings.useNormalizedDiacritics,
        suppressOtioseMarks: settings.suppressOtioseMarks,
      });
      if (!headText) continue;
      rows.push(
        <Div key={`h-${hi}-${headText}`} style={{ ...htmlStyles.heading, width: `${innerW}px` }}>
          {headText}
        </Div>,
      );
    }

    spatialFolio.columnBlocks.forEach((cb, blockIdx) => {
      rows.push(
        renderColumnBlock(cb, blockIdx, settings, folioImages, innerW, colW, folio.id, triggerImagePick),
      );
    });

    if (folio.catchword) {
      rows.push(
        <Div key="cw" style={htmlStyles.footerRight}>
          {t("studio.catchwordLabel", { text: folio.catchword })}
        </Div>,
      );
    }
    if (folio.signature) {
      rows.push(
        <Div key="sg" style={htmlStyles.footerLeft}>
          {t("studio.signatureLabel", { text: folio.signature })}
        </Div>,
      );
    }

    return rows;
    // t: rebuild rows (diagram label, catchword/signature) when the UI locale changes.
  }, [folio, spatialFolio, settings, folioImages, innerW, colW, triggerImagePick, t]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let raf = 0;
    const measure = () => {
      // Coalesce ResizeObserver callbacks onto the next frame to avoid
      // "ResizeObserver loop limit exceeded" during fast folio scrolls.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setContentH(Math.max(320, el.scrollHeight + PAGE_PAD_TOP + PAGE_PAD_BOT));
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [htmlBody]);

  const svgH = contentH;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.scrollContent}
      style={styles.scrollOuter}
    >
      <View style={{ width: canvasW }}>
        <Svg width={canvasW} height={svgH}>
          <Rect x={0} y={0} width={canvasW} height={svgH} fill={PARCHMENT_BG} rx={4} />

          <SvgLine x1={colAX} y1={16} x2={colAX} y2={svgH - 16} stroke={RULE_STROKE} strokeWidth={0.75} />
          <SvgLine
            x1={colAX + colW}
            y1={16}
            x2={colAX + colW}
            y2={svgH - 16}
            stroke={RULE_STROKE}
            strokeWidth={0.5}
            strokeDasharray="2,4"
          />
          <SvgLine
            x1={colBX}
            y1={16}
            x2={colBX}
            y2={svgH - 16}
            stroke={RULE_STROKE}
            strokeWidth={0.5}
            strokeDasharray="2,4"
          />
          <SvgLine
            x1={canvasW - MARGIN}
            y1={16}
            x2={canvasW - MARGIN}
            y2={svgH - 16}
            stroke={RULE_STROKE}
            strokeWidth={0.75}
          />

          <ForeignObject x={0} y={0} width={canvasW} height={svgH}>
            <Div
              ref={contentRef}
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                ...htmlStyles.pageShell,
                width: `${canvasW}px`,
                paddingTop: `${PAGE_PAD_TOP}px`,
                paddingBottom: `${PAGE_PAD_BOT}px`,
                paddingLeft: `${MARGIN}px`,
                paddingRight: `${MARGIN}px`,
                boxSizing: "border-box",
              }}
            >
              {htmlBody}
            </Div>
          </ForeignObject>
        </Svg>
      </View>
    </ScrollView>
  );
}

const htmlStyles: Record<string, React.CSSProperties> = {
  pageShell: { margin: 0, display: "block" },
  heading: {
    textAlign: "center",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${FS * 1.1}px`,
    lineHeight: `${LH * 1.2}px`,
    fontWeight: "bold",
    fontStyle: "normal",
    color: RUBRIC_FILL,
    marginTop: "6px",
    marginBottom: "6px",
    boxSizing: "border-box",
  },
  blockRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  leftLineGutter: {
    width: `${LINE_NUM_W}px`,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingRight: "8px",
    borderRight: `1px solid ${RULE_STROKE}`,
    boxSizing: "border-box",
    userSelect: "none",
    WebkitUserSelect: "none",
    position: "relative",
    minHeight: `${LH}px`,
  },
  gutterLineNum: {
    fontFamily: "monospace",
    fontSize: "11px",
    lineHeight: `${LH}px`,
    height: `${LH}px`,
    color: FAINT_FILL,
    fontWeight: 700,
    textAlign: "right",
    userSelect: "none",
  },
  marginaliaLabel: {
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
    fontSize: "10px",
    letterSpacing: "2px",
    color: "#5a2317",
    textTransform: "uppercase",
    fontFamily: "Georgia, 'Times New Roman', serif",
    position: "absolute",
    left: "2px",
    top: "4px",
    maxHeight: `${LH * 5}px`,
    overflow: "hidden",
    userSelect: "none",
  },
  dropCapGutterCol: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: `${LINE_NUM_W}px`,
  },
  lineNumberSpacerHidden: {
    width: 0,
    flexShrink: 0,
    display: "inline-block",
    overflow: "hidden",
  },
  // Legacy aliases kept for any residual references
  lineNumberLabel: {
    width: `${LINE_NUM_W}px`,
    flexShrink: 0,
    fontFamily: "monospace",
    fontSize: "11px",
    lineHeight: `${LH}px`,
    color: FAINT_FILL,
    textAlign: "right",
    paddingRight: "8px",
    borderRight: `1px solid ${RULE_STROKE}`,
    userSelect: "none",
    display: "inline-block",
    boxSizing: "border-box",
  },
  lineNumberSpacer: {
    width: `${LINE_NUM_W}px`,
    flexShrink: 0,
    display: "inline-block",
    borderRight: `1px solid ${RULE_STROKE}`,
    boxSizing: "border-box",
  },
  rowLayout: {
    display: "flex",
    flexDirection: "row",
    width: "100%",
    gap: `${GUTTER_WIDTH}px`,
    alignItems: "flex-start",
  },
  columnTrack: { flexShrink: 0, minWidth: 0 },
  oneColContainer: { width: "100%", marginBottom: "12px", display: "block" },
  twoColContainer: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    gap: "4px",
    marginBottom: "12px",
  },
  wrapBackOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: `${FS}px`,
    lineHeight: `${LH}px`,
    fontStyle: "italic",
    color: PROSE_FILL,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  footerRight: {
    textAlign: "right",
    fontStyle: "italic",
    fontSize: `${FS - 2}px`,
    lineHeight: `${LH}px`,
    color: FAINT_FILL,
    marginTop: "8px",
    display: "block",
  },
  footerLeft: {
    textAlign: "left",
    fontStyle: "italic",
    fontSize: `${FS - 2}px`,
    lineHeight: `${LH}px`,
    color: FAINT_FILL,
    marginTop: "4px",
    display: "block",
  },
};

const styles = StyleSheet.create({
  scrollOuter: {
    width: "100%",
    marginVertical: 6,
  },
  scrollContent: {
    alignItems: "flex-start",
  },
});

function Div(props: React.ComponentPropsWithRef<"div"> & { xmlns?: string }) {
  return createElement("div", props);
}
