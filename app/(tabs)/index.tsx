import { useScriptorium } from "@/context/ScriptoriumContext";
import { useRegisterLineAnchor, useScrollAnchor } from "@/context/ScrollAnchorContext";
import { ExportManuscriptSheet } from "@/components/ExportManuscriptSheet";
import { BlockFigureLayout } from "@/components/BlockFigureLayout";
import { CompilationOverlay } from "@/components/CompilationOverlay";
import { ConcordanceDrawer } from "@/components/ConcordanceDrawer";
import { FigureImageContext, FigurePlaceholder } from "@/components/FigurePlaceholder";
import { FolioFacsimileCanvas } from "@/components/FolioFacsimileCanvas";
import { ManuscriptSelector } from "@/components/ManuscriptSelector";
import { ResponsiveBatchShell } from "@/components/ResponsiveBatchShell";
import { SvgFacsimilePage } from "@/components/SvgFacsimilePage";
import { SynopticFolioSplit } from "@/components/SynopticFolioSplit";
import { EditorLinterBanner } from "@/components/EditorLinterBanner";
import { ValidationPanel } from "@/components/ValidationPanel";
import {
  DEFAULT_DEMO,
  INLINE_IMAGE_DEMO,
  LAT_SPAN_SAMPLE,
  SIMPLE_SAMPLE,
} from "@/constants/demoTranscriptions";
import { scriptoriumTheme as theme } from "@/constants/scriptoriumTheme";
import { dropCapFontSize } from "@/utils/dropInitial";
import { tokenizeString } from "@/utils/hsmsLexer";
import type { FacsimilePlacement, FolioSide, ManuscriptBlock, Token, WordOccurrence } from "@/constants/manuscript";
import { formatRunningHeaderText } from "@/utils/metadataText";
import { reconstructManuscriptFlow } from "@/utils/manuscriptParser";
import { buildManuscriptExportPayload } from "@/utils/manuscriptExport";
import { saveExportFile } from "@/utils/exportFile";
import type { ManuscriptExportFormat } from "@/utils/exportFormats";
import { exportToTEIXML } from "@/utils/teiExport";
import { copyFigureIntoWorkspace } from "@/utils/figureAssetStorage";
import { platformShadow } from "@/utils/platformShadow";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertCircle,
  BookOpen,
  ClipboardList,
  Download,
  FileCode2,
  FileText,
  FolderUp,
  Image as ImageIcon,
  LayoutPanelLeft,
  ListOrdered,
  Package,
  Layers,
  PlusCircle,
  Settings2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ReaderStateContext = createContext<{
  showExpanded: boolean;
  showDeletions: boolean;
  showNormalizedDiacritics: boolean;
  suppressOtioseMarks: boolean;
}>({
  showExpanded: true,
  showDeletions: true,
  showNormalizedDiacritics: true,
  suppressOtioseMarks: false,
});

type BlockGroup =
  | { type: "single"; block: ManuscriptBlock }
  | { type: "two-column"; left: ManuscriptBlock[]; right: ManuscriptBlock[] };

function groupBlocksForLayout(blocks: ManuscriptBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let activeTwoColumnGroup: Extract<BlockGroup, { type: "two-column" }> | null = null;

  for (const block of blocks) {
    if (block.columns === 2) {
      if (!activeTwoColumnGroup) {
        activeTwoColumnGroup = { type: "two-column", left: [], right: [] };
        groups.push(activeTwoColumnGroup);
      }
      if (block.type === "gloss" || activeTwoColumnGroup.left.length > activeTwoColumnGroup.right.length) {
        activeTwoColumnGroup.right.push(block);
      } else {
        activeTwoColumnGroup.left.push(block);
      }
    } else {
      activeTwoColumnGroup = null;
      groups.push({ type: "single", block });
    }
  }

  return groups;
}

const SIBILANT_PATTERN = /[sz]'/i;

function handSuperscriptLabel(hand: string): string {
  const digits = hand.split("");
  const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return digits.map((d) => superscripts[parseInt(d, 10)] ?? d).join("");
}

