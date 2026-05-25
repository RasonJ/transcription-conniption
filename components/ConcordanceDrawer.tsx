import type { ConcordanceIndex, WordOccurrence } from "@/constants/manuscript";
import { getConcordanceEntriesSorted } from "@/utils/concordance";
import { Search, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type ConcordanceEntry = { lemma: string; count: number; occurrences: WordOccurrence[] };

type Props = {
  visible: boolean;
  onClose: () => void;
  concordance: ConcordanceIndex;
  onSelectOccurrence: (occurrence: WordOccurrence) => void;
};

const ConcordanceEntryRow = React.memo(
  ({
    entry,
    expanded,
    onToggle,
    onSelectOccurrence,
    onClose,
  }: {
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
              >
                <Text style={styles.kwicMeta}>
                  [fol. {occ.folioId}]{occ.lineNumber ? ` · line ${occ.lineNumber}` : ""}
                </Text>
                <Text style={styles.kwicLine} numberOfLines={2}>
                  <Text style={styles.kwicPre}>{occ.preContext} </Text>
                  <Text style={styles.kwicHit}>{occ.keyword}</Text>
                  <Text style={styles.kwicPost}> {occ.postContext}</Text>
                </Text>
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
    prevProps.entry.count === nextProps.entry.count,
);

ConcordanceEntryRow.displayName = "ConcordanceEntryRow";

export function ConcordanceDrawer({ visible, onClose, concordance, onSelectOccurrence }: Props) {
  const [query, setQuery] = useState("");
  const [expandedLemma, setExpandedLemma] = useState<string | null>(null);

  const entries = useMemo(() => getConcordanceEntriesSorted(concordance), [concordance]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.lemma.includes(q));
  }, [entries, query]);

  const renderItem = useCallback(
    ({ item }: { item: ConcordanceEntry }) => (
      <ConcordanceEntryRow
        entry={item}
        expanded={expandedLemma === item.lemma}
        onToggle={() => setExpandedLemma((prev) => (prev === item.lemma ? null : item.lemma))}
        onSelectOccurrence={onSelectOccurrence}
        onClose={onClose}
      />
    ),
    [expandedLemma, onSelectOccurrence, onClose],
  );

  const keyExtractor = useCallback((item: ConcordanceEntry) => item.lemma, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>KWIC Concordance</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close concordance"
            >
              <X color="#f6d890" size={22} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Search color="#99836a" size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Filter lemmas…"
              placeholderTextColor="#99836a"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <Text style={styles.hint}>
            {entries.length.toLocaleString()} indexed terms · showing {filtered.length.toLocaleString()}
            {query.trim() ? " matches" : ""}. Tap an occurrence to jump to the leaf.
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
              <Text style={styles.emptyList}>No lemmas match this filter.</Text>
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
  kwicLine: { fontSize: 13, lineHeight: 20, color: "#dfcba5" },
  kwicPre: { color: "rgba(223,203,165,0.7)" },
  kwicHit: { color: "#f6d890", fontWeight: "800", backgroundColor: "rgba(155,34,23,0.35)" },
  kwicPost: { color: "rgba(223,203,165,0.7)" },
});
