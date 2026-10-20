import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { useLibraryCatalog } from "@/hooks/useLibraryCatalog";
import { useLemmaDictionary } from "@/hooks/useLemmaDictionary";
import { formatNumber, hasMessage, useLocale, useT } from "@/i18n/runtime";
import { isAzureAgentConfigured } from "@/services/azureAgentConfig";
import { askCopilot, runRecipeById } from "@/utils/copilot/ask";
import { getRecipe } from "@/utils/copilot/catalog";
import { buildFacetIndex, type FacetIndex } from "@/utils/copilot/facetIndex";
import {
  buildLibraryAwareRouterIndex,
  matchLibraryEntry,
} from "@/utils/copilot/libraryIntents";
import { loadPersistedOverview, persistOverview } from "@/utils/copilot/persistentOverview";
import { precomputeEager, type OverviewEntry } from "@/utils/copilot/precompute";
import { answerToDelimited, presentAnswer, presentChip } from "@/utils/copilot/present";
import { routingLocales } from "@/utils/copilot/router";
import { overviewFromPrecompiled } from "@/utils/copilot/sidecarRecipes";
import type { CopilotAnswer, EvidenceRow, EvidenceTier } from "@/utils/copilot/types";
import type { PrecompiledFacets } from "@/utils/corpusPrecompute";
import { loadPrecompiledFacets } from "@/utils/librarySidecars";
import { buildManuscriptVectorIndex } from "@/utils/manuscriptVectorIndex";
import { looksLikeTranscribeRequest } from "@/utils/visionUpload";
import { withFolioReview, type MachineTranscriptionMeta } from "@/utils/ingest/visionSidecar";
import { detectWitnessLanguage } from "@/utils/witnessLanguage";
import * as DocumentPicker from "expo-document-picker";
import { ArrowRight, BookOpen, Copy, Download, Image as ImageIcon, Search, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type { ManuscriptVectorIndex } from "@/utils/manuscriptVectorIndex";

type AttachedScan = {
  uri: string;
  name: string;
  mimeType?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Apply vision HSMS into the Studio parchment (and close the drawer). */
  onApplyHsms?: (
    hsms: string,
    meta: { sourceFileName: string; machineTranscription?: MachineTranscriptionMeta },
  ) => void;
};

export function ManuscriptChatbotDrawer({ visible, onClose, onApplyHsms }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const { parsedManuscript, activeFileName, workspace, debouncedText, setFolioReview } = useScriptorium();
  const { catalog } = useLibraryCatalog();
  const { navigateToAnchor } = useScrollAnchor();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [attachedScan, setAttachedScan] = useState<AttachedScan | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [precompiledFacets, setPrecompiledFacets] = useState<PrecompiledFacets | null>(null);
  const [copied, setCopied] = useState(false);
  /** undefined = still looking in the persisted store; null = nothing stored. */
  const [persistedOverview, setPersistedOverview] = useState<OverviewEntry[] | null | undefined>(undefined);
  // Lemma-based recipes (top lemmas, variant share) need the lazy dictionary (SPEC-LIGHTWEIGHT §4).
  useLemmaDictionary(visible);
  const [vectorIndex, setVectorIndex] = useState<ManuscriptVectorIndex | undefined>(undefined);
  const [libraryAwareRouter, setLibraryAwareRouter] = useState<
    ReturnType<typeof buildLibraryAwareRouterIndex> | undefined
  >(undefined);
  const liveFacetsRef = useRef<FacetIndex | null>(null);
  const visionAbortRef = useRef<AbortController | null>(null);

  const libraryHit = useMemo(
    () =>
      matchLibraryEntry(
        catalog,
        activeFileName ?? workspace?.sourceFileName,
        parsedManuscript.metadata.title,
      ),
    [catalog, activeFileName, workspace?.sourceFileName, parsedManuscript.metadata.title],
  );

  // Prefer batch facet sidecars — avoid rebuilding FacetIndex when the drawer opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPrecompiledFacets(null);
    liveFacetsRef.current = null;

    const baseName = libraryHit?.baseName;
    if (!baseName) return;

    void loadPrecompiledFacets(baseName).then((facets) => {
      if (!cancelled && facets) setPrecompiledFacets(facets);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, libraryHit?.baseName, parsedManuscript]);

  // Defer heavy index builds until the drawer slide animation finishes (60 FPS).
  useEffect(() => {
    if (!visible) {
      setVectorIndex(undefined);
      setLibraryAwareRouter(undefined);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      setVectorIndex(buildManuscriptVectorIndex(parsedManuscript));
      // Route over the UI locale ∪ English ∪ the witness language (SPEC-COPILOT §8.1).
      const witness = detectWitnessLanguage(parsedManuscript).language;
      setLibraryAwareRouter(buildLibraryAwareRouterIndex(catalog, routingLocales(locale, witness)));
    });
    return () => {
      task.cancel();
    };
  }, [visible, parsedManuscript, catalog, locale]);

  // Cancel in-flight vision OCR when the drawer closes or unmounts.
  useEffect(() => {
    if (visible) return;
    visionAbortRef.current?.abort();
    visionAbortRef.current = null;
  }, [visible]);

  useEffect(() => {
    return () => {
      visionAbortRef.current?.abort();
      visionAbortRef.current = null;
    };
  }, []);

  const resolveLiveFacets = useCallback((): FacetIndex => {
    if (liveFacetsRef.current) return liveFacetsRef.current;
    const built = buildFacetIndex(parsedManuscript);
    liveFacetsRef.current = built;
    return built;
  }, [parsedManuscript]);

  const witnessLanguage = useMemo(
    () => (visible ? detectWitnessLanguage(parsedManuscript).language : undefined),
    [visible, parsedManuscript],
  );

  // Overview answers persisted across sessions (SPEC-COPILOT §7.2): no FacetIndex rebuild on reopen.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPersistedOverview(undefined);
    void loadPersistedOverview(debouncedText ?? "").then((entries) => {
      if (!cancelled) setPersistedOverview(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, debouncedText]);

  const overview = useMemo(() => {
    if (!visible) return [];
    if (precompiledFacets) return overviewFromPrecompiled(precompiledFacets);
    if (persistedOverview === undefined) return [];
    if (persistedOverview) return persistedOverview;
    // Non-library witnesses: build once for overview chips, then persist.
    const computed = precomputeEager(parsedManuscript, resolveLiveFacets())
      .filter((entry) => entry.count > 0)
      .sort((a, b) => a.chipLabel.localeCompare(b.chipLabel));
    void persistOverview(debouncedText ?? "", computed);
    return computed;
  }, [visible, precompiledFacets, persistedOverview, parsedManuscript, resolveLiveFacets, debouncedText]);

  const askOptions = useMemo(
    () => ({
      precompiledFacets: precompiledFacets ?? undefined,
      resolveFacets: resolveLiveFacets,
      vectorIndex,
      router: libraryAwareRouter,
      witnessLanguage,
      sidecar: workspace?.facsSidecar,
    }),
    [precompiledFacets, resolveLiveFacets, vectorIndex, libraryAwareRouter, witnessLanguage, workspace?.facsSidecar],
  );

  const fmt = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, options, locale),
    [locale],
  );
  const tAny = t as unknown as (key: string, params?: Record<string, string | number>) => string;
  const presented = useMemo(
    () => (answer ? presentAnswer(answer, tAny, hasMessage, fmt) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answer, t, fmt],
  );
  const chipLabelFor = useCallback(
    (recipeId: string, fallback: string) => {
      const recipe = getRecipe(recipeId);
      return recipe ? presentChip(recipe, tAny, hasMessage) : fallback;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const handleCopyDsl = useCallback(async () => {
    if (!answer?.dsl) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(answer.dsl);
      } else {
        await Share.share({ message: answer.dsl });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the expression stays visible on the card */
    }
  }, [answer]);

  const handleExport = useCallback(
    async (sep: "," | "\t") => {
      if (!answer || !presented) return;
      try {
        const body = answerToDelimited(answer, presented, t("copilot.export.header"), sep);
        const ext = sep === "," ? "csv" : "tsv";
        const { saveExportFile } = await import("@/utils/exportFile");
        await saveExportFile(body, {
          fileName: `${answer.recipeId}.${ext}`,
          mimeType: sep === "," ? "text/csv" : "text/tab-separated-values",
        });
      } catch (err) {
        console.warn("Copilot export failed", err);
      }
    },
    [answer, presented, t],
  );

  const handleAttachScan = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setAttachedScan({
        uri: asset.uri,
        name: asset.name ?? "page_scan.png",
        mimeType:
          asset.mimeType ??
          (/\.pdf$/i.test(asset.name ?? "") ? "application/pdf" : undefined),
      });
      if (!query.trim()) {
        setQuery("transcribe this into hsms");
      }
    } catch (err) {
      console.warn("Attach scan failed", err);
    }
  }, [query]);

  const runVisionTranscribe = useCallback(async () => {
    if (!attachedScan) {
      setAnswer({
        recipeId: "transcription.vision_ocr",
        recipeVersion: 1,
        tier: "D",
        headline: t("copilot.visionNeedImage"),
        rows: [],
        method: "vision",
        elapsedMs: 0,
      });
      return;
    }
    if (!isAzureAgentConfigured()) {
      setAnswer({
        recipeId: "transcription.vision_ocr",
        recipeVersion: 1,
        tier: "D",
        headline: t("copilot.visionNeedAzure"),
        rows: [],
        method: "vision",
        elapsedMs: 0,
      });
      return;
    }

    setVisionBusy(true);
    visionAbortRef.current?.abort();
    const abort = new AbortController();
    visionAbortRef.current = abort;
    const t0 = Date.now();
    try {
      const { runHybridTranscriptionPipeline } = await import(
        "@/services/batchTranscriptionService"
      );
      const vision = await runHybridTranscriptionPipeline({
        uri: attachedScan.uri,
        name: attachedScan.name,
        mimeType: attachedScan.mimeType,
        languageHint: "POR",
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const outName =
        attachedScan.name.replace(/\.(pdf|png|jpe?g|webp|gif)$/i, "") + ".txt";
      const elapsedMs = Date.now() - t0;
      setAnswer({
        recipeId: "transcription.vision_ocr",
        recipeVersion: 1,
        tier: "D",
        headline: t("copilot.visionDone"),
        body: vision.hsmsAscii,
        breakdown: [
          { label: "pages", value: vision.pageCount, key: "pages" },
          { label: "errors", value: vision.errorCount, key: "errors" },
          { label: "warnings", value: vision.warningCount, key: "warnings" },
        ],
        rows: [],
        method: "Azure vision → ingestAgentTranscription",
        elapsedMs,
      });
      onApplyHsms?.(vision.hsmsAscii, {
        sourceFileName: outName,
        machineTranscription: {
          pages: vision.pages,
          sourceKind: attachedScan.mimeType === "application/pdf" ? "pdf" : "image",
          sourceName: attachedScan.name,
        },
      });
      setAttachedScan(null);
      setQuery("");
    } catch (err) {
      if (abort.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        return;
      }
      console.warn("Copilot vision transcription failed", err);
      setAnswer({
        recipeId: "transcription.vision_ocr",
        recipeVersion: 1,
        tier: "D",
        headline: err instanceof Error ? err.message : t("copilot.visionError"),
        rows: [],
        method: "vision",
        elapsedMs: Date.now() - t0,
      });
    } finally {
      // Seal this flight so a newer scan / unmount abort does not clear a successor controller.
      if (visionAbortRef.current === abort) {
        visionAbortRef.current = null;
      }
      setVisionBusy(false);
    }
  }, [attachedScan, onApplyHsms, t]);

  const handleAsk = useCallback(() => {
    const wantsVision =
      Boolean(attachedScan) ||
      (looksLikeTranscribeRequest(query) && /transcri|hsms|ocr|vision|scan/i.test(query));

    if (wantsVision) {
      void runVisionTranscribe();
      return;
    }

    if (!query.trim()) return;

    const result = askCopilot(query, parsedManuscript, askOptions);

    if (result.navigate) {
      navigateToAnchor(result.navigate);
      setAnswer(null);
      onClose();
      return;
    }
    setAnswer(result);
  }, [
    attachedScan,
    query,
    runVisionTranscribe,
    parsedManuscript,
    askOptions,
    navigateToAnchor,
    onClose,
  ]);

  const handleRecipe = useCallback(
    (recipeId: string) => {
      const result = runRecipeById(recipeId, parsedManuscript, askOptions);
      if (result) setAnswer(result);
    },
    [parsedManuscript, askOptions],
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

          {attachedScan ? (
            <View style={styles.attachChip}>
              <ImageIcon color="#f6d890" size={14} />
              <Text style={styles.attachChipText} numberOfLines={1}>
                {attachedScan.name}
              </Text>
              <Pressable
                onPress={() => setAttachedScan(null)}
                accessibilityRole="button"
                accessibilityLabel={t("copilot.clearImageLabel")}
                hitSlop={8}
              >
                <X color="#f6d890" size={14} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <Pressable
              onPress={() => {
                void handleAttachScan();
              }}
              style={styles.attachButton}
              accessibilityRole="button"
              accessibilityLabel={t("copilot.attachImageLabel")}
              disabled={visionBusy}
            >
              <ImageIcon color="#f6d890" size={16} />
            </Pressable>
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
              editable={!visionBusy}
            />
            <Pressable
              onPress={handleAsk}
              style={[styles.sendButton, visionBusy && styles.sendButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("copilot.searchLabel")}
              disabled={visionBusy}
            >
              {visionBusy ? (
                <ActivityIndicator size="small" color="#1a0a05" />
              ) : (
                <Search color="#1a0a05" size={16} />
              )}
            </Pressable>
          </View>
          {visionBusy ? <Text style={styles.visionBusy}>{t("copilot.visionBusy")}</Text> : null}

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
                      accessibilityLabel={`${chipLabelFor(entry.recipeId, entry.chipLabel)}: ${fmt(entry.count)}`}
                    >
                      <Text style={styles.chipLabel}>{chipLabelFor(entry.recipeId, entry.chipLabel)}</Text>
                      <Text style={styles.chipCount}>{fmt(entry.count)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {answer && presented ? (
              <View style={styles.answerCard} accessible accessibilityLabel={presented.accessibilityLabel}>
                <View style={styles.answerTop}>
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierBadgeText}>
                      {answer.tier} · {tierLabel(answer.tier)}
                    </Text>
                  </View>
                  {getRecipe(answer.recipeId)?.precision !== undefined ? (
                    <Text style={styles.confidence}>
                      {t("copilot.precision", {
                        pct: fmt(Math.round((getRecipe(answer.recipeId)?.precision ?? 0) * 100)),
                      })}
                    </Text>
                  ) : null}
                  {answer.confidence !== undefined && answer.confidence < 1 ? (
                    <Text style={styles.confidence}>{(answer.confidence * 100).toFixed(0)}%</Text>
                  ) : null}
                </View>
                <Text style={styles.headline}>{presented.headline}</Text>
                {presented.serverNote ? <Text style={styles.serverNote}>{presented.serverNote}</Text> : null}

                {answer.recipeId === "stats.term_frequency" && typeof answer.count === "number" ? (
                  <View style={styles.statBlock}>
                    <Text style={styles.statValue}>{fmt(answer.count)}</Text>
                    {typeof answer.params?.word === "string" ? (
                      <Text style={styles.statWord}>“{answer.params.word}”</Text>
                    ) : null}
                    {typeof answer.params?.word === "string" && answer.count > 0 ? (
                      <Pressable
                        onPress={() => {
                          const next = runRecipeById("search.kwic", parsedManuscript, {
                            ...askOptions,
                            params: { word: String(answer.params!.word) },
                          });
                          if (next) setAnswer(next);
                        }}
                        style={styles.actionButton}
                        accessibilityRole="button"
                        accessibilityLabel={t("copilot.action.openKwic")}
                      >
                        <Search color="#f6d890" size={12} />
                        <Text style={styles.actionText}>{t("copilot.action.openKwic")}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {answer.slotPrompt ? (
                  <View style={styles.slotPrompt}>
                    <Text style={styles.sectionLabel}>
                      {answer.slotPrompt === "lemma" ? t("copilot.slot.lemma") : t("copilot.slot.word")}
                    </Text>
                    <TextInput
                      placeholder={t("copilot.slot.placeholder")}
                      placeholderTextColor="#99836a"
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onSubmitEditing={(e) => {
                        const value = e.nativeEvent.text.trim();
                        if (!value) return;
                        const result = runRecipeById(answer.recipeId, parsedManuscript, {
                          ...askOptions,
                          params: { [answer.slotPrompt === "lemma" ? "lemma" : "word"]: value },
                        });
                        if (result) setAnswer(result);
                      }}
                    />
                  </View>
                ) : null}

                {answer.body ? (
                  <View style={styles.hsmsBlock}>
                    <Text style={styles.hsmsText} selectable>
                      {answer.body}
                    </Text>
                    {onApplyHsms ? (
                      <Pressable
                        onPress={() =>
                          onApplyHsms(answer.body!, {
                            sourceFileName: "vision_transcription.txt",
                          })
                        }
                        style={styles.applyButton}
                        accessibilityRole="button"
                        accessibilityLabel={t("copilot.applyToParchment")}
                      >
                        <Text style={styles.applyButtonText}>{t("copilot.applyToParchment")}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {presented.breakdown.length > 0 ? (
                  <View
                    style={
                      answer.recipeId === "stats.term_frequency" || answer.recipeId === "search.kwic"
                        ? styles.folioChipRow
                        : styles.breakdown
                    }
                  >
                    {presented.breakdown.map((b, i) =>
                      answer.recipeId === "stats.term_frequency" || answer.recipeId === "search.kwic" ? (
                        <View key={`${b.label}_${i}`} style={styles.folioChip}>
                          <Text style={styles.folioChipText}>
                            {b.label}: {fmt(b.value)}
                          </Text>
                        </View>
                      ) : (
                        <View key={`${b.label}_${i}`} style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>{b.label}</Text>
                          <Text style={styles.breakdownValue}>{fmt(b.value)}</Text>
                        </View>
                      ),
                    )}
                  </View>
                ) : null}

                {answer.doActions && answer.doActions.length > 0 ? (
                  <View style={styles.chipRow}>
                    <Text style={styles.sectionLabel}>{t("copilot.nextActions")}</Text>
                    {answer.doActions.map((action) => (
                      <Pressable
                        key={action}
                        onPress={() => {
                          if (action === "JUMP_FOLIO" && answer.rows[0]) {
                            handleJumpToRow(answer.rows[0]);
                            return;
                          }
                          if (action === "OPEN_KWIC" || action === "OPEN_CONCORDANCE") {
                            handleRecipe("search.kwic");
                            return;
                          }
                          if (action === "OPEN_VALIDATION" || action === "RUN_LINT") {
                            handleRecipe("search.passages");
                            return;
                          }
                          if (action === "OPEN_INGEST_PANEL") {
                            handleRecipe("ingest.unreviewed");
                            return;
                          }
                          if (action === "OPEN_LIBRARY") {
                            handleRecipe("meta.witness");
                          }
                        }}
                        style={styles.chip}
                        accessibilityRole="button"
                        accessibilityLabel={action}
                      >
                        <Text style={styles.chipLabel}>{action.replace(/_/g, " ")}</Text>
                      </Pressable>
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
                        <Text style={styles.chipLabel}>{chipLabelFor(alt.recipeId, alt.chipLabel)}</Text>
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
                    {answer.recipeId === "ingest.unreviewed" && workspace?.facsSidecar ? (
                      <Pressable
                        onPress={() => {
                          const sidecar = withFolioReview(workspace.facsSidecar!, row.folioId, "reviewed");
                          void setFolioReview(row.folioId, "reviewed");
                          const next = runRecipeById("ingest.unreviewed", parsedManuscript, { ...askOptions, sidecar });
                          if (next) setAnswer(next);
                        }}
                        style={styles.actionButton}
                        accessibilityRole="button"
                      >
                        <Text style={styles.actionText}>{t("ingest.markReviewed", { folio: row.folioId })}</Text>
                      </Pressable>
                    ) : null}
                  </Pressable>
                ))}

                {presented.method ? (
                  <Text style={styles.method}>
                    {t("copilot.methodLabel")}: {presented.method}
                  </Text>
                ) : null}
                {answer.dsl ? <Text style={styles.dsl} selectable>{answer.dsl}</Text> : null}
                <View style={styles.actionRow}>
                  {answer.dsl ? (
                    <Pressable onPress={handleCopyDsl} style={styles.actionButton} accessibilityRole="button">
                      <Copy color="#f6d890" size={12} />
                      <Text style={styles.actionText}>
                        {copied ? t("copilot.action.copied") : t("copilot.action.copyDsl")}
                      </Text>
                    </Pressable>
                  ) : null}
                  {answer.rows.length > 0 || presented.breakdown.length > 0 ? (
                    <>
                      <Pressable onPress={() => void handleExport(",")} style={styles.actionButton} accessibilityRole="button">
                        <Download color="#f6d890" size={12} />
                        <Text style={styles.actionText}>{t("copilot.action.exportCsv")}</Text>
                      </Pressable>
                      <Pressable onPress={() => void handleExport("\t")} style={styles.actionButton} accessibilityRole="button">
                        <Download color="#f6d890" size={12} />
                        <Text style={styles.actionText}>{t("copilot.action.exportTsv")}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
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
  attachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(246,216,144,0.1)",
    borderColor: "rgba(246,216,144,0.3)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachChipText: { flex: 1, color: "#fff4d2", fontSize: 12, fontWeight: "600" },
  inputRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,235,208,0.08)",
  },
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
  sendButtonDisabled: { opacity: 0.6 },
  visionBusy: { color: "#f6d890", fontSize: 12, fontWeight: "600" },
  hsmsBlock: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.2)",
    padding: 10,
    gap: 8,
  },
  hsmsText: {
    color: "#fff4d2",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 17,
  },
  applyButton: {
    alignSelf: "flex-start",
    backgroundColor: "#f6d890",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  applyButtonText: { color: "#1a0a05", fontSize: 12, fontWeight: "800" },
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
  statBlock: { alignItems: "center", gap: 6, paddingVertical: 8 },
  statValue: { color: "#f6d890", fontSize: 42, fontWeight: "800", fontFamily: "monospace", lineHeight: 48 },
  statWord: { color: "rgba(255,244,210,0.85)", fontSize: 14, fontStyle: "italic" },
  folioChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  folioChip: {
    backgroundColor: "rgba(155,34,23,0.28)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.35)",
  },
  folioChipText: { color: "#f6d890", fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
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
  serverNote: { color: "#e0b070", fontSize: 12, fontStyle: "italic" },
  slotPrompt: { gap: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
  },
  actionText: { color: "#f6d890", fontSize: 11 },
  dsl: { color: "rgba(143,191,106,0.9)", fontSize: 11, fontFamily: "monospace" },
});
