import type { ParsedManuscript, WordOccurrence } from "@/constants/manuscript";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { useLemmaDictionary } from "@/hooks/useLemmaDictionary";
import { foldForSearch } from "@/utils/witnessLanguage";
import { formatNumber, useLocale, useT } from "@/i18n/runtime";
import {
  formatConcordanceMethodLine,
  getConcordanceBuildForManuscript,
  getConcordanceEntriesSorted,
} from "@/utils/concordance";
import { concordanceToCsv } from "@/utils/concordanceExport";
import { Search, X } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";

type ConcordanceEntry = { lemma: string; count: number; occurrences: WordOccurrence[] };

type Props = {
  visible: boolean;
  onClose: () => void;
  parsed: ParsedManuscript;
  sourceText?: string;
  onSelectOccurrence: (occurrence: WordOccurrence) => void;
};

const ConcordanceEntryRow = React.memo(
  ({
    entry,
    expanded,
    onToggle,
    onSelectOccurrence,
    onClose,
    t,
  }: {
    t: ReturnType<typeof useT>;
    entry: ConcordanceEntry;
    expanded: boolean;
    onToggle: () => void;
    onSelectOccurrence: (occurrence: WordOccurrence) => void;
    onClose: () => void;
  }) => {
    return (
      <View style={styles.entry}>
        <Pressable onPress={onToggle} style={styles.entryHeader} accessibilityRole="button" accessibilityState={{ expanded }}>
          <Text style={styles.lemma}>{entry.lemma}</Text>
          <Text style={styles.count}>{entry.count}</Text>
        </Pressable>
        {expanded ? (
          <View style={styles.occurrencesContainer}>
            {entry.occurrences.map((occ, idx) => (
              <Pressable
                key={`${occ.folioId}-${occ.lineNumber}-${idx}`}
                onPress={() => {
                  onSelectOccurrence(occ);
                  onClose();
                }}
                style={styles.kwicRow}
                accessibilityRole="button"
                accessibilityLabel={
                  occ.lineNumber
                    ? t("concordance.occurrence.folioLine", { folio: occ.folioId, line: occ.lineNumber })
                    : t("concordance.occurrence.folio", { folio: occ.folioId })
                }
              >
                <Text style={styles.kwicMeta}>
                  {occ.lineNumber
                    ? t("concordance.occurrence.folioLine", { folio: occ.folioId, line: occ.lineNumber })
                    : t("concordance.occurrence.folio", { folio: occ.folioId })}
                </Text>
                <View style={styles.kwicColumns}>
                  <Text style={styles.kwicPre} numberOfLines={2}>{occ.preContext}</Text>
                  <Text style={styles.kwicHit}>{occ.keyword}</Text>
                  <Text style={styles.kwicPost} numberOfLines={2}>{occ.postContext}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.entry.lemma === nextProps.entry.lemma &&
    prevProps.expanded === nextProps.expanded &&
    prevProps.entry.count === nextProps.entry.count &&
    prevProps.t === nextProps.t &&
    prevProps.onSelectOccurrence === nextProps.onSelectOccurrence &&
    prevProps.onClose === nextProps.onClose,
);

ConcordanceEntryRow.displayName = "ConcordanceEntryRow";

const TITLE_ID = "concordance-drawer-title";

export function ConcordanceDrawer({ visible, onClose, parsed, sourceText, onSelectOccurrence }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [expandedLemma, setExpandedLemma] = useState<string | null>(null);

  useDialogFocusTrap({
    active: visible,
    onClose,
    titleId: TITLE_ID,
    dialogId: "concordance-dialog",
  });

  const lemmas = useLemmaDictionary(visible);
  const concordanceCache = useRef<{
    parsed: ParsedManuscript;
    sourceText: string | undefined;
    generation: number;
    build: ReturnType<typeof getConcordanceBuildForManuscript>;
  } | null>(null);
  const build = useMemo(() => {
    const hit = concordanceCache.current;
    if (
      hit &&
      hit.parsed === parsed &&
      hit.sourceText === sourceText &&
      hit.generation === lemmas.generation
    ) {
      return hit.build;
    }
    // Closed drawer keeps the last index so the slide-out is not an empty list
    // and a later reopen does not rebuild unless the witness actually changed.
    if (!visible && hit) return hit.build;
    const next = getConcordanceBuildForManuscript(parsed, sourceText);
    concordanceCache.current = { parsed, sourceText, generation: lemmas.generation, build: next };
    return next;
  }, [visible, parsed, sourceText, lemmas.generation]);
  const concordance = build.index;
  const methodLine = build.meta ? formatConcordanceMethodLine(build.meta) : "";
  const entries = useMemo(() => getConcordanceEntriesSorted(concordance), [concordance]);
  const filtered = useMemo(() => {
    // Accent-insensitive: "rubricas" matches "rúbricas" (SPEC-I18N §8).
    const q = foldForSearch(query.trim());
    if (!q) return entries;
    return entries.filter((e) => foldForSearch(e.lemma).includes(q));
  }, [entries, query]);

  const toggleLemma = useCallback((lemma: string) => {
    setExpandedLemma((prev) => (prev === lemma ? null : lemma));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ConcordanceEntry }) => (
      <ConcordanceEntryRow
        entry={item}
        expanded={expandedLemma === item.lemma}
        onToggle={() => toggleLemma(item.lemma)}
        onSelectOccurrence={onSelectOccurrence}
        onClose={onClose}
        t={t}
      />
    ),
    [expandedLemma, onSelectOccurrence, onClose, t, toggleLemma],
  );

  const keyExtractor = useCallback(
    (item: ConcordanceEntry, index: number) => `${item.lemma}_${item.count}_${index}`,
    [],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel} accessibilityViewIsModal nativeID="concordance-dialog">
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
              {t("concordance.title")}
            </Text>
            <Pressable
              onPress={() => {
                const csv = concordanceToCsv(concordance, methodLine);
                void Share.share({ message: csv });
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.exportCsv")}
            >
              <Text style={styles.count}>{t("concordance.exportCsv")}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.closeLabel")}
            >
              <X color="#f6d890" size={22} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Search color="#99836a" size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("concordance.filterPlaceholder")}
              placeholderTextColor="#99836a"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {lemmas.loading ? (
            <Text style={styles.hint}>{t("concordance.lemmatizing")}</Text>
          ) : null}

          {methodLine ? <Text style={styles.method}>{methodLine}</Text> : null}

          <Text style={styles.hint}>
            {t(query.trim() ? "concordance.summaryFiltered" : "concordance.summary", {
              total: formatNumber(entries.length, undefined, locale),
              shown: formatNumber(filtered.length, undefined, locale),
            })}
          </Text>

          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            maxToRenderPerBatch={15}
            windowSize={5}
            initialNumToRender={20}
            removeClippedSubviews
            ListEmptyComponent={
              <Text style={styles.emptyList}>{t("concordance.empty")}</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  panel: {
    maxHeight: "82%",
    minHeight: "50%",
    backgroundColor: "#2a100b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#f6d890", fontSize: 18, fontWeight: "900" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(244,235,208,0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: "#fff4d2", fontSize: 15, paddingVertical: 10 },
  hint: { color: "rgba(246,216,144,0.65)", fontSize: 12, marginBottom: 10 },
  method: {
    color: "#f6d890",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  list: { flex: 1 },
  emptyList: { color: "#99836a", textAlign: "center", paddingVertical: 24, fontStyle: "italic" },
  entry: { borderBottomWidth: 1, borderBottomColor: "rgba(246,216,144,0.12)", paddingVertical: 6 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  lemma: { color: "#fff4d2", fontSize: 16, fontWeight: "700" },
  count: { color: "#f6d890", fontWeight: "800" },
  occurrencesContainer: { paddingVertical: 4, gap: 4 },
  kwicRow: {
    paddingVertical: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#9b2217",
    marginBottom: 2,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 4,
  },
  kwicMeta: { fontSize: 10, color: "#99836a", marginBottom: 4, fontWeight: "700", fontFamily: "monospace" },
  kwicColumns: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  kwicPre: { flex: 1, color: "rgba(223,203,165,0.7)", fontSize: 13, textAlign: "right" },
  kwicHit: { color: "#f6d890", fontWeight: "800", fontSize: 13 },
  kwicPost: { flex: 1, color: "rgba(223,203,165,0.7)", fontSize: 13 },
});
