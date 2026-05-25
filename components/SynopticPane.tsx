import type { FolioSide } from "@/constants/manuscript";
import { renderNormalizedBlock } from "@/utils/normalizedText";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

type HighlightTarget = { folioId: string; lineNumber?: string } | null;

type Props = {
  folio: FolioSide;
  highlight?: HighlightTarget;
  /** When true, omit outer pane chrome (used inside SynopticFolioSplit scroll column). */
  embedded?: boolean;
};

type NormalizedRow = {
  lineNumber?: string;
  text: string;
  type: string;
};

export const SynopticPane = React.memo(function SynopticPane({
  folio,
  highlight,
  embedded,
}: Props) {
  const normalizedLines = useMemo(() => {
    const lines: NormalizedRow[] = [];
    for (let i = 0; i < folio.blocks.length; i++) {
      const block = folio.blocks[i];
      const text = renderNormalizedBlock(block);
      if (text.length > 0) {
        lines.push({ lineNumber: block.lineNumber, text, type: block.type });
      }
    }
    return lines;
  }, [folio.blocks]);

  const isCurrentFolio = highlight?.folioId === folio.id && !!highlight.lineNumber;

  const body = (
    <>
      <Text style={styles.paneLabel}>Normalized reading</Text>
      <Text style={styles.folioTag}>[fol. {folio.id}]</Text>
      {normalizedLines.map((row, idx) => {
        const isHit = isCurrentFolio && row.lineNumber === highlight?.lineNumber;

        const textStyles = [
          styles.lineText,
          row.type === "rubric" && styles.rubric,
          row.type === "gloss" && styles.gloss,
        ];

        return (
          <View key={`n-${idx}`} style={[styles.lineRow, isHit && styles.lineRowHighlight]}>
            {row.lineNumber ? (
              <Text style={styles.lineNum}>{row.lineNumber}</Text>
            ) : (
              <View style={styles.lineNumSpacer} />
            )}
            <Text style={textStyles}>{row.text}</Text>
          </View>
        );
      })}
    </>
  );

  return <View style={embedded ? styles.embeddedRoot : styles.pane}>{body}</View>;
});

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: "#e8f0e6",
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(109,83,57,0.25)",
  },
  embeddedRoot: {
    flex: 1,
    backgroundColor: "#e8f0e6",
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(109,83,57,0.25)",
  },
  paneLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#3c5a3c",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  folioTag: { fontSize: 11, color: "#6d8a6d", marginBottom: 8, fontStyle: "italic" },
  lineRow: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  lineRowHighlight: { backgroundColor: "rgba(155,34,23,0.12)", borderRadius: 4 },
  lineNum: {
    width: 40,
    fontSize: 9,
    color: "#6d8a6d",
    paddingTop: 2,
    fontFamily: "monospace",
  },
  lineNumSpacer: { width: 40 },
  lineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: "#1e2e1e",
    textAlign: "justify",
  },
  rubric: { color: "#9b2217", fontWeight: "700" },
  gloss: { fontStyle: "italic", color: "#1a446c", fontSize: 13 },
});
