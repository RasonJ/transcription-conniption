import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { useLibraryCatalog } from "@/hooks/useLibraryCatalog";
import { useT } from "@/i18n/runtime";
import { askCopilot, runRecipeById } from "@/utils/copilot/ask";
import { buildFacetIndex } from "@/utils/copilot/facetIndex";
import {
  buildLibraryAwareRouterIndex,
  matchLibraryEntry,
} from "@/utils/copilot/libraryIntents";
import { precomputeEager } from "@/utils/copilot/precompute";
import type { CopilotAnswer, EvidenceRow, EvidenceTier } from "@/utils/copilot/types";
import { buildManuscriptVectorIndex } from "@/utils/manuscriptVectorIndex";
import { ArrowRight, BookOpen, Search, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ManuscriptChatbotDrawer({ visible, onClose }: Props) {
  const t = useT();
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const { parsedManuscript, activeFileName, workspace } = useScriptorium();
  const { catalog } = useLibraryCatalog();
  const { navigateToAnchor } = useScrollAnchor();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);

  const facets = useMemo(
    () => (visible ? buildFacetIndex(parsedManuscript) : null),
    [visible, parsedManuscript],
  );

  const vectorIndex = useMemo(
    () => (visible ? buildManuscriptVectorIndex(parsedManuscript) : undefined),
    [visible, parsedManuscript],
  );

  const libraryAwareRouter = useMemo(
    () => (visible ? buildLibraryAwareRouterIndex(catalog) : undefined),
    [visible, catalog],
  );

  const overview = useMemo(
    () =>
      facets
        ? precomputeEager(parsedManuscript, facets)
            .filter((entry) => entry.count > 0)
            .sort((a, b) => a.chipLabel.localeCompare(b.chipLabel))
        : [],
    [facets, parsedManuscript],
  );

  const libraryHit = useMemo(
    () =>
      matchLibraryEntry(
        catalog,
        activeFileName ?? workspace?.sourceFileName,
        parsedManuscript.metadata.title,
      ),
    [catalog, activeFileName, workspace?.sourceFileName, parsedManuscript.metadata.title],
  );

  const handleAsk = useCallback(() => {
    if (!query.trim() || !facets) return;

    const result = askCopilot(query, parsedManuscript, {
      facets,
      vectorIndex,
      router: libraryAwareRouter,
    });

    if (result.navigate) {
      navigateToAnchor(result.navigate);
      setAnswer(null);
      onClose();
      return;
    }
    setAnswer(result);
  }, [
    query,
    parsedManuscript,
    facets,
    vectorIndex,
    libraryAwareRouter,
    navigateToAnchor,
    onClose,
  ]);

  const handleRecipe = useCallback(
    (recipeId: string) => {
      if (!facets) return;
      const result = runRecipeById(recipeId, parsedManuscript, { facets, vectorIndex });
      if (result) setAnswer(result);
    },
    [facets, parsedManuscript, vectorIndex],
  );

  const handleJumpToRow = useCallback(
    (row: EvidenceRow) => {
      navigateToAnchor({ folioId: row.folioId, lineNumber: row.lineNumber });
      onClose();
    },
    [navigateToAnchor, onClose],
  );

  const tierLabel = useCallback(
    (tier: EvidenceTier) => t(`copilot.tier.${tier}` as "copilot.tier.A"),
    [t],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, isWide && styles.backdropWide]}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.panel, isWide ? styles.panelSide : styles.panelSheet]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Sparkles color="#f6d890" size={18} />
              <Text style={styles.title}>{t("copilot.title")}</Text>
            </View>
            {answer && answer.elapsedMs > 0 ? (
              <Text style={styles.speedBadge}>{answer.elapsedMs.toFixed(2)} ms</Text>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("copilot.closeLabel")}
            >
              <X color="#f6d890" size={22} />
            </Pressable>
          </View>

          <Text style={styles.hint}>{t("copilot.hint")}</Text>

          <View style={styles.inputRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleAsk}
              placeholder={t("copilot.placeholder")}
              placeholderTextColor="#99836a"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable
              onPress={handleAsk}
              style={styles.sendButton}
              accessibilityRole="button"
              accessibilityLabel={t("copilot.searchLabel")}
            >
              <Search color="#1a0a05" size={16} />
            </Pressable>
          </View>

          <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
            {libraryHit ? (
              <View style={styles.overview}>
                <Text style={styles.sectionLabel}>{t("copilot.librarySection")}</Text>
                <Text style={styles.libraryTitle}>{libraryHit.title || libraryHit.baseName}</Text>
                <Text style={styles.libraryMeta}>
                  {[libraryHit.author, libraryHit.year, libraryHit.city, libraryHit.printer]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            ) : null}

            {overview.length > 0 ? (
              <View style={styles.overview}>
                <Text style={styles.sectionLabel}>{t("copilot.overview")}</Text>
                <View style={styles.chipRow}>
                  {overview.map((entry) => (
                    <Pressable
                      key={entry.recipeId}
                      onPress={() => handleRecipe(entry.recipeId)}
                      style={styles.chip}
                      accessibilityRole="button"
                      accessibilityLabel={`${entry.chipLabel}: ${entry.count}`}
                    >
                      <Text style={styles.chipLabel}>{entry.chipLabel}</Text>
                      <Text style={styles.chipCount}>{entry.count}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {answer ? (
              <View style={styles.answerCard}>
                <View style={styles.answerTop}>
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierBadgeText}>
                      {answer.tier} · {tierLabel(answer.tier)}
                    </Text>
                  </View>
                  {answer.confidence !== undefined && answer.confidence < 1 ? (
                    <Text style={styles.confidence}>{(answer.confidence * 100).toFixed(0)}%</Text>
                  ) : null}
                </View>
                <Text style={styles.headline}>{answer.headline}</Text>

                {answer.breakdown && answer.breakdown.length > 0 ? (
                  <View style={styles.breakdown}>
                    {answer.breakdown.map((b) => (
                      <View key={b.label} style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>{b.label}</Text>
                        <Text style={styles.breakdownValue}>{b.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {answer.alternatives && answer.alternatives.length > 0 ? (
                  <View style={styles.chipRow}>
                    <Text style={styles.sectionLabel}>{t("copilot.didYouMean")}</Text>
                    {answer.alternatives.map((alt) => (
                      <Pressable
                        key={alt.recipeId}
                        onPress={() => handleRecipe(alt.recipeId)}
                        style={styles.chip}
                        accessibilityRole="button"
                      >
                        <Text style={styles.chipLabel}>{alt.chipLabel}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {answer.rows.map((row, i) => (
                  <Pressable
                    key={`${row.folioId}_${row.lineNumber ?? ""}_${i}`}
                    onPress={() => handleJumpToRow(row)}
                    style={styles.hitCard}
                    accessibilityRole="button"
                  >
                    <View style={styles.hitHeader}>
                      <View style={styles.hitMetaRow}>
                        <BookOpen color="#f6d890" size={12} />
                        <Text style={styles.hitFolio}>
                          [fol. {row.folioId}]
                          {row.lineNumber
                            ? ` · ${t("copilot.hit.line", { line: row.lineNumber })}`
                            : ""}
                        </Text>
                      </View>
                      <Text style={styles.hitScore}>{row.label}</Text>
                    </View>
                    {row.detail ? (
                      <Text style={styles.hitText} numberOfLines={2}>
                        {row.detail}
                      </Text>
                    ) : null}
                    <View style={styles.jumpHint}>
                      <Text style={styles.jumpHintText}>{t("copilot.hit.jump")}</Text>
                      <ArrowRight color="#f6d890" size={12} />
                    </View>
                  </Pressable>
                ))}

                {answer.method ? <Text style={styles.method}>{answer.method}</Text> : null}
                {answer.dsl ? <Text style={styles.dsl}>{answer.dsl}</Text> : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  backdropWide: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  panel: {
    backgroundColor: "#2a100b",
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    padding: 16,
    gap: 8,
    zIndex: 2,
  },
  panelSheet: {
    maxHeight: "82%",
    minHeight: "45%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  panelSide: {
    width: 400,
    maxWidth: "92%",
    height: "100%",
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderRightWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { color: "#f6d890", fontSize: 18, fontWeight: "900" },
  speedBadge: {
    color: "#8fbf6a",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  hint: { color: "rgba(246,216,144,0.65)", fontSize: 12, marginBottom: 4 },
  inputRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: "rgba(244,235,208,0.12)",
    borderColor: "rgba(246,216,144,0.2)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff4d2",
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: "#f6d890",
    borderRadius: 12,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsList: { flexGrow: 1, marginTop: 4 },
  overview: { marginBottom: 10, gap: 6 },
  sectionLabel: {
    color: "rgba(246,216,144,0.65)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  libraryTitle: { color: "#fff4d2", fontSize: 14, fontWeight: "800" },
  libraryMeta: { color: "rgba(246,216,144,0.7)", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(246,216,144,0.1)",
    borderColor: "rgba(246,216,144,0.3)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLabel: { color: "#fff4d2", fontSize: 12, fontWeight: "700" },
  chipCount: { color: "#f6d890", fontSize: 12, fontWeight: "900", fontFamily: "monospace" },
  answerCard: {
    backgroundColor: "rgba(255,253,244,0.05)",
    borderColor: "rgba(246,216,144,0.25)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  answerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tierBadge: {
    backgroundColor: "#f6d890",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierBadgeText: { color: "#1a0a05", fontSize: 11, fontWeight: "900" },
  confidence: { color: "rgba(255,244,210,0.5)", fontSize: 11, fontFamily: "monospace" },
  headline: { color: "#fff4d2", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  breakdown: { gap: 2 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { color: "rgba(255,244,210,0.8)", fontSize: 12 },
  breakdownValue: { color: "#f6d890", fontSize: 12, fontWeight: "800", fontFamily: "monospace" },
  hitCard: {
    backgroundColor: "rgba(255,253,244,0.05)",
    borderColor: "rgba(246,216,144,0.15)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  hitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hitMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  hitFolio: { color: "#f6d890", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  hitScore: { color: "rgba(255,244,210,0.5)", fontSize: 11, fontFamily: "monospace" },
  hitText: { color: "#fff4d2", fontSize: 13, lineHeight: 18 },
  jumpHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  jumpHintText: { color: "rgba(246,216,144,0.55)", fontSize: 11, fontWeight: "600" },
  method: { color: "rgba(246,216,144,0.55)", fontSize: 11, fontStyle: "italic" },
  dsl: { color: "rgba(143,191,106,0.9)", fontSize: 11, fontFamily: "monospace" },
});
