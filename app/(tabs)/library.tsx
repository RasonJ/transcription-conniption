import { scriptoriumTheme } from "@/constants/scriptoriumTheme";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { useLibraryCatalog } from "@/hooks/useLibraryCatalog";
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
            <Text style={styles.badgeFailedText}>failed</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.rowMeta}>
        {entry.author ? `${entry.author}` : "Unknown author"}
        {entry.year ? ` · ${entry.year}` : ""}
      </Text>
      {(entry.city || entry.printer) && (
        <Text style={styles.rowSubMeta} numberOfLines={1}>
          {[entry.city, entry.printer].filter(Boolean).join(" · ")}
        </Text>
      )}
      <Text style={styles.rowFile}>{entry.sourceFileName}</Text>
      {entry.status === "ok" && (
        <Text style={styles.rowAction}>{opening ? "Opening…" : "Open in Studio →"}</Text>
      )}
    </Pressable>
  );
}

export default function LibraryScreen() {
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
          err instanceof Error ? err.message : "Could not load this manuscript.";
        setOpenError(message);
        Alert.alert("Library", message);
      }
    },
    [applyTranscription, loadEntryPayload],
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
                <Text style={styles.heading}>Manuscript Library</Text>
                <Text style={styles.subheading}>
                  Browse batch-processed OSTA witnesses. Search by author, year, or keywords,
                  then open a transcription in the Studio.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => void reload()}
              style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshPressed]}
            >
              <RefreshCw color={scriptoriumTheme.goldMuted} size={18} />
              <Text style={styles.refreshLabel}>Refresh</Text>
            </Pressable>
          </View>

          <View style={[styles.searchPanel, isWide && styles.searchPanelWide]}>
            <View style={styles.searchLabelRow}>
              <Search color={scriptoriumTheme.goldMuted} size={16} />
              <Text style={styles.searchLabel}>Search catalog</Text>
            </View>
            <View style={[styles.searchGrid, isWide && styles.searchGridWide]}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Author</Text>
                <TextInput
                  value={filters.author ?? ""}
                  onChangeText={(author) => setFilters((prev) => ({ ...prev, author }))}
                  placeholder="e.g. Christine"
                  placeholderTextColor="rgba(255,253,244,0.35)"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Year</Text>
                <TextInput
                  value={filters.year ?? ""}
                  onChangeText={(year) => setFilters((prev) => ({ ...prev, year }))}
                  placeholder="e.g. 1518"
                  placeholderTextColor="rgba(255,253,244,0.35)"
                  style={styles.input}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.fieldWrap, isWide && styles.fieldWrapWide]}>
                <Text style={styles.fieldLabel}>Keywords</Text>
                <TextInput
                  value={filters.keywords ?? ""}
                  onChangeText={(keywords) => setFilters((prev) => ({ ...prev, keywords }))}
                  placeholder="title, city, shelfmark, file id…"
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
              <Text style={styles.statusText}>Loading library catalog…</Text>
            </View>
          )}

          {loadState === "error" && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Catalog unavailable</Text>
              <Text style={styles.errorBody}>{errorMessage}</Text>
              <Text style={styles.errorHint}>
                Run `npm run batch:osta`, then `npm run build:library` and `npm run sync:library`
                before starting the web app.
              </Text>
            </View>
          )}

          {loadState === "ready" && catalog && (
            <>
              <Text style={styles.resultsLine}>
                {filteredEntries.length} of {catalog.entryCount} witnesses
                {statusCounts.failed > 0
                  ? ` (${statusCounts.ok} ready, ${statusCounts.failed} failed compile)`
                  : ""}
              </Text>
              {openError ? <Text style={styles.openError}>{openError}</Text> : null}
              {filteredEntries.length === 0 ? (
                <Text style={styles.empty}>No manuscripts match your search.</Text>
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
    borderRadius: 12,
    backgroundColor: scriptoriumTheme.frostPanel,
    borderWidth: 1,
    borderColor: scriptoriumTheme.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextBlock: { flex: 1, gap: 6 },
  heading: {
    color: scriptoriumTheme.textCream,
    fontSize: 26,
    fontWeight: "700",
  },
  subheading: {
    color: scriptoriumTheme.textCreamSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: scriptoriumTheme.goldBorder,
    backgroundColor: scriptoriumTheme.frostPanel,
  },
  refreshPressed: { opacity: 0.85 },
  refreshLabel: {
    color: scriptoriumTheme.goldMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  searchPanel: {
    backgroundColor: scriptoriumTheme.frostPanel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: scriptoriumTheme.goldBorder,
    padding: 16,
    gap: 12,
  },
  searchPanelWide: { padding: 20 },
  searchLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchLabel: {
    color: scriptoriumTheme.goldMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  searchGrid: { gap: 12 },
  searchGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fieldWrap: { gap: 6, flex: 1, minWidth: 160 },
  fieldWrapWide: { minWidth: 220 },
  fieldLabel: {
    color: scriptoriumTheme.textCreamSoft,
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    backgroundColor: scriptoriumTheme.frostEditor,
    borderWidth: 1,
    borderColor: scriptoriumTheme.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: scriptoriumTheme.textCream,
    fontSize: 15,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  statusText: { color: scriptoriumTheme.textCreamSoft, fontSize: 14 },
  errorBox: {
    backgroundColor: scriptoriumTheme.frostPanelDeep,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(178, 30, 30, 0.35)",
    padding: 16,
    gap: 8,
  },
  errorTitle: {
    color: scriptoriumTheme.rubricRed,
    fontSize: 16,
    fontWeight: "700",
  },
  errorBody: { color: scriptoriumTheme.textCreamSoft, fontSize: 14, lineHeight: 20 },
  errorHint: {
    color: "rgba(255,253,244,0.5)",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  resultsLine: {
    color: scriptoriumTheme.goldMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  openError: {
    color: scriptoriumTheme.rubricRed,
    fontSize: 13,
  },
  empty: {
    color: scriptoriumTheme.textCreamSoft,
    fontSize: 15,
    fontStyle: "italic",
    paddingVertical: 24,
    textAlign: "center",
  },
  rowCard: {
    backgroundColor: scriptoriumTheme.frostPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: scriptoriumTheme.goldBorder,
    padding: 14,
    gap: 4,
  },
  rowPressed: { borderColor: scriptoriumTheme.goldBorderStrong },
  rowDisabled: { opacity: 0.55 },
  rowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    color: scriptoriumTheme.textCream,
    fontSize: 17,
    fontWeight: "600",
  },
  badgeFailed: {
    backgroundColor: "rgba(178, 30, 30, 0.25)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeFailedText: {
    color: "#f5a8a8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  rowMeta: { color: scriptoriumTheme.goldMuted, fontSize: 14 },
  rowSubMeta: { color: scriptoriumTheme.textCreamSoft, fontSize: 13 },
  rowFile: {
    color: "rgba(255,253,244,0.45)",
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
  },
  rowAction: {
    color: scriptoriumTheme.gold,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
});