export default function TranscriptionConniptionScreen() {
  const { width } = useWindowDimensions();
  const {
    parchmentRef,
    parchmentContentRef,
    scrollHighlight,
    setScrollHighlight,
    navigateToAnchor,
    navigateToLineIndex,
    remeasureFolio,
  } = useScrollAnchor();
  const {
    workspace,
    workspaceReady,
    workspaceTitle,
    setWorkspaceTitle,
    commitWorkspaceTitle,
    registry,
    activeFileName,
    setActiveFile,
    localEditorBuffer,
    setLocalEditorBuffer,
    commitEditorBuffer,
    debouncedText,
    isParsing,
    isCompiling,
    compilationStatus,
    parsedManuscript,
    uploadedImages,
    updateImageUri,
    removeImageUri,
    loadBatch,
    createNewWorkspace,
    importTextFile,
    importHsmsBundle,
    exportHsmsBundle,
    loadSample,
    applyTranscription,
    addFreePlacement,
    setFolioBackground,
  } = useScriptorium();

  const [isEditorMode, setIsEditorMode] = useState(false);
  const [isPreview, setIsPreview] = useState(true);
  const [showExpanded, setShowExpanded] = useState(true);
  const [showDeletions, setShowDeletions] = useState(true);
  const [showReadingFlow, setShowReadingFlow] = useState(false);
  const [showNormalizedDiacritics, setShowNormalizedDiacritics] = useState(true);
  const [suppressOtioseMarks, setSuppressOtioseMarks] = useState(false);
  const [showSynoptic, setShowSynoptic] = useState(false);
  const [concordanceOpen, setConcordanceOpen] = useState(false);
  const [batchShellVisible, setBatchShellVisible] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [facsimileCanvasEnabled, setFacsimileCanvasEnabled] = useState(false);
  const [svgModeEnabled, setSvgModeEnabled] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);

  const synopticEnabled = showSynoptic && width >= 640;

  useEffect(() => {
    if (isPreview) {
      commitEditorBuffer();
    }
  }, [isPreview, commitEditorBuffer]);

  // ── Web drag-and-drop: drop a .txt file anywhere to open it in parchment mode
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const onDragOver = (e: Event) => { e.preventDefault(); setIsDragOver(true); };
    const onDragLeave = (e: Event) => {
      const de = e as DragEvent;
      if (!de.relatedTarget) setIsDragOver(false);
    };
    const onDrop = (e: Event) => {
      e.preventDefault();
      setIsDragOver(false);
      const de = e as DragEvent;
      const file = de.dataTransfer?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result;
        if (typeof text === "string" && text.length > 0) {
          applyTranscription(text, { sourceFileName: file.name });
          setIsPreview(true);
          setIsEditorMode(false);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      };
      reader.readAsText(file, "utf-8");
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [applyTranscription]);

  const readingFlowText = useMemo(
    () =>
      reconstructManuscriptFlow(parsedManuscript.folios, {
        suppressOtioseMarks,
        diplomaticDiacritics: !showNormalizedDiacritics,
      }),
    [parsedManuscript.folios, suppressOtioseMarks, showNormalizedDiacritics],
  );

  const handleImagePicker = useCallback(
    async (figureId: string) => {
      if (!workspace) {
        return;
      }
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["image/jpeg", "image/png", "image/webp", "image/*"],
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          return;
        }

        const uri = result.assets?.[0]?.uri;
        if (!uri) {
          return;
        }

        const permanentUri = await copyFigureIntoWorkspace(workspace.id, figureId, uri);
        await updateImageUri(figureId, permanentUri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.warn("Figure image upload failed", error);
        Alert.alert("Upload error", "Could not attach an image to this placeholder slot.");
      }
    },
    [workspace, updateImageUri],
  );

  const handleRemoveImage = useCallback(
    async (figureId: string) => {
      try {
        await removeImageUri(figureId);
        await Haptics.selectionAsync();
      } catch (error) {
        console.warn("Figure image remove failed", error);
        Alert.alert("Remove failed", "Could not remove the facsimile from this slot.");
      }
    },
    [removeImageUri],
  );

  const handleConcordanceJump = useCallback(
    (occ: WordOccurrence) => {
      setIsPreview(true);
      navigateToAnchor({ folioId: occ.folioId, lineNumber: occ.lineNumber || undefined });
      void Haptics.selectionAsync();
    },
    [navigateToAnchor],
  );

  const handleValidationJump = useCallback(
    (lineIndex: number) => {
      setIsPreview(true);
      commitEditorBuffer();
      navigateToLineIndex(lineIndex, debouncedText);
      void Haptics.selectionAsync();
    },
    [navigateToLineIndex, commitEditorBuffer, debouncedText],
  );

  const handleBatchComplete = useCallback(
    (result: Parameters<typeof loadBatch>[0]) => {
      loadBatch(result);
      Alert.alert(
        "Batch complete",
        `Compiled ${result.summary.completedFiles} of ${result.summary.totalFiles} transcriptions.`,
      );
      setBatchShellVisible(false);
      setIsPreview(true);
    },
    [loadBatch],
  );

  const exportTei = useCallback(async () => {
    const xml = exportToTEIXML(parsedManuscript);
    try {
      await Share.share({
        message: xml.length > 8000 ? `${xml.slice(0, 8000)}\n… [truncated for share sheet]` : xml,
        title: "TEI-XML export",
      });
    } catch {
      Alert.alert("Export", "TEI XML generated but could not open the share sheet.");
    }
  }, [parsedManuscript]);

  const buildExportContents = useCallback(
    (format: ManuscriptExportFormat) =>
      buildManuscriptExportPayload(format, {
        parsed: parsedManuscript,
        sourceText: debouncedText,
        display: {
          showExpanded,
          showDeletions,
          useNormalizedDiacritics: showNormalizedDiacritics,
          suppressOtioseMarks,
        },
      }).contents,
    [
      parsedManuscript,
      debouncedText,
      showExpanded,
      showDeletions,
      showNormalizedDiacritics,
      suppressOtioseMarks,
    ],
  );

  const handleExportManuscript = useCallback(
    async (fileName: string, format: ManuscriptExportFormat) => {
      if (!parsedManuscript.folios.length && !debouncedText.trim()) {
        Alert.alert("Nothing to export", "Upload or load a transcription before exporting.");
        return;
      }

      try {
        await saveExportFile(buildExportContents(format), {
          fileName,
          format,
          dialogTitle: `Export ${fileName}`,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.warn("Export failed", error);
        Alert.alert("Export failed", "Could not build or save the exported file.");
      }
    },
    [parsedManuscript.folios.length, debouncedText, buildExportContents],
  );

  const handleSetFolioBackground = useCallback(
    async (folioId: string) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["image/jpeg", "image/png", "image/webp", "image/*"],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]?.uri) {
          return;
        }
        await setFolioBackground(folioId, result.assets[0].uri);
        await Haptics.selectionAsync();
      } catch (error) {
        console.warn("Folio background upload failed", error);
        Alert.alert("Upload error", "Could not attach a leaf scan for this folio.");
      }
    },
    [setFolioBackground],
  );

  const handleCanvasPress = useCallback(
    async (folioId: string, relX: number, relY: number) => {
      if (!placementMode) {
        return;
      }
      const placement: FacsimilePlacement = {
        placementId: `free_${folioId}_${Date.now().toString(36)}`,
        folioId,
        figureType: "ILL",
        caption: "Facsimile fragment",
        relX,
        relY,
      };
      await addFreePlacement(placement);
      await Haptics.selectionAsync();
    },
    [placementMode, addFreePlacement],
  );

  const validationCount = parsedManuscript.validationErrors?.length ?? 0;
  const hasPublicationMeta = Boolean(
    parsedManuscript.metadata.title ||
      parsedManuscript.metadata.author ||
      parsedManuscript.metadata.imprint?.city ||
      parsedManuscript.metadata.witness?.library,
  );
  const showReaderTools = isEditorMode;
  const showParchment = isPreview || !isEditorMode;
  const canExportHtml = parsedManuscript.folios.length > 0 || debouncedText.trim().length > 0;

  return (
    <LinearGradient colors={[...theme.gradient]} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ReaderStateContext.Provider
          value={{ showExpanded, showDeletions, showNormalizedDiacritics, suppressOtioseMarks }}
        >
          <FigureImageContext.Provider
            value={{
              uploadedImages,
              triggerImagePick: handleImagePicker,
              removeImage: handleRemoveImage,
            }}
          >
          <View style={styles.horizontalShell}>
          <ScrollView
            style={styles.primaryColumn}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.hero, !isEditorMode && styles.heroReader]}>
              <View style={styles.brandRow}>
                <View style={styles.seal}>
                  <BookOpen color={theme.gold} size={26} />
                </View>
                <View style={styles.brandTextCol}>
                  <Text style={styles.kicker}>Historical Philology Platform</Text>
                  <Text style={styles.title}>Transcription Conniption</Text>
                </View>
              </View>
              {!isEditorMode ? (
                <Text style={styles.subtitle}>
                  {isDragOver
                    ? "Drop the file to render on parchment…"
                    : "Upload a plain-text HSMS transcription to view it on parchment. Drag & drop a .txt file anywhere."}
                </Text>
              ) : (
                <Text style={styles.subtitle}>
                  Advanced scriptorium: edit HSMS source, validate structure, attach facsimiles, and export bundles.
                </Text>
              )}

              <View style={styles.readerActionBar}>
                <Pressable
                  onPress={() => {
                    void importTextFile().then(() => {
                      setIsPreview(true);
                      setIsEditorMode(false);
                    });
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                >
                  <Upload color={theme.inkDark} size={16} />
                  <Text style={styles.primaryButtonText}>Upload & Convert</Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsEditorMode((prev) => !prev)}
                  style={({ pressed }) => [
                    styles.editorModeToggle,
                    isEditorMode && styles.editorModeToggleActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Settings2 color={isEditorMode ? theme.inkDark : theme.gold} size={16} />
                  <Text
                    style={[styles.editorModeToggleText, isEditorMode && styles.editorModeToggleTextActive]}
                  >
                    {isEditorMode ? "Hide editor tools" : "Advanced editor"}
                  </Text>
                </Pressable>
                {canExportHtml ? (
                  <Pressable
                    onPress={() => setExportSheetVisible(true)}
                    style={({ pressed }) => [styles.htmlExportButton, pressed && styles.pressed]}
                  >
                    <Download color={theme.gold} size={16} />
                    <Text style={styles.htmlExportButtonText}>Export</Text>
                  </Pressable>
                ) : null}
              </View>

              {isEditorMode ? (
                <>
                  {workspaceReady ? (
                    <View style={styles.workspaceCard}>
                      <Text style={styles.workspaceLabel}>Transcription</Text>
                      <TextInput
                        value={workspaceTitle}
                        onChangeText={setWorkspaceTitle}
                        onBlur={commitWorkspaceTitle}
                        onSubmitEditing={commitWorkspaceTitle}
                        placeholder="Manuscript title"
                        placeholderTextColor="rgba(255,244,210,0.45)"
                        style={styles.workspaceTitleInput}
                        returnKeyType="done"
                      />
                      <Text style={styles.workspaceMeta}>
                        {Object.keys(uploadedImages).length} facsimile slot
                        {Object.keys(uploadedImages).length === 1 ? "" : "s"} attached
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.workflowBar}>
                    <Pressable
                      onPress={() => {
                        void createNewWorkspace().then(() => {
                          setIsPreview(false);
                          setIsEditorMode(true);
                        });
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <PlusCircle color={theme.gold} size={16} />
                      <Text style={styles.secondaryButtonText}>New blank scriptorium</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setBatchShellVisible(true)}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Layers color={theme.gold} size={16} />
                      <Text style={styles.secondaryButtonText}>Batch folder</Text>
                    </Pressable>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void exportHsmsBundle()}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Package color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>Export .hsms</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void importHsmsBundle().then(() => setIsPreview(true));
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Upload color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>Import .hsms</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void loadSample(DEFAULT_DEMO, "Nunes_Demo").then(() => setIsPreview(true));
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Sparkles color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>Nunes demo</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void loadSample(SIMPLE_SAMPLE, "Simple_Witness").then(() => setIsPreview(true));
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <FileText color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>Simple</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void loadSample(LAT_SPAN_SAMPLE, "LAT_Span").then(() => setIsPreview(true));
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <FileText color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>LAT span</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void loadSample(INLINE_IMAGE_DEMO, "Graphics_Demo").then(() => setIsPreview(true));
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <ImageIcon color="#f6d890" size={18} />
                      <Text style={styles.secondaryButtonText}>Graphics</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>

            {isEditorMode ? (
            <View style={styles.switcher}>
              <Pressable
                onPress={() => setIsPreview(false)}
                style={[styles.switchOption, !isPreview && styles.switchOptionActive]}
              >
                <FileText color={!isPreview ? theme.inkDark : theme.gold} size={16} />
                <Text style={[styles.switchText, !isPreview && styles.switchTextActive]}>Transcription Code</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  commitEditorBuffer();
                  setIsPreview(true);
                }}
                style={[styles.switchOption, isPreview && styles.switchOptionActive]}
              >
                <Wand2 color={isPreview ? theme.inkDark : theme.gold} size={16} />
                <Text style={[styles.switchText, isPreview && styles.switchTextActive]}>Parchment Sheet</Text>
              </Pressable>
            </View>
            ) : null}

            <ManuscriptSelector
              currentFileName={activeFileName ?? workspace?.sourceFileName ?? null}
              registry={registry}
              onSelect={(name) => {
                setActiveFile(name);
                setIsPreview(true);
              }}
            />

            {hasPublicationMeta && showParchment ? (
              <View style={styles.metadataCard}>
                <Text style={styles.metadataCardTitle}>
                  {parsedManuscript.metadata.title || "Untitled manuscript"}
                </Text>
                {parsedManuscript.metadata.author ? (
                  <Text style={styles.metadataCardAuthor}>{parsedManuscript.metadata.author}</Text>
                ) : null}
                {parsedManuscript.metadata.imprint.city ? (
                  <Text style={styles.metadataCardImprint}>
                    {[
                      parsedManuscript.metadata.imprint.city,
                      parsedManuscript.metadata.imprint.printer,
                      parsedManuscript.metadata.imprint.date,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {isEditorMode && !isPreview ? (
              <View style={styles.editorCard}>
                <EditorLinterBanner
                  transcriptionText={localEditorBuffer}
                  onJumpToLine={handleValidationJump}
                />
                <ValidationPanel
                  errors={parsedManuscript.validationErrors ?? []}
                  onJumpToLine={handleValidationJump}
                />
                <Pressable
                  onPress={() => router.push("/modal")}
                  style={({ pressed }) => [styles.validationModalLink, pressed && styles.pressed]}
                >
                  <ClipboardList color="#7ba4cc" size={16} />
                  <Text style={styles.validationModalLinkText}>Open full validation sheet</Text>
                </Pressable>
                {isParsing ? (
                  <Text style={styles.parsePendingLabel}>Parsing manuscript structure…</Text>
                ) : null}
                <Text style={styles.sectionLabel}>HSMS transcription</Text>
                <TextInput
                  multiline
                  value={localEditorBuffer}
                  onChangeText={setLocalEditorBuffer}
                  onBlur={commitEditorBuffer}
                  placeholder="Paste plain-text HSMS layout here..."
                  placeholderTextColor="rgba(246,216,144,0.45)"
                  style={styles.editor}
                  textAlignVertical="top"
                />
              </View>
            ) : null}

            {showParchment ? (
              <View style={styles.previewShell}>
                {showReaderTools ? (
                <View style={styles.configStrip}>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Expansions (&lt;&gt;)</Text>
                    <Switch
                      value={showExpanded}
                      onValueChange={setShowExpanded}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Deletions (())</Text>
                    <Switch
                      value={showDeletions}
                      onValueChange={setShowDeletions}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Unicode diacritics</Text>
                    <Switch
                      value={showNormalizedDiacritics}
                      onValueChange={setShowNormalizedDiacritics}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Hide otiose ~</Text>
                    <Switch
                      value={suppressOtioseMarks}
                      onValueChange={setSuppressOtioseMarks}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Reading flow</Text>
                    <Switch
                      value={showReadingFlow}
                      onValueChange={setShowReadingFlow}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Synoptic pane</Text>
                    <Switch
                      value={showSynoptic}
                      onValueChange={setShowSynoptic}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Facsimile canvas</Text>
                    <Switch
                      value={facsimileCanvasEnabled}
                      onValueChange={setFacsimileCanvasEnabled}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>Place figure</Text>
                    <Switch
                      value={placementMode}
                      onValueChange={setPlacementMode}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                  <View style={styles.toggleCell}>
                    <Text style={styles.toggleLabel}>SVG canvas</Text>
                    <Switch
                      value={svgModeEnabled}
                      onValueChange={setSvgModeEnabled}
                      thumbColor="#9b2217"
                      trackColor={{ true: "#dfcba5", false: "#ccc" }}
                    />
                  </View>
                </View>
                ) : null}

                {showReaderTools ? (
                <View style={styles.scholarToolbar}>
                  <Pressable
                    onPress={() => setConcordanceOpen(true)}
                    style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
                  >
                    <ListOrdered color="#f6d890" size={16} />
                    <Text style={styles.toolButtonText}>Concordance</Text>
                  </Pressable>
                  <Pressable
                    onPress={exportTei}
                    style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
                  >
                    <FileCode2 color="#f6d890" size={16} />
                    <Text style={styles.toolButtonText}>TEI export</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setExportSheetVisible(true)}
                    style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
                  >
                    <Download color="#f6d890" size={16} />
                    <Text style={styles.toolButtonText}>Export</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/modal")}
                    style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
                  >
                    <AlertCircle color="#f6d890" size={16} />
                    <Text style={styles.toolButtonText}>Errors ({validationCount})</Text>
                  </Pressable>
                  {synopticEnabled ? (
                    <View style={styles.toolBadge}>
                      <LayoutPanelLeft color="#446622" size={14} />
                      <Text style={styles.toolBadgeText}>Synoptic active</Text>
                    </View>
                  ) : showSynoptic ? (
                    <Text style={styles.toolHint}>Widen window for synoptic split</Text>
                  ) : null}
                </View>
                ) : null}

                {scrollHighlight ? (
                  <Pressable
                    onPress={() => setScrollHighlight(null)}
                    style={styles.anchorBanner}
                  >
                    <Text style={styles.anchorBannerText}>
                      Focus: [fol. {scrollHighlight.folioId}]
                      {scrollHighlight.lineNumber ? ` · line ${scrollHighlight.lineNumber}` : ""}
                      {"  "}× clear
                    </Text>
                  </Pressable>
                ) : null}

                {showReadingFlow && readingFlowText ? (
                  <View style={styles.readingFlowPanel}>
                    <Text style={styles.readingFlowLabel}>Unified reading (hyphen continuity)</Text>
                    <Text style={styles.readingFlowText}>{readingFlowText}</Text>
                  </View>
                ) : null}

                {!isEditorMode ? (
                  <View ref={parchmentRef} style={styles.parchmentCanvasReader}>
                    <View ref={parchmentContentRef} style={styles.parchmentContentReader}>
                      {parsedManuscript.folios.length === 0 ? (
                        <Text style={styles.emptyHint}>
                          Add a folio marker such as [fol. 1r] to begin rendering leaves.
                        </Text>
                      ) : (
                        parsedManuscript.folios.map((folio, fIdx) => (
                          <FolioPage
                            key={`${folio.id}-${fIdx}`}
                            folio={folio}
                            highlight={scrollHighlight}
                            synoptic={synopticEnabled}
                            folioBackgroundUri={workspace?.folioBackgrounds?.[folio.id]}
                            freePlacements={workspace?.freePlacements ?? []}
                            facsimileCanvasEnabled={false}
                            placementMode={false}
                            svgMode={svgModeEnabled}
                            useNormalizedDiacritics={showNormalizedDiacritics}
                            remeasureFolio={remeasureFolio}
                          />
                        ))
                      )}
                    </View>
                  </View>
                ) : (
                <ScrollView
                  ref={parchmentRef}
                  style={styles.parchmentCanvas}
                  nestedScrollEnabled
                >
                  <View ref={parchmentContentRef} style={styles.parchmentContent}>
                  {parsedManuscript.folios.length === 0 ? (
                    <Text style={styles.emptyHint}>
                      Add a folio marker such as [fol. 1r] to begin rendering leaves.
                    </Text>
                  ) : (
                    parsedManuscript.folios.map((folio, fIdx) => (
                      <FolioPage
                        key={`${folio.id}-${fIdx}`}
                        folio={folio}
                        highlight={scrollHighlight}
                        synoptic={synopticEnabled}
                        folioBackgroundUri={workspace?.folioBackgrounds?.[folio.id]}
                        freePlacements={workspace?.freePlacements ?? []}
                        facsimileCanvasEnabled={facsimileCanvasEnabled}
                        placementMode={placementMode}
                        svgMode={svgModeEnabled}
                        useNormalizedDiacritics={showNormalizedDiacritics}
                        onCanvasPress={handleCanvasPress}
                        onSetFolioBackground={handleSetFolioBackground}
                        remeasureFolio={remeasureFolio}
                      />
                    ))
                  )}
                  </View>
                </ScrollView>
                )}

                {showReaderTools ? (
                <View style={styles.statStrip}>
                  <Text style={styles.stat}>Lines: {parsedManuscript.stats.totalLines}</Text>
                  <Text style={styles.stat}>Words: {parsedManuscript.stats.totalWords}</Text>
                  <Text style={styles.stat}>Rubrics: {parsedManuscript.stats.rubricCount}</Text>
                  <Text style={styles.stat}>Glosses: {parsedManuscript.stats.glossCount}</Text>
                  <Text style={styles.stat}>
                    Index: {Object.keys(parsedManuscript.concordance ?? {}).length}
                  </Text>
                  <Text style={styles.stat}>
                    Issues: {(parsedManuscript.validationErrors ?? []).length}
                  </Text>
                </View>
                ) : null}
              </View>
            ) : null}

            <ConcordanceDrawer
              visible={concordanceOpen}
              onClose={() => setConcordanceOpen(false)}
              concordance={parsedManuscript.concordance ?? {}}
              onSelectOccurrence={handleConcordanceJump}
            />
          </ScrollView>
          <ResponsiveBatchShell
            visible={batchShellVisible}
            onClose={() => setBatchShellVisible(false)}
            onBatchComplete={handleBatchComplete}
          />
          <CompilationOverlay
            visible={isCompiling}
            message={compilationStatus || "Processing…"}
          />
          <ExportManuscriptSheet
            visible={exportSheetVisible}
            onClose={() => setExportSheetVisible(false)}
            sourceFileName={activeFileName ?? workspace?.sourceFileName}
            onExport={handleExportManuscript}
          />
          </View>
          </FigureImageContext.Provider>
        </ReaderStateContext.Provider>
      </SafeAreaView>
    </LinearGradient>
  );
}

function RunningHeaderLine({ raw }: { raw: string }) {
  const { showExpanded, showNormalizedDiacritics, suppressOtioseMarks } =
    useContext(ReaderStateContext);
  const display = useMemo(
    () =>
      formatRunningHeaderText(raw, {
        showExpanded,
        useNormalizedDiacritics: showNormalizedDiacritics,
        suppressOtioseMarks,
      }),
    [raw, showExpanded, showNormalizedDiacritics, suppressOtioseMarks],
  );
  return (
    <View style={styles.runningHeaderRow}>
      <Text style={styles.runningHeader}>{display}</Text>
    </View>
  );
}

function FolioPage({
  folio,
  highlight,
  synoptic,
  folioBackgroundUri,
  freePlacements,
  facsimileCanvasEnabled,
  placementMode,
  svgMode,
  useNormalizedDiacritics,
  onCanvasPress,
  onSetFolioBackground,
  remeasureFolio,
}: {
  folio: FolioSide;
  highlight: { folioId: string; lineNumber?: string } | null;
  synoptic: boolean;
  folioBackgroundUri?: string;
  freePlacements: FacsimilePlacement[];
  facsimileCanvasEnabled: boolean;
  placementMode: boolean;
  svgMode?: boolean;
  useNormalizedDiacritics?: boolean;
  onCanvasPress?: (folioId: string, relX: number, relY: number) => void;
  onSetFolioBackground?: (folioId: string) => void;
  remeasureFolio: (folioId: string, folioRef: React.RefObject<View | null>) => void;
}) {
  const folioRef = useRef<View>(null);
  const { showExpanded, showDeletions, suppressOtioseMarks } = useContext(ReaderStateContext);

  useEffect(() => {
    const timer = setTimeout(() => {
      remeasureFolio(folio.id, folioRef);
    }, 50);
    return () => clearTimeout(timer);
  }, [folio.id, folio.blocks, remeasureFolio]);
  const structuredBlocks = useMemo(() => groupBlocksForLayout(folio.blocks), [folio.blocks]);
  const folioHighlighted = highlight?.folioId === folio.id;

  const diplomaticBody = (
    <>
      {folio.headings.map((heading, idx) => (
        <RunningHeaderLine key={`h-${idx}`} raw={heading} />
      ))}

      <View style={styles.blocksSpace}>
        {structuredBlocks.map((group, gIdx) => {
          if (group.type === "single") {
            return (
              <BlockRenderer
                key={`g-${gIdx}`}
                folioId={folio.id}
                block={group.block}
                highlight={folioHighlighted ? highlight : null}
              />
            );
          }

          return (
            <View key={`g-${gIdx}`} style={styles.columnsWrapperRow}>
              <View style={styles.columnTrackColumn}>
                {group.left.map((b, bIdx) => (
                  <BlockRenderer
                    key={`l-${bIdx}`}
                    folioId={folio.id}
                    block={b}
                    highlight={folioHighlighted ? highlight : null}
                  />
                ))}
              </View>
              <View style={[styles.columnTrackColumn, styles.rightColumnTrack]}>
                {group.right.map((b, bIdx) => (
                  <BlockRenderer
                    key={`r-${bIdx}`}
                    folioId={folio.id}
                    block={b}
                    highlight={folioHighlighted ? highlight : null}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {folio.catchword ? <Text style={styles.catchwordText}>Reclamo: {folio.catchword}</Text> : null}
      {folio.signature ? <Text style={styles.signatureText}>Signatura: {folio.signature}</Text> : null}
    </>
  );

  const content = svgMode ? (
    <SvgFacsimilePage
      folio={folio}
      showExpanded={showExpanded}
      showDeletions={showDeletions}
      suppressOtioseMarks={suppressOtioseMarks}
      useNormalizedDiacritics={useNormalizedDiacritics}
    />
  ) : diplomaticBody;

  return (
    <View
      ref={folioRef}
      onLayout={() => remeasureFolio(folio.id, folioRef)}
      style={[styles.folioLeaf, folioHighlighted && styles.folioLeafHighlight]}
    >
      <View style={styles.folioMarkerContainer}>
        <Text style={styles.folioMarker}>Leaf [fol. {folio.id}]</Text>
      </View>

      {facsimileCanvasEnabled ? (
        <FolioFacsimileCanvas
          folio={folio}
          backgroundUri={folioBackgroundUri}
          freePlacements={freePlacements}
          placementMode={placementMode}
          onCanvasPress={onCanvasPress}
          onSetFolioBackground={onSetFolioBackground}
        >
          {synoptic ? (
            <SynopticFolioSplit folio={folio} highlight={highlight} diplomatic={content} />
          ) : (
            content
          )}
        </FolioFacsimileCanvas>
      ) : synoptic ? (
        <SynopticFolioSplit folio={folio} highlight={highlight} diplomatic={content} />
      ) : (
        content
      )}
    </View>
  );
}

function BlockRenderer({
  folioId,
  block,
  highlight,
}: {
  folioId: string;
  block: ManuscriptBlock;
  highlight: { folioId: string; lineNumber?: string } | null;
}) {
  const blockRef = useRef<View>(null);
  const onBlockLayout = useRegisterLineAnchor(folioId, block.lineNumber, blockRef);
  if (block.type === "diagram") {
    const diagramFigures = block.tokens.filter((t) => t.type === "figure_anchor");
    if (diagramFigures.length > 0) {
      return (
        <View style={styles.diagramContainer}>
          {diagramFigures.map((token, idx) => (
            <FigurePlaceholder key={token.figureId ?? `diag-${idx}`} token={token} />
          ))}
        </View>
      );
    }
    return (
      <View style={styles.diagramContainer}>
        <Text style={styles.diagramLabel}>[Diagram schema — add caption or upload inline {`{DIAG. …}`}]</Text>
      </View>
    );
  }

  if (block.type === "initial_container") {
    return (
      <View ref={blockRef} onLayout={onBlockLayout}>
        <Text style={styles.blockText}>
          <TokenStream tokens={block.tokens} blockType={block.type} />
        </Text>
      </View>
    );
  }

  const blockStyle = [
    styles.blockText,
    block.type === "rubric" && styles.rubricText,
    block.type === "gloss" && styles.glossText,
    block.type === "addendum" && styles.addendumText,
    block.type === "language_span" && styles.foreignLanguageText,
  ];

  return (
    <View ref={blockRef} onLayout={onBlockLayout}>
      <BlockFigureLayout
        block={block}
        highlight={highlight}
        blockStyle={blockStyle}
        renderTokenStream={(tokens, blockType) => (
          <TokenStream tokens={tokens} blockType={blockType} />
        )}
      />
    </View>
  );
}

function innerLanguageCode(token: Token): string | undefined {
  if (!token.envLayers?.length) {
    return undefined;
  }
  for (let i = token.envLayers.length - 1; i >= 0; i--) {
    if (token.envLayers[i].type === "language_span") {
      return token.envLayers[i].code;
    }
  }
  return undefined;
}

function TokenStream({
  tokens,
  blockType,
}: {
  tokens: Token[];
  blockType?: ManuscriptBlock["type"];
}) {
  const { showExpanded, showDeletions, showNormalizedDiacritics, suppressOtioseMarks } =
    useContext(ReaderStateContext);
  const foreignStyle = blockType === "language_span" ? styles.foreignLanguageText : null;

  return (
    <>
      {tokens.map((token, idx) => {
        const handStyle = token.hand ? styles.alternateHandText : null;
        const sibilantStyle =
          token.type === "text" && SIBILANT_PATTERN.test(token.value) ? styles.sibilantText : null;
        const inlineLang = innerLanguageCode(token);
        const nestedForeignStyle = inlineLang ? styles.foreignLanguageText : null;
        const nestedRubricStyle = token.envLayers?.some((l) => l.type === "rubric")
          ? styles.nestedRubricText
          : null;

        switch (token.type) {
          case "drop_initial": {
            const fontSize = dropCapFontSize(token.initialDepth ?? 3);
            return (
              <Text
                key={idx}
                style={[
                  styles.inlineDropCapChar,
                  { fontSize, lineHeight: fontSize + 2 },
                  blockType === "rubric" && styles.rubricText,
                ]}
              >
                {token.value}
              </Text>
            );
          }
          case "scribal_punctuation":
            return (
              <Text key={idx} style={styles.scribalPunctuationToken}>
                {token.value === "$." ? ";" : token.value === "$;" ? ";" : token.value}
              </Text>
            );
          case "expansion":
            return showExpanded ? (
              <Text key={idx} style={[styles.expansionToken, handStyle]}>
                {token.value}
              </Text>
            ) : null;
          case "superscript":
            return (
              <Text key={idx} style={[styles.superscriptToken, handStyle]}>
                {token.value}
              </Text>
            );
          case "scribal_deletion":
          case "editorial_deletion":
            return showDeletions ? (
              <Text key={idx} style={[styles.deletionToken, handStyle]}>
                {token.value}
              </Text>
            ) : null;
          case "reconstructed_text":
            return (
              <Text key={idx} style={[styles.insertionToken, handStyle]}>
                [{token.value}]
              </Text>
            );
          case "illegible_text":
            return (
              <Text key={idx} style={styles.blankToken}>
                {" □□ "}
              </Text>
            );
          case "missing_fragment":
            return (
              <Text key={idx} style={styles.deletionToken}>
                …
              </Text>
            );
          case "mechanical_lacuna":
            return <Text key={idx}> </Text>;
          case "scribal_insertion":
          case "editorial_insertion":
            return (
              <Text key={idx} style={[styles.insertionToken, handStyle]}>
                {token.hand ? (
                  <Text style={styles.handSuperIndicator}>{handSuperscriptLabel(token.hand)}</Text>
                ) : null}
                {token.value}
              </Text>
            );
          case "calderon":
          case "calderon_two":
          case "calderon_three":
            return (
              <Text key={idx} style={styles.calderonToken}>
                {" ¶ "}
              </Text>
            );
          case "blank_space":
            return (
              <Text
                key={idx}
                style={styles.blankToken}
                accessibilityLabel={token.value !== "blank" ? token.value : "Blank space in manuscript"}
              >
                {" □ "}
                {token.value !== "blank" ? (
                  <Text style={styles.blankFootnote}> ({token.value})</Text>
                ) : null}
              </Text>
            );
          case "otiose_mark":
            return suppressOtioseMarks ? null : (
              <Text key={idx} style={styles.otioseToken}>
                ~
              </Text>
            );
          case "hyphen":
            return <Text key={idx}>-</Text>;
          default: {
            const isDiacritic = Boolean(token.normalized);
            const diacriticStyle = isDiacritic ? styles.diacriticResolvedText : null;
            const display =
              isDiacritic && !showNormalizedDiacritics ? token.raw : token.value;
            return (
              <Text key={idx} style={[handStyle, sibilantStyle, diacriticStyle, foreignStyle, nestedForeignStyle, nestedRubricStyle]}>
                {display}
              </Text>
            );
          }
        }
      })}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  horizontalShell: { flex: 1, flexDirection: "row" },
  primaryColumn: { flex: 1, width: "100%" },
  content: { padding: 18, paddingBottom: 40, gap: 18, alignItems: "center" },
  hero: {
    borderWidth: 1,
    borderColor: theme.goldBorderStrong,
    backgroundColor: theme.frostPanel,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    ...platformShadow(8, 16, 0.35, theme.shadow),
  },
  heroReader: {
    padding: 14,
    gap: 10,
    borderRadius: 18,
    ...platformShadow(6, 10, 0.22, theme.shadow),
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  brandTextCol: { flex: 1, minWidth: 0 },
  readerActionBar: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  editorModeToggle: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.25)",
    backgroundColor: "rgba(255, 211, 110, 0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editorModeToggleActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  editorModeToggleText: { color: theme.gold, fontSize: 14, fontWeight: "700" },
  editorModeToggleTextActive: { color: theme.inkDark, fontWeight: "800" },
  htmlExportButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.25)",
    backgroundColor: "rgba(255, 211, 110, 0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  htmlExportButtonText: { color: theme.gold, fontSize: 14, fontWeight: "700" },
  metadataCard: {
    backgroundColor: "rgba(40, 15, 10, 0.45)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.1)",
    alignItems: "center",
    gap: 2,
    width: "100%",
    maxWidth: 900,
  },
  metadataCardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fffbf0",
    textAlign: "center",
  },
  metadataCardAuthor: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#c8995f",
    textAlign: "center",
  },
  metadataCardImprint: {
    fontSize: 11,
    color: "#99836a",
    textAlign: "center",
    marginTop: 2,
  },
  seal: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(82, 26, 17, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.35)",
  },
  kicker: { color: theme.gold, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: "700" },
  title: { color: theme.textCream, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: theme.textCreamSoft, fontSize: 15, lineHeight: 22 },
  workflowBar: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 },
  workspaceCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(33,13,11,0.55)",
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.28)",
    gap: 6,
  },
  workspaceLabel: {
    color: "#f6d890",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  workspaceTitleInput: {
    color: "#fff4d2",
    fontSize: 20,
    fontWeight: "800",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246,216,144,0.35)",
  },
  workspaceMeta: { color: "rgba(255,244,210,0.55)", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: theme.gold,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...platformShadow(2, 4, 0.2, theme.shadow),
  },
  primaryButtonText: { color: theme.inkDark, fontSize: 14, fontWeight: "800" },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.25)",
    backgroundColor: "rgba(255, 211, 110, 0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryButtonText: { color: theme.gold, fontSize: 14, fontWeight: "700" },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  switcher: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  switchOption: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  switchOptionActive: { backgroundColor: theme.gold },
  switchText: { color: theme.gold, fontWeight: "700", fontSize: 12 },
  switchTextActive: { color: theme.inkDark, fontWeight: "800" },
  editorCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: theme.frostEditor,
    borderWidth: 1,
    borderColor: theme.goldBorderStrong,
    ...platformShadow(12, 20, 0.4, theme.shadow),
  },
  sectionLabel: { color: "#f6d890", fontWeight: "900", marginBottom: 12, letterSpacing: 0.7, textTransform: "uppercase", fontSize: 12 },
  parsePendingLabel: {
    color: "rgba(246,216,144,0.65)",
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 8,
  },
  validationModalLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
  },
  validationModalLinkText: { color: "#7ba4cc", fontSize: 13, fontWeight: "700" },
  editor: {
    minHeight: 360,
    color: "#fff4d2",
    fontSize: 15,
    lineHeight: 23,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  previewShell: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.goldBorderStrong,
    backgroundColor: theme.frostPanelDeep,
    ...platformShadow(16, 24, 0.45, theme.shadow),
    width: "100%",
    maxWidth: 960,
  },
  configStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    backgroundColor: "rgba(51, 40, 30, 0.92)",
    padding: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.goldBorder,
  },
  readingFlowPanel: {
    backgroundColor: theme.parchmentMuted,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(109,83,57,0.2)",
  },
  readingFlowLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6d5339",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  readingFlowText: { fontSize: 14, lineHeight: 22, color: "#2c1e11" },
  toggleCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleLabel: { color: "#dfcba5", fontSize: 12, fontWeight: "600" },
  scholarToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(33,13,11,0.85)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246,216,144,0.15)",
    alignItems: "center",
  },
  toolButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
  },
  toolButtonText: { color: "#f6d890", fontSize: 12, fontWeight: "800" },
  toolBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  toolBadgeText: { color: "#a8d4a0", fontSize: 11, fontWeight: "700" },
  toolHint: { color: "#99836a", fontSize: 11, fontStyle: "italic" },
  anchorBanner: {
    backgroundColor: "rgba(155,34,23,0.25)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(155,34,23,0.35)",
  },
  anchorBannerText: { color: "#f6d890", fontSize: 12, fontWeight: "700", textAlign: "center" },
  parchmentCanvas: { maxHeight: 520, backgroundColor: theme.parchment },
  parchmentCanvasReader: { backgroundColor: theme.parchment },
  parchmentContent: { padding: 16, paddingBottom: 32 },
  parchmentContentReader: { padding: 12, paddingBottom: 32, alignItems: "center" },
  metaHeader: { fontSize: 22, fontWeight: "bold", color: "#3c1510", textAlign: "center" },
  metaSub: { fontSize: 14, fontStyle: "italic", color: "#555", textAlign: "center", marginTop: 4 },
  metaImprint: { fontSize: 12, color: "#6d5339", textAlign: "center", marginBottom: 12 },
  emptyHint: { color: "#6d5339", fontStyle: "italic", textAlign: "center", marginTop: 24 },
  folioLeaf: { borderTopWidth: 1, borderTopColor: "#dfcba5", marginTop: 12, paddingTop: 12 },
  folioLeafHighlight: {
    backgroundColor: "rgba(155,34,23,0.06)",
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  synopticRow: { flexDirection: "row", width: "100%" },
  synopticDiplomatic: { flex: 1, paddingRight: 4 },
  synopticPaneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6d5339",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  blockRowHighlight: {
    backgroundColor: "rgba(155,34,23,0.14)",
    borderRadius: 4,
    marginHorizontal: -2,
    paddingHorizontal: 2,
  },
  folioMarkerContainer: { alignItems: "flex-end", marginBottom: 6 },
  folioMarker: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    color: "#888",
    backgroundColor: "#eaddc1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  runningHeaderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 8,
    paddingVertical: 4,
  },
  runningHeader: { fontSize: 13, fontWeight: "bold", color: "#6d5339", textAlign: "center", letterSpacing: 1, marginBottom: 8 },
  blocksSpace: { marginTop: 8, width: "100%" },
  columnsWrapperRow: { flexDirection: "row", width: "100%", justifyContent: "space-between" },
  columnTrackColumn: { width: "48%", flexDirection: "column" },
  rightColumnTrack: { borderLeftWidth: 1, borderLeftColor: "rgba(109,83,57,0.15)", paddingLeft: 8 },
  blockRow: { flexDirection: "row", marginBottom: 4, alignItems: "flex-start", width: "100%" },
  lineNumberLabel: {
    width: 52,
    fontSize: 10,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    color: "#99836a",
    paddingTop: 2,
    paddingRight: 4,
  },
  blockBody: { flex: 1 },
  languageTag: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6d5339",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  blockText: {
    fontSize: 16,
    color: "#1a0a05",
    lineHeight: 24,
    textAlign: "left",
    flexShrink: 1,
  },
  inlineDropCapChar: {
    fontWeight: "bold",
    color: theme.rubricRed,
    marginRight: 4,
  },
  rubricText: { color: theme.rubricRed, fontWeight: "bold" },
  glossText: {
    color: "#1a446c",
    fontSize: 13,
    fontStyle: "italic",
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#7ba4cc",
  },
  addendumText: { color: "#446622", paddingLeft: 8 },
  foreignLanguageText: { fontStyle: "italic", color: "#3c5a3c" },
  diagramContainer: {
    height: 120,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#99836a",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 8,
    backgroundColor: "#ebdcb9",
    width: "100%",
  },
  diagramLabel: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    color: "#6d5339",
  },
  initialRow: { flexDirection: "row", marginBottom: 4, width: "100%" },
  initialBox: {
    borderWidth: 2,
    borderColor: "#9b2217",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  initialChar: { color: "#9b2217", fontWeight: "bold", textAlign: "center" },
  expansionToken: { color: "#804000", fontStyle: "italic", textDecorationLine: "underline", fontWeight: "600" },
  superscriptToken: { fontSize: 10, lineHeight: 14 },
  deletionToken: { color: "#aaa", textDecorationLine: "line-through" },
  insertionToken: { backgroundColor: "#d1e7dd", color: "#0f5132", borderRadius: 2 },
  calderonToken: { color: "#9b2217", fontWeight: "bold" },
  blankToken: { color: "#99836a" },
  blankFootnote: { fontSize: 10, fontStyle: "italic", color: "#6d5339" },
  otioseToken: { color: "#8b6914", fontWeight: "600" },
  alternateHandText: { color: "#553377", fontWeight: "500" },
  handSuperIndicator: { fontSize: 9, color: "#775599", fontWeight: "bold" },
  sibilantText: { color: "#5a3d1a", fontWeight: "600" },
  diacriticResolvedText: { color: "#1a446c" },
  nestedRubricText: { fontWeight: "700" },
  scribalPunctuationToken: { color: "#6d5339", fontWeight: "600" },
  catchwordText: { textAlign: "right", fontStyle: "italic", fontSize: 13, color: "#6d5339", marginTop: 12, width: "100%" },
  signatureText: { fontStyle: "italic", fontSize: 12, color: "#888", marginTop: 4, width: "100%" },
  statStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 8,
    backgroundColor: "rgba(33,13,11,0.9)",
    padding: 12,
  },
  stat: { color: "#dfcba5", fontSize: 12, fontWeight: "bold" },
});
