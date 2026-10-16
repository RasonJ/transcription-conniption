import { scriptoriumTheme } from "@/constants/scriptoriumTheme";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { useLibraryCatalog } from "@/hooks/useLibraryCatalog";
import { useT } from "@/i18n/runtime";
import type { LibraryCatalogEntry } from "@/utils/libraryCatalog";
import { countLibraryByStatus } from "@/utils/libraryCatalog";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { BookMarked, RefreshCw, Search } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function LibraryRow({
  entry,
  onOpen,
  opening,
}: {
  entry: LibraryCatalogEntry;
  onOpen: (entry: LibraryCatalogEntry) => void;
  opening: boolean;
}) {
  const t = useT();
  const disabled = entry.status !== "ok" || opening;

  return (
    <Pressable
      onPress={() => onOpen(entry)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.rowCard,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {entry.title || entry.baseName}
        </Text>
        {entry.status === "failed" ? (
          <View style={styles.badgeFailed}>
            <Text style={styles.badgeFailedText}>{t("library.failed")}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.rowMeta}>
        {entry.author ? `${entry.author}` : t("library.unknownAuthor")}
        {entry.year ? ` · ${entry.year}` : ""}
      </Text>
      {(entry.city || entry.printer) && (
        <Text style={styles.rowSubMeta} numberOfLines={1}>
          {[entry.city, entry.printer].filter(Boolean).join(" · ")}
        </Text>
      )}
      <Text style={styles.rowFile}>{entry.sourceFileName}</Text>
      {entry.status === "ok" && (
        <Text style={styles.rowAction}>
          {opening ? t("library.opening") : t("library.open")}
        </Text>
      )}
    </Pressable>
  );
}

export default function LibraryScreen() {
  const t = useT();
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const { applyTranscription } = useScriptorium();
  const {
    loadState,
    catalog,
    errorMessage,
    filters,
    setFilters,
    filteredEntries,
    reload,
    loadEntryPayload,
    loadingEntryId,
  } = useLibraryCatalog();
  const [openError, setOpenError] = useState<string | null>(null);

  const statusCounts = useMemo(
    () => (catalog ? countLibraryByStatus(catalog.entries) : { ok: 0, failed: 0 }),
    [catalog],
  );

  const handleOpen = useCallback(
    async (entry: LibraryCatalogEntry) => {
      setOpenError(null);
      try {
        const payload = await loadEntryPayload(entry);
        applyTranscription(payload.transcriptionText, {
          sourceFileName: payload.sourceFileName,
          manuscriptTitle: payload.title,
        });
        router.navigate("/(tabs)/");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("library.loadError");
        setOpenError(message);
        Alert.alert(t("library.alertTitle"), message);
      }
    },
    [applyTranscription, loadEntryPayload, t],
  );

  return (
    <LinearGradient colors={scriptoriumTheme.gradient} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.headerRow, isWide && styles.headerRowWide]}>
            <View style={styles.titleBlock}>
              <View style={styles.iconBadge}>
                <BookMarked color={scriptoriumTheme.gold} size={24} />
              </View>
              <View style={styles.titleTextBlock}>
                <Text style={styles.heading}>{t("library.title")}</Text>
                <Text style={styles.subheading}>{t("library.subtitle")}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => void reload()}
              style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshPressed]}
            >
              <RefreshCw color={scriptoriumTheme.goldMuted} size={18} />
              <Text style={styles.refreshLabel}>{t("library.refresh")}</Text>
            </Pressable>
          </View>

          <View style={[styles.searchPanel, isWide && styles.searchPanelWide]}>
            <View style={styles.searchLabelRow}>
              <Search color={scriptoriumTheme.goldMuted} size={16} />
              <Text style={styles.searchLabel}>{t("library.searchCatalog")}</Text>
            </View>
            <View style={[styles.searchGrid, isWide && styles.searchGridWide]}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{t("library.field.author")}</Text>
                <TextInput
                  value={filters.author ?? ""}
                  onChangeText={(author) => setFilters((prev) => ({ ...prev, author }))}
                  placeholder={t("library.placeholder.author")}
                  placeholderTextColor="rgba(255,253,244,0.35)"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{t("library.field.year")}</Text>
                <TextInput
                  value={filters.year ?? ""}
                  onChangeText={(year) => setFilters((prev) => ({ ...prev, year }))}
                  placeholder={t("library.placeholder.year")}
                  placeholderTextColor="rgba(255,253,244,0.35)"
                  style={styles.input}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.fieldWrap, isWide && styles.fieldWrapWide]}>
                <Text style={styles.fieldLabel}>{t("library.field.keywords")}</Text>
                <TextInput
                  value={filters.keywords ?? ""}
                  onChangeText={(keywords) => setFilters((prev) => ({ ...prev, keywords }))}
                  placeholder={t("library.placeholder.keywords")}
                  placeholderTextColor="rgba(255,253,244,0.35)"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>

          {loadState === "loading" && (
            <View style={styles.statusBox}>
              <ActivityIndicator color={scriptoriumTheme.gold} />
              <Text style={styles.statusText}>{t("library.loading")}</Text>
            </View>
          )}

          {loadState === "error" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>{t("library.error.title")}</Text>
              <Text style={styles.errorBody}>{errorMessage}</Text>
              <Text style={styles.errorHint}>{t("library.error.hint")}</Text>
            </View>
          )}

          {loadState === "ready" && catalog && (
            <>
              <Text style={styles.resultsLine}>
                {t("library.results", {
                  shown: filteredEntries.length,
                  total: catalog.entryCount,
                })}
                {statusCounts.failed > 0
                  ? t("library.resultsFailed", {
                      ok: statusCounts.ok,
                      failed: statusCounts.failed,
                    })
                  : ""}
              </Text>
              {openError ? <Text style={styles.openError}>{openError}</Text> : null}
              {filteredEntries.length === 0 ? (
                <Text style={styles.empty}>{t("library.empty")}</Text>
              ) : (
                filteredEntries.map((entry) => (
                  <LibraryRow
                    key={entry.id}
                    entry={entry}
                    onOpen={handleOpen}
                    opening={loadingEntryId === entry.id}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  scrollWide: {
    paddingHorizontal: 48,
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
  },
  headerRow: {
    gap: 16,
    marginTop: 8,
  },
  headerRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  titleBlock: {
    flexDirection: "row",
    gap: 14,
    flex: 1,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(246,216,144,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextBlock: { flex: 1, gap: 4 },
  heading: {
    color: scriptoriumTheme.gold,
    fontSize: 24,
    fontWeight: "900",
  },
  subheading: {
    color: "rgba(255,244,210,0.7)",
    fontSize: 13,
    lineHeight: 19,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.25)",
  },
  refreshPressed: { opacity: 0.75 },
  refreshLabel: { color: scriptoriumTheme.goldMuted, fontWeight: "700", fontSize: 13 },
  searchPanel: {
    backgroundColor: "rgba(255,253,244,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.18)",
    padding: 14,
    gap: 10,
  },
  searchPanelWide: { padding: 18 },
  searchLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchLabel: { color: scriptoriumTheme.goldMuted, fontWeight: "800", fontSize: 12 },
  searchGrid: { gap: 10 },
  searchGridWide: { flexDirection: "row", flexWrap: "wrap" },
  fieldWrap: { gap: 4, flexGrow: 1, minWidth: 140 },
  fieldWrapWide: { flexBasis: "100%" },
  fieldLabel: { color: "rgba(255,244,210,0.55)", fontSize: 11, fontWeight: "700" },
  input: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff4d2",
    fontSize: 14,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  statusText: { color: "rgba(255,244,210,0.7)", fontSize: 14 },
  errorBox: {
    backgroundColor: "rgba(155,34,23,0.2)",
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(155,34,23,0.4)",
  },
  errorTitle: { color: "#f6d890", fontWeight: "800", fontSize: 15 },
  errorBody: { color: "#fff4d2", fontSize: 13 },
  errorHint: { color: "rgba(255,244,210,0.55)", fontSize: 12, lineHeight: 17 },
  resultsLine: { color: "rgba(246,216,144,0.7)", fontSize: 13, fontWeight: "600" },
  openError: { color: "#e88", fontSize: 13 },
  empty: { color: "rgba(255,244,210,0.55)", fontStyle: "italic", marginTop: 8 },
  rowCard: {
    backgroundColor: "rgba(255,253,244,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.18)",
    padding: 14,
    gap: 4,
  },
  rowPressed: { backgroundColor: "rgba(246,216,144,0.12)" },
  rowDisabled: { opacity: 0.55 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowTitle: { color: "#fff4d2", fontSize: 15, fontWeight: "800", flex: 1 },
  badgeFailed: {
    backgroundColor: "rgba(155,34,23,0.35)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeFailedText: { color: "#f6a890", fontSize: 10, fontWeight: "800" },
  rowMeta: { color: scriptoriumTheme.goldMuted, fontSize: 12 },
  rowSubMeta: { color: "rgba(255,244,210,0.45)", fontSize: 11 },
  rowFile: { color: "rgba(255,244,210,0.35)", fontSize: 11, fontFamily: "monospace" },
  rowAction: { color: scriptoriumTheme.gold, fontSize: 12, fontWeight: "800", marginTop: 4 },
});
