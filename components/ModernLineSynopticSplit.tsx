import type { FolioSide } from "@/constants/manuscript";
import { useT } from "@/i18n/runtime";
import { modernizeFolioLines, type ModernLanguageHint } from "@/utils/modernizedText";
import { bcp47ForHsmsCode } from "@/utils/witnessLanguage";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  folio: FolioSide;
  diplomaticContent: React.ReactNode;
  highlight: { folioId: string; lineNumber?: string } | null;
  languageHint?: ModernLanguageHint;
};

const HSMS_LANG_ALIAS: Record<string, string> = {
  POR: "PRT",
  PT: "PRT",
  SPA: "SPN",
  ES: "SPN",
  CAST: "SPN",
};

function aliasHsmsCode(hint: ModernLanguageHint): string {
  const code = String(hint || "PRT").toUpperCase();
  return HSMS_LANG_ALIAS[code] ?? code;
}

/**
 * Dual-pane leaf: diplomatic HSMS render (left) + synchronized modern orthography (right).
 */
export function ModernLineSynopticSplit({
  folio,
  diplomaticContent,
  highlight,
  languageHint = "PRT",
}: Props) {
  const t = useT();

  const modernLines = useMemo(
    () => modernizeFolioLines(folio.blocks, languageHint),
    [folio.blocks, languageHint],
  );
  const readingLanguage = bcp47ForHsmsCode(aliasHsmsCode(languageHint));

  return (
    <View style={styles.container}>
      <View style={styles.pane}>
        <Text style={styles.paneTitleDiplomatic}>{t("studio.synoptic.diplomaticTitle")}</Text>
        {diplomaticContent}
      </View>

      <View style={[styles.pane, styles.modernPane]}>
        <Text style={styles.paneTitle}>{t("studio.synoptic.modernTitle")}</Text>
        <ScrollView style={styles.modernScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          {modernLines.map((item, idx) => {
            const isHighlighted =
              highlight?.folioId === folio.id &&
              !!item.lineNumber &&
              highlight?.lineNumber === item.lineNumber;

            return (
              <View
                key={`${item.lineNumber || "x"}_${idx}`}
                style={[styles.lineRow, isHighlighted && styles.lineRowHighlighted]}
              >
                <View
                  style={styles.gutter}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={styles.lineNumber}>{item.lineNumber}</Text>
                </View>
                <Text
                  style={[styles.modernText, item.isRubric && styles.modernRubric]}
                  selectable
                  accessibilityLanguage={readingLanguage}
                >
                  {item.modernText}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
  modernPane: {
    backgroundColor: "#2a1612",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.25)",
    padding: 12,
  },
  paneTitleDiplomatic: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6d5339",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  paneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#f6d890",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modernScroll: {
    flexGrow: 1,
    maxHeight: 650,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246, 216, 144, 0.08)",
  },
  lineRowHighlighted: {
    backgroundColor: "rgba(155, 34, 23, 0.35)",
    borderRadius: 4,
  },
  gutter: {
    width: 36,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: "rgba(246, 216, 144, 0.2)",
    alignItems: "flex-end",
    marginRight: 8,
  },
  lineNumber: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#c8995f",
    fontWeight: "700",
  },
  modernText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: "#fff4d2",
    fontFamily: "Georgia",
  },
  modernRubric: {
    color: "#ef9a9a",
    fontWeight: "bold",
  },
});
