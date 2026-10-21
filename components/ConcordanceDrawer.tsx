import type { ParsedManuscript, WordOccurrence } from "@/constants/manuscript";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { useLemmaDictionary } from "@/hooks/useLemmaDictionary";
import { detectWitnessLanguage, foldForSearch } from "@/utils/witnessLanguage";
import { loadCorpusTfidf, loadUploadCorpusStats, loadUploadCorpusTfidf } from "@/utils/librarySidecars";
import { concordanceIndexTfidf, indexLangForWitness } from "@/utils/manuscriptTfidf";
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
  contextTokenSalient,
  formatRelativeImportance,
  getMostCommonForm,
  getSortedOccurrences,
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
import {
  FlatList,
  InteractionManager,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  foldedLemma: string;
  foldedForm: string;
  foldedTranslation: string;
};

function KwicContext({
  text,
  query,
  idfTable,
  lang,
  style,
}: {
  text: string;
  query: string;
  idfTable: Record<string, number> | null;
  lang: string;
  style: object;
}) {
  const parts = text.split(/(\s+)/);
  return (
    <Text style={style} numberOfLines={2}>
      {parts.map((part, index) => {
        if (!part || /^\s+$/.test(part)) return part;
        if (!contextTokenSalient(part, query, idfTable, lang)) return part;
        return (
          <Text key={`${part}_${index}`} style={styles.kwicSalient}>
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  parsed: ParsedManuscript;
  sourceText?: string;
  onSelectOccurrence: (occurrence: WordOccurrence) => void;
  onFilterQueryChange?: (query: string) => void;
};

const ConcordanceEntryRow = React.memo(
  ({
    entry,
    mostCommonForm,
    translation,
    tfidf,
    expanded,
    onToggleLemma,
    onSelectOccurrence,
    onClose,
    idfTable,
    lang,
    query,
    t,
  }: {
    t: ReturnType<typeof useT>;
    entry: ConcordanceEntry;
    mostCommonForm: string;
    translation: string;
    tfidf: number;
    expanded: boolean;
    onToggleLemma: (lemma: string) => void;
    onSelectOccurrence: (occurrence: WordOccurrence) => void;
    onClose: () => void;
    idfTable: Record<string, number> | null;
    lang: string;
    query: string;
  }) => {
    const sortedOccurrences = useMemo(
      () => (expanded ? getSortedOccurrences(entry.occurrences, idfTable, lang, query) : entry.occurrences),
      [expanded, entry.occurrences, idfTable, lang, query],
    );
    return (
      <View style={styles.entry}>
        <Pressable
          onPress={() => onToggleLemma(entry.lemma)}
          style={styles.entryHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityHint={t("concordance.expandHint")}
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
            {sortedOccurrences.map((occ, idx) => (
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
                  <KwicContext
                    text={occ.preContext}
                    query={query}
                    idfTable={idfTable}
                    lang={lang}
                    style={styles.kwicPre}
                  />
                  <Text style={query && foldForSearch(occ.keyword) === foldForSearch(query) ? styles.kwicHitHighlight : styles.kwicHit}>
                    {occ.keyword}
                  </Text>
                  <KwicContext
                    text={occ.postContext}
                    query={query}
                    idfTable={idfTable}
                    lang={lang}
                    style={styles.kwicPost}
                  />
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
    prevProps.idfTable === nextProps.idfTable &&
    prevProps.lang === nextProps.lang &&
    prevProps.query === nextProps.query &&
    prevProps.t === nextProps.t &&
    prevProps.onToggleLemma === nextProps.onToggleLemma &&
    prevProps.onSelectOccurrence === nextProps.onSelectOccurrence &&
    prevProps.onClose === nextProps.onClose,
);

ConcordanceEntryRow.displayName = "ConcordanceEntryRow";

const TITLE_ID = "concordance-drawer-title";
const EMPTY_CONCORDANCE = {} as NonNullable<
  ReturnType<typeof getConcordanceBuildForManuscript>["index"]
>;

export function ConcordanceDrawer({
  visible,
  onClose,
  parsed,
  sourceText,
  onSelectOccurrence,
  onFilterQueryChange,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  useEffect(() => {
    onFilterQueryChange?.(query);
  }, [query, onFilterQueryChange]);
  const [expandedLemma, setExpandedLemma] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<ConcordanceSortColumn>("default");
  const [sortDirection, setSortDirection] = useState<ConcordanceSortDirection>("desc");
  const defaultTransLang = useMemo(() => translationLangForLocale(locale), [locale]);
  const [transLang, setTransLang] = useState<TranslationLang>(defaultTransLang);
  const [corpusIdf, setCorpusIdf] = useState<CorpusTfidf | null>(null);
  const [uploadIdf, setUploadIdf] = useState<Record<string, number> | null>(null);
  const [uploadDocs, setUploadDocs] = useState(1);

  useEffect(() => {
    setTransLang(defaultTransLang);
  }, [defaultTransLang]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadCorpusTfidf().then((next) => {
      if (!cancelled) setCorpusIdf(next);
    });
    void Promise.all([loadUploadCorpusTfidf(), loadUploadCorpusStats()]).then(([idf, stats]) => {
      if (cancelled) return;
      setUploadIdf(idf);
      setUploadDocs(stats?.totalDocuments ?? 1);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const witnessLanguage = useMemo(() => detectWitnessLanguage(parsed).language, [parsed]);
  const indexLang = indexLangForWitness(witnessLanguage);

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
  const [build, setBuild] = useState<ReturnType<typeof getConcordanceBuildForManuscript> | null>(null);

  // Rebuild after the drawer slide finishes so lemmatization does not block the animation.
  // A cached index for this witness is reused immediately, including while the drawer is closed.
  useEffect(() => {
    const hit = concordanceCache.current;
    if (
      hit &&
      hit.parsed === parsed &&
      hit.sourceText === sourceText &&
      hit.generation === lemmas.generation
    ) {
      setBuild(hit.build);
      return;
    }
    if (!visible) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const next = getConcordanceBuildForManuscript(parsed, sourceText);
      concordanceCache.current = { parsed, sourceText, generation: lemmas.generation, build: next };
      setBuild(next);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [visible, parsed, sourceText, lemmas.generation]);

  const concordance = build?.index ?? EMPTY_CONCORDANCE;
  const methodLine = build?.meta ? formatConcordanceMethodLine(build.meta) : "";
  const entries = useMemo(() => getConcordanceEntriesSorted(concordance), [concordance]);
  const totalDocWords = useMemo(
    () => parsed.stats.totalWords || entries.reduce((acc, entry) => acc + entry.count, 0) || 1,
    [parsed.stats.totalWords, entries],
  );
  const enrichedEntries = useMemo<EnrichedEntry[]>(
    () =>
      entries.map((entry) => {
        const mostCommonForm = getMostCommonForm(entry);
        const translation = resolveLemmaTranslation(entry.lemma, transLang);
        return {
          ...entry,
          mostCommonForm,
          translation,
          foldedLemma: foldForSearch(entry.lemma),
          foldedForm: foldForSearch(mostCommonForm),
          foldedTranslation: foldForSearch(translation),
          tfidf: uploadIdf
            ? concordanceIndexTfidf(entry.count, entry.lemma, mostCommonForm, uploadIdf, indexLang, uploadDocs)
            : relativeImportance(
                entry.count,
                totalDocWords,
                corpusIdf,
                entry.lemma,
                mostCommonForm,
                witnessLanguage,
              ),
        };
      }),
    [entries, totalDocWords, transLang, corpusIdf, witnessLanguage, uploadIdf, uploadDocs, indexLang],
  );
  const idfTable = uploadIdf ?? corpusIdf?.idf ?? null;
  const filtered = useMemo(() => {
    // Accent-insensitive: "rubricas" matches "rúbricas" (SPEC-I18N §8).
    const q = foldForSearch(query.trim());
    const list = q
      ? enrichedEntries.filter(
          (entry) =>
            entry.foldedLemma.includes(q) ||
            entry.foldedForm.includes(q) ||
            entry.foldedTranslation.includes(q),
        )
      : enrichedEntries;
    return [...list].sort((a, b) => compareConcordanceEntries(a, b, sortColumn, sortDirection, locale, query));
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
        onToggleLemma={toggleLemma}
        onSelectOccurrence={onSelectOccurrence}
        onClose={onClose}
        idfTable={idfTable}
        lang={indexLang}
        query={query}
        t={t}
      />
    ),
    [expandedLemma, onSelectOccurrence, onClose, t, toggleLemma, idfTable, indexLang, query],
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
            extraData={{ query, expandedLemma }}
            accessibilityLabel={t("concordance.listLabel")}
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
  kwicHitHighlight: { color: "#fff4d2", fontWeight: "800", fontSize: 13 },
  kwicSalient: { color: "#fff4d2", fontWeight: "800" },
  kwicPost: { flex: 1, color: "rgba(223,203,165,0.7)", fontSize: 13 },
});
