import type { ParsedManuscript, WordOccurrence } from "@/constants/manuscript";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { useLemmaDictionary } from "@/hooks/useLemmaDictionary";
import { detectWitnessLanguage, foldForSearch } from "@/utils/witnessLanguage";
import { loadCorpusTfidf } from "@/utils/librarySidecars";
import type { CorpusTfidf } from "@/utils/corpusPrecompute";
import { formatNumber, useLocale, useT } from "@/i18n/runtime";
import {
  formatConcordanceMethodLine,
  getConcordanceBuildForManuscript,
  getConcordanceEntriesSorted,
} from "@/utils/concordance";
import { concordanceToCsv } from "@/utils/concordanceExport";
import {
  compareConcordanceEntries,
  formatRelativeImportance,
  initialSortDirection,
  nextTranslationLang,
  relativeImportance,
  resolveLemmaTranslation,
  translationLangForLocale,
  type ConcordanceSortColumn,
  type ConcordanceSortDirection,
  type TranslationLang,
} from "@/utils/concordanceView";
import { ArrowDown, ArrowUp, ArrowUpDown, Globe, Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";

type ConcordanceEntry = {
  lemma: string;
  count: number;
  occurrences: WordOccurrence[];
  variants?: Record<string, number>;
};

type EnrichedEntry = ConcordanceEntry & {
  mostCommonForm: string;
  translation: string;
  tfidf: number;
};

/** Most frequent diplomatic surface form stored on the entry, else the keyword sample. */
function getMostCommonForm(entry: ConcordanceEntry): string {
  const variants = entry.variants;
  if (variants) {
    let top = "";
    let max = 0;
    for (const form of Object.keys(variants)) {
      const count = variants[form] ?? 0;
      if (count > max || (count === max && (top === "" || form.localeCompare(top) < 0))) {
        max = count;
        top = form;
      }
    }
    if (top) return top;
  }
  return entry.occurrences[0]?.keyword ?? "";
}

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
    mostCommonForm,
    translation,
    tfidf,
    expanded,
    onToggle,
    onSelectOccurrence,
    onClose,
    t,
  }: {
    t: ReturnType<typeof useT>;
    entry: ConcordanceEntry;
    mostCommonForm: string;
    translation: string;
    tfidf: number;
    expanded: boolean;
    onToggle: () => void;
    onSelectOccurrence: (occurrence: WordOccurrence) => void;
    onClose: () => void;
  }) => {
    return (
      <View style={styles.entry}>
        <Pressable
          onPress={onToggle}
          style={styles.entryHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.colLemma} numberOfLines={1}>
            {entry.lemma}
          </Text>
          <Text style={styles.colForm} numberOfLines={1}>
            {mostCommonForm}
          </Text>
          <Text style={styles.colTranslation} numberOfLines={1}>
            {translation}
          </Text>
          <Text style={styles.colTfidf} numberOfLines={1}>
            {formatRelativeImportance(tfidf)}
          </Text>
          <Text style={styles.colCount}>{entry.count}</Text>
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
                  <Text style={styles.kwicPre} numberOfLines={2}>
                    {occ.preContext}
                  </Text>
                  <Text style={styles.kwicHit}>{occ.keyword}</Text>
                  <Text style={styles.kwicPost} numberOfLines={2}>
                    {occ.postContext}
                  </Text>
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
    prevProps.mostCommonForm === nextProps.mostCommonForm &&
    prevProps.translation === nextProps.translation &&
    prevProps.tfidf === nextProps.tfidf &&
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
  const [sortColumn, setSortColumn] = useState<ConcordanceSortColumn>("default");
  const [sortDirection, setSortDirection] = useState<ConcordanceSortDirection>("desc");
  const defaultTransLang = useMemo(() => translationLangForLocale(locale), [locale]);
  const [transLang, setTransLang] = useState<TranslationLang>(defaultTransLang);
  const [corpusIdf, setCorpusIdf] = useState<CorpusTfidf | null>(null);

  useEffect(() => {
    setTransLang(defaultTransLang);
  }, [defaultTransLang]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadCorpusTfidf().then((next) => {
      if (!cancelled) setCorpusIdf(next);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const witnessLanguage = useMemo(
    () => (sourceText ? detectWitnessLanguage(sourceText).language : undefined),
    [sourceText],
  );

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
  const totalDocWords = useMemo(
    () => parsed.stats.totalWords || entries.reduce((acc, entry) => acc + entry.count, 0) || 1,
    [parsed.stats.totalWords, entries],
  );
  const enrichedEntries = useMemo<EnrichedEntry[]>(
    () =>
      entries.map((entry) => {
        const mostCommonForm = getMostCommonForm(entry);
        return {
          ...entry,
          mostCommonForm,
          translation: resolveLemmaTranslation(entry.lemma, transLang),
          tfidf: relativeImportance(
            entry.count,
            totalDocWords,
            corpusIdf,
            entry.lemma,
            mostCommonForm,
            witnessLanguage,
          ),
        };
      }),
    [entries, totalDocWords, transLang, corpusIdf, witnessLanguage],
  );
  const filtered = useMemo(() => {
    // Accent-insensitive: "rubricas" matches "rúbricas" (SPEC-I18N §8).
    const q = foldForSearch(query.trim());
    const list = q
      ? enrichedEntries.filter(
          (entry) =>
            foldForSearch(entry.lemma).includes(q) ||
            foldForSearch(entry.mostCommonForm).includes(q) ||
            foldForSearch(entry.translation).includes(q),
        )
      : enrichedEntries;
    return [...list].sort((a, b) => compareConcordanceEntries(a, b, sortColumn, sortDirection, locale));
  }, [enrichedEntries, query, sortColumn, sortDirection, locale]);

  const toggleSort = useCallback(
    (column: Exclude<ConcordanceSortColumn, "default">) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setSortColumn(column);
      setSortDirection(initialSortDirection(column));
    },
    [sortColumn],
  );

  const cycleTranslationLanguage = useCallback(() => {
    setTransLang((prev) => nextTranslationLang(prev));
  }, []);

  const toggleLemma = useCallback((lemma: string) => {
    setExpandedLemma((prev) => (prev === lemma ? null : lemma));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: EnrichedEntry }) => (
      <ConcordanceEntryRow
        entry={item}
        mostCommonForm={item.mostCommonForm}
        translation={item.translation}
        tfidf={item.tfidf}
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

  const renderSortIcon = (col: Exclude<ConcordanceSortColumn, "default">) => {
    if (sortColumn !== col) {
      return <ArrowUpDown color="rgba(246,216,144,0.4)" size={12} />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp color="#f6d890" size={12} />
    ) : (
      <ArrowDown color="#f6d890" size={12} />
    );
  };

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
              <Text style={styles.exportText}>{t("concordance.exportCsv")}</Text>
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

          <View style={styles.tableHeader}>
            <Pressable
              style={styles.colLemmaHeader}
              onPress={() => toggleSort("lemma")}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.sortBy", { column: t("concordance.column.lemma") })}
            >
              <Text style={[styles.headerLabel, sortColumn === "lemma" && styles.activeHeader]} numberOfLines={1}>
                {t("concordance.column.lemma")}
              </Text>
              {renderSortIcon("lemma")}
            </Pressable>
            <Pressable
              style={styles.colFormHeader}
              onPress={() => toggleSort("mostCommon")}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.sortBy", { column: t("concordance.column.form") })}
            >
              <Text style={[styles.headerLabel, sortColumn === "mostCommon" && styles.activeHeader]} numberOfLines={1}>
                {t("concordance.column.form")}
              </Text>
              {renderSortIcon("mostCommon")}
            </Pressable>
            <View style={styles.colTranslationHeader}>
              <Pressable
                style={styles.transSortBtn}
                onPress={() => toggleSort("translation")}
                accessibilityRole="button"
                accessibilityLabel={t("concordance.sortBy", { column: t("concordance.column.translation") })}
              >
                <Text
                  style={[styles.headerLabel, sortColumn === "translation" && styles.activeHeader]}
                  numberOfLines={1}
                >
                  {t("concordance.column.translation")}
                </Text>
                {renderSortIcon("translation")}
              </Pressable>
              <Pressable
                style={styles.langPill}
                onPress={cycleTranslationLanguage}
                accessibilityRole="button"
                accessibilityLabel={t("concordance.switchTranslationLang", { lang: transLang.toUpperCase() })}
              >
                <Globe color="#f6d890" size={10} />
                <Text style={styles.langPillText}>{transLang.toUpperCase()}</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.colTfidfHeader}
              onPress={() => toggleSort("tfidf")}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.sortBy", { column: t("concordance.column.importance") })}
            >
              <Text
                style={[
                  styles.headerLabel,
                  styles.importanceLabel,
                  (sortColumn === "tfidf" || sortColumn === "default") && styles.activeHeader,
                ]}
                numberOfLines={2}
              >
                {t("concordance.column.importance")}
              </Text>
              {renderSortIcon("tfidf")}
            </Pressable>
            <Pressable
              style={styles.colCountHeader}
              onPress={() => toggleSort("count")}
              accessibilityRole="button"
              accessibilityLabel={t("concordance.sortBy", { column: t("concordance.column.count") })}
            >
              <Text style={[styles.headerLabel, sortColumn === "count" && styles.activeHeader]} numberOfLines={1}>
                {t("concordance.column.count")}
              </Text>
              {renderSortIcon("count")}
            </Pressable>
          </View>

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
            ListEmptyComponent={<Text style={styles.emptyList}>{t("concordance.empty")}</Text>}
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
  title: { color: "#f6d890", fontSize: 18, fontWeight: "900", flex: 1 },
  exportText: { color: "#f6d890", fontWeight: "800", fontSize: 13 },
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
  hint: { color: "rgba(246,216,144,0.65)", fontSize: 12, marginBottom: 8 },
  method: {
    color: "#f6d890",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingRight: 28,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246,216,144,0.3)",
    marginBottom: 4,
  },
  colLemmaHeader: { flex: 1.1, flexDirection: "row", alignItems: "center", gap: 4 },
  colFormHeader: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  colTranslationHeader: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 6,
  },
  transSortBtn: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(246,216,144,0.18)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.35)",
  },
  langPillText: { color: "#f6d890", fontSize: 10, fontWeight: "900" },
  colTfidfHeader: {
    width: 108,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  colCountHeader: {
    width: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(246,216,144,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  importanceLabel: { flexShrink: 1, textAlign: "right", fontSize: 10, letterSpacing: 0.2 },
  activeHeader: { color: "#f6d890" },
  list: { flex: 1, paddingRight: 4 },
  emptyList: { color: "#99836a", textAlign: "center", paddingVertical: 24, fontStyle: "italic" },
  entry: { borderBottomWidth: 1, borderBottomColor: "rgba(246,216,144,0.12)", paddingVertical: 6 },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingRight: 24,
  },
  colLemma: {
    flex: 1.1,
    color: "#fff4d2",
    fontSize: 15,
    fontWeight: "700",
    paddingRight: 6,
  },
  colForm: {
    flex: 1,
    color: "#c8995f",
    fontSize: 14,
    fontStyle: "italic",
    paddingRight: 6,
  },
  colTranslation: {
    flex: 1.2,
    color: "#7ba4cc",
    fontSize: 14,
    paddingRight: 6,
  },
  colTfidf: {
    width: 108,
    color: "#a8d4a0",
    fontSize: 13,
    fontFamily: "monospace",
    textAlign: "right",
    paddingRight: 8,
  },
  colCount: {
    width: 56,
    color: "#f6d890",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "right",
    fontFamily: "monospace",
  },
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
