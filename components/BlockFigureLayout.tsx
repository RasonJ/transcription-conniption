import { FigurePlaceholder } from "@/components/FigurePlaceholder";
import type { ManuscriptBlock, Token } from "@/constants/manuscript";
import { LANGUAGE_TAG_LABELS } from "@/constants/languageTags";
import {
  partitionFigureSegments,
  segmentTokensForRender,
  type TokenSegment,
} from "@/utils/figureLayout";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type ScrollHighlight = { folioId: string; lineNumber?: string } | null;

type Props = {
  block: ManuscriptBlock;
  highlight: ScrollHighlight;
  blockStyle: object[];
  renderTokenStream: (tokens: Token[], blockType?: ManuscriptBlock["type"]) => React.ReactNode;
};

function renderFlowSegments(
  segments: TokenSegment[],
  block: ManuscriptBlock,
  blockStyle: object[],
  renderTokenStream: Props["renderTokenStream"],
) {
  const nodes: React.ReactNode[] = [];
  let textRun: Token[] = [];
  let nodeIndex = 0;

  const flushTextRun = () => {
    if (textRun.length === 0) return;

    nodes.push(
      <Text key={`txt-${nodeIndex++}`} style={blockStyle}>
        {renderTokenStream(textRun, block.type)}
      </Text>,
    );
    textRun = [];
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.kind === "figure") {
      flushTextRun();
      nodes.push(
        <View key={`fig-${nodeIndex++}`} style={styles.inlineFigureRow}>
          <View style={styles.inlineFigureSlot}>
            <FigurePlaceholder token={segment.token} />
          </View>
        </View>,
      );
    } else {
      textRun.push(...segment.tokens);
    }
  }

  flushTextRun();
  return nodes;
}

export function BlockFigureLayout({ block, highlight, blockStyle, renderTokenStream }: Props) {
  const segments = useMemo(() => segmentTokensForRender(block.tokens), [block.tokens]);
  const { marginFigures, fullWidthFigures, flowSegments } = useMemo(
    () => partitionFigureSegments(segments),
    [segments],
  );

  const lineHit =
    highlight?.folioId != null &&
    highlight.lineNumber != null &&
    block.lineNumber != null &&
    highlight.lineNumber === block.lineNumber;

  const textBody = (
    <>
      {fullWidthFigures.map((token, idx) => (
        <View key={token.figureId ?? `fw-${idx}`} style={styles.fullWidthFigure}>
          <FigurePlaceholder token={token} />
        </View>
      ))}
      {renderFlowSegments(flowSegments, block, blockStyle, renderTokenStream)}
    </>
  );

  const headerLabel = block.language ? (
    <Text style={styles.languageTag}>
      {block.language}
      {LANGUAGE_TAG_LABELS[block.language] ? ` · ${LANGUAGE_TAG_LABELS[block.language]}` : ""}
    </Text>
  ) : null;

  return (
    <View style={[styles.blockRow, lineHit && styles.blockRowHighlight]}>
      {block.lineNumber ? (
        <Text style={styles.lineNumberLabel} numberOfLines={2}>
          {block.lineNumber}
        </Text>
      ) : null}

      {marginFigures.length === 0 ? (
        <View style={styles.blockBody}>
          {headerLabel}
          {textBody}
        </View>
      ) : (
        <View style={styles.blockWithMargin}>
          <View style={styles.marginTrack}>
            {marginFigures.map((token, idx) => (
              <View key={token.figureId ?? `m-${idx}`} style={styles.marginFigureSlot}>
                <FigurePlaceholder token={token} />
              </View>
            ))}
          </View>
          <View style={styles.textTrack}>
            {headerLabel}
            {textBody}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blockRow: { flexDirection: "row", marginBottom: 6, alignItems: "flex-start", width: "100%" },
  blockRowHighlight: {
    backgroundColor: "rgba(155,34,23,0.14)",
    borderRadius: 4,
    marginHorizontal: -2,
    paddingHorizontal: 2,
  },
  lineNumberLabel: {
    width: 28,
    fontSize: 11,
    color: "#99836a",
    fontWeight: "700",
    paddingTop: 4,
    marginRight: 4,
    textAlign: "left",
    fontFamily: "monospace",
  },
  blockBody: { flex: 1 },
  blockWithMargin: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  marginTrack: {
    width: "30%",
    maxWidth: 140,
    minWidth: 72,
    borderRightWidth: 1,
    borderRightColor: "rgba(109,83,57,0.25)",
    paddingRight: 8,
    gap: 8,
  },
  marginFigureSlot: { width: "100%" },
  textTrack: { flex: 1, minWidth: 0 },
  inlineFigureRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 4 },
  inlineFigureSlot: { maxWidth: 120, marginRight: 8 },
  fullWidthFigure: { width: "100%", marginVertical: 6 },
  languageTag: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6d5339",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
});
