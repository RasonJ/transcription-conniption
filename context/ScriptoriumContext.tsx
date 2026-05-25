import type {
  FacsimilePlacement,
  ManuscriptRegistry,
  ParsedManuscript,
  ScriptoriumWorkspace,
} from "@/constants/manuscript";
import { DEFAULT_DEMO } from "@/constants/demoTranscriptions";
import { BLANK_SCRIPTORIUM_TEMPLATE } from "@/constants/workspaceTemplates";
import type { BatchProcessResult } from "@/utils/batchProcessor";
import { compileManuscriptTree } from "@/utils/compiler";
import { copyFigureIntoWorkspace, copyFolioBackgroundIntoWorkspace } from "@/utils/figureAssetStorage";
import { exportHsmsBundleToFile, importHsmsBundleFromUri } from "@/utils/hsmsBundle";
import * as FileSystem from "@/utils/expoFileSystem";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import {
  createWorkspace,
  inferManuscriptTitle,
  loadOrCreateActiveWorkspace,
  persistWorkspace,
  removeFigureFromWorkspace,
  touchWorkspace,
} from "@/utils/scriptoriumWorkspace";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Platform, Share } from "react-native";

const PARSE_DEBOUNCE_MS = 400;

const EMPTY_PARSED: ParsedManuscript = {
  metadata: { author: "", title: "", imprint: {}, witness: {} },
  folios: [],
  stats: { totalWords: 0, totalLines: 0, rubricCount: 0, glossCount: 0 },
};

function registryKeyForWorkspace(ws: ScriptoriumWorkspace): string {
  return ws.sourceFileName ?? "Active_Witness.txt";
}

function buildRegistryEntry(rawText: string, uploadedImages: Record<string, string>) {
  return {
    rawText,
    parsedTree: compileManuscriptTree(rawText),
    uploadedImages: { ...uploadedImages },
  };
}

export type ScriptoriumContextValue = {
  workspace: ScriptoriumWorkspace | null;
  workspaceReady: boolean;
  workspaceTitle: string;
  setWorkspaceTitle: (title: string) => void;
  commitWorkspaceTitle: () => void;
  registry: ManuscriptRegistry;
  activeFileName: string | null;
  setActiveFile: (name: string) => void;
  localEditorBuffer: string;
  setLocalEditorBuffer: (text: string) => void;
  editorBuffer: string;
  debouncedText: string;
  commitEditorBuffer: () => void;
  isParsing: boolean;
  isCompiling: boolean;
  compilationStatus: string;
  parsedManuscript: ParsedManuscript;
  uploadedImages: Record<string, string>;
  applyTranscription: (
    source: string,
    options?: { sourceFileName?: string; manuscriptTitle?: string },
  ) => void;
  updateActiveText: (text: string) => void;
  updateImageUri: (figureId: string, localUri: string) => Promise<void>;
  removeImageUri: (figureId: string) => Promise<void>;
  loadBatch: (result: BatchProcessResult) => void;
  hydrateFromWorkspace: (workspace: ScriptoriumWorkspace) => void;
  createNewWorkspace: () => Promise<void>;
  importTextFile: () => Promise<void>;
  importHsmsBundle: () => Promise<void>;
  exportHsmsBundle: () => Promise<void>;
  loadSample: (sample: string, sampleName: string) => Promise<void>;
  persistWorkspacePatch: (
    patch: Partial<
      Pick<
        ScriptoriumWorkspace,
        "assetMap" | "folioBackgrounds" | "freePlacements" | "transcriptionText" | "manuscriptTitle"
      >
    >,
  ) => Promise<void>;
  addFreePlacement: (placement: FacsimilePlacement) => Promise<void>;
  setFolioBackground: (folioId: string, sourceUri: string) => Promise<void>;
};

const ScriptoriumContext = createContext<ScriptoriumContextValue | null>(null);

export function ScriptoriumProvider({
  children,
  defaultText = DEFAULT_DEMO,
}: {
  children: ReactNode;
  defaultText?: string;
}) {
  const workspaceHydratedRef = useRef(false);
  const [workspace, setWorkspace] = useState<ScriptoriumWorkspace | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [registry, setRegistry] = useState<ManuscriptRegistry>({});
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [editorBuffer, setEditorBuffer] = useState("");
  const [localEditorBuffer, setLocalEditorBuffer] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [uploadedImages, setUploadedImages] = useState<Record<string, string>>({});
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationStatus, setCompilationStatus] = useState("");

  const isParsing = localEditorBuffer !== debouncedText;

  const yieldToUi = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 32)),
    [],
  );

  const parsedManuscript = useMemo(
    () => (debouncedText ? compileManuscriptTree(debouncedText) : EMPTY_PARSED),
    [debouncedText],
  );

  const syncRegistryEntry = useCallback(
    (fileName: string, rawText: string, images: Record<string, string>) => {
      setRegistry((prev) => ({
        ...prev,
        [fileName]: buildRegistryEntry(rawText, images),
      }));
    },
    [],
  );

  const hydrateFromWorkspace = useCallback(
    (ws: ScriptoriumWorkspace) => {
      workspaceHydratedRef.current = true;
      const key = registryKeyForWorkspace(ws);
      setWorkspace(ws);
      setWorkspaceTitle(ws.manuscriptTitle);
      setEditorBuffer(ws.transcriptionText);
      setLocalEditorBuffer(ws.transcriptionText);
      setDebouncedText(ws.transcriptionText);
      setUploadedImages({ ...ws.assetMap });
      setActiveFileName(key);
      syncRegistryEntry(key, ws.transcriptionText, ws.assetMap);
      setWorkspaceReady(true);
    },
    [syncRegistryEntry],
  );

  const applyTranscription = useCallback(
    (source: string, options?: { sourceFileName?: string; manuscriptTitle?: string }) => {
      const fileName = options?.sourceFileName ?? workspace?.sourceFileName ?? "Active_Witness.txt";
      setEditorBuffer(source);
      setLocalEditorBuffer(source);
      setDebouncedText(source);
      setActiveFileName(fileName);
      syncRegistryEntry(fileName, source, uploadedImages);

      if (!workspace) {
        return;
      }
      const updated = touchWorkspace(workspace, {
        transcriptionText: source,
        sourceFileName: fileName,
        manuscriptTitle:
          options?.manuscriptTitle ??
          inferManuscriptTitle(source, fileName),
      });
      setWorkspace(updated);
      setWorkspaceTitle(updated.manuscriptTitle);
      void persistWorkspace(updated);
    },
    [workspace, uploadedImages, syncRegistryEntry],
  );

  const updateActiveText = useCallback(
    (text: string) => {
      applyTranscription(text, { sourceFileName: activeFileName ?? undefined });
    },
    [applyTranscription, activeFileName],
  );

  const commitEditorBuffer = useCallback(() => {
    if (localEditorBuffer !== editorBuffer) {
      setEditorBuffer(localEditorBuffer);
    }
  }, [localEditorBuffer, editorBuffer]);

  const setActiveFile = useCallback(
    (name: string) => {
      const entry = registry[name];
      if (!entry) {
        return;
      }
      setActiveFileName(name);
      applyTranscription(entry.rawText, { sourceFileName: name });
      setUploadedImages({ ...entry.uploadedImages });
      if (workspace) {
        const updated = touchWorkspace(workspace, {
          transcriptionText: entry.rawText,
          sourceFileName: name,
          assetMap: { ...entry.uploadedImages },
          manuscriptTitle: inferManuscriptTitle(entry.rawText, name),
        });
        setWorkspace(updated);
        setWorkspaceTitle(updated.manuscriptTitle);
        void persistWorkspace(updated);
      }
    },
    [registry, applyTranscription, workspace],
  );

  const persistWorkspacePatch = useCallback(
    async (
      patch: Partial<
        Pick<
          ScriptoriumWorkspace,
          "assetMap" | "folioBackgrounds" | "freePlacements" | "transcriptionText" | "manuscriptTitle"
        >
      >,
    ) => {
      if (!workspace) {
        return;
      }
      const updated = touchWorkspace(workspace, patch);
      setWorkspace(updated);
      if (patch.assetMap) {
        setUploadedImages({ ...patch.assetMap });
      }
      if (patch.manuscriptTitle) {
        setWorkspaceTitle(updated.manuscriptTitle);
      }
      const key = registryKeyForWorkspace(updated);
      syncRegistryEntry(
        key,
        updated.transcriptionText,
        patch.assetMap ?? updated.assetMap,
      );
      await persistWorkspace(updated);
    },
    [workspace, syncRegistryEntry],
  );

  const updateImageUri = useCallback(
    async (figureId: string, localUri: string) => {
      if (!workspace) {
        return;
      }
      const next = { ...uploadedImages, [figureId]: localUri };
      setUploadedImages(next);
      await persistWorkspacePatch({ assetMap: next });
    },
    [workspace, uploadedImages, persistWorkspacePatch],
  );

  const removeImageUri = useCallback(
    async (figureId: string) => {
      if (!workspace) {
        return;
      }
      const updated = await removeFigureFromWorkspace(workspace, figureId);
      const next = { ...uploadedImages };
      delete next[figureId];
      setUploadedImages(next);
      setWorkspace(updated);
      await persistWorkspace(updated);
      syncRegistryEntry(registryKeyForWorkspace(updated), updated.transcriptionText, next);
    },
    [workspace, uploadedImages, syncRegistryEntry],
  );

  const loadBatch = useCallback(
    (result: BatchProcessResult) => {
      setRegistry((prev) => {
        const next = { ...prev };
        for (const [name, tree] of Object.entries(result.compiledTrees)) {
          next[name] = {
            rawText: result.rawTexts[name],
            parsedTree: tree,
            uploadedImages: {},
          };
        }
        return next;
      });
      const first = Object.keys(result.compiledTrees)[0];
      if (first) {
        applyTranscription(result.rawTexts[first], { sourceFileName: first });
      }
    },
    [applyTranscription],
  );

  const commitWorkspaceTitle = useCallback(() => {
    if (!workspace) {
      return;
    }
    const trimmed = workspaceTitle.trim() || workspace.manuscriptTitle;
    if (trimmed === workspace.manuscriptTitle) {
      return;
    }
    void persistWorkspacePatch({ manuscriptTitle: trimmed });
  }, [workspace, workspaceTitle, persistWorkspacePatch]);

  useEffect(() => {
    async function initializeWorkspace() {
      try {
        const activeWs = await loadOrCreateActiveWorkspace(defaultText);
        hydrateFromWorkspace(activeWs);
      } catch (err) {
        console.warn("Failed to load workspace shards safely from platform storage", err);
      }
    }
    void initializeWorkspace();
  }, [defaultText, hydrateFromWorkspace]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedText(editorBuffer), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [editorBuffer]);

  useEffect(() => {
    if (!workspaceReady || !workspace) {
      return;
    }
    if (workspace.transcriptionText === debouncedText) {
      return;
    }
    const updated = touchWorkspace(workspace, { transcriptionText: debouncedText });
    setWorkspace(updated);
    syncRegistryEntry(registryKeyForWorkspace(updated), debouncedText, updated.assetMap);
    void persistWorkspace(updated);
  }, [debouncedText, workspace, workspaceReady, syncRegistryEntry]);

  useEffect(() => {
    setLocalEditorBuffer(editorBuffer);
  }, [workspace?.id]);

  const createNewWorkspace = useCallback(async () => {
    const ws = createWorkspace({
      transcriptionText: BLANK_SCRIPTORIUM_TEMPLATE,
      sourceFileName: `Workspace_${Date.now().toString(36).slice(-6)}.txt`,
      manuscriptTitle: "New Scriptorium Workspace",
    });
    await persistWorkspace(ws);
    hydrateFromWorkspace(ws);
    await Haptics.selectionAsync();
  }, [hydrateFromWorkspace]);

  const importTextFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/*", "application/octet-stream"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setIsCompiling(true);
      setCompilationStatus("Reading transcription file…");
      await yieldToUi();

      const fileName = result.assets[0].name;
      const fileText = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setCompilationStatus("Compiling manuscript layout…");
      await yieldToUi();

      applyTranscription(fileText, { sourceFileName: fileName });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn("Document import failed", error);
      Alert.alert("Import failed", "Please try a plain-text HSMS transcription file.");
    } finally {
      setIsCompiling(false);
      setCompilationStatus("");
    }
  }, [applyTranscription, yieldToUi]);

  const loadSample = useCallback(
    async (sample: string, sampleName: string) => {
      applyTranscription(sample, { sourceFileName: `${sampleName}.txt` });
      await Haptics.selectionAsync();
    },
    [applyTranscription],
  );

  const exportHsmsBundle = useCallback(async () => {
    if (!workspace) {
      return;
    }
    try {
      const path = await exportHsmsBundleToFile(workspace);
      const shareUri = resolveStoredFileUri(path);
      if (Platform.OS === "web") {
        await Share.share({ url: shareUri, title: `${workspace.manuscriptTitle}.hsms` });
      } else {
        await Share.share({ url: path, title: `${workspace.manuscriptTitle}.hsms` });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn("HSMS bundle export failed", error);
      Alert.alert("Export failed", "Could not build the .hsms fascicle bundle.");
    }
  }, [workspace]);

  const importHsmsBundle = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setIsCompiling(true);
      setCompilationStatus("Unpacking .hsms bundle…");
      await yieldToUi();

      const ws = await importHsmsBundleFromUri(result.assets[0].uri);
      setCompilationStatus("Loading witness registry…");
      await yieldToUi();
      hydrateFromWorkspace(ws);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn("HSMS bundle import failed", error);
      Alert.alert("Import failed", "Could not read this .hsms bundle file.");
    } finally {
      setIsCompiling(false);
      setCompilationStatus("");
    }
  }, [hydrateFromWorkspace, yieldToUi]);

  const addFreePlacement = useCallback(
    async (placement: FacsimilePlacement) => {
      if (!workspace) {
        return;
      }
      const freePlacements = [...(workspace.freePlacements ?? []), placement];
      await persistWorkspacePatch({ freePlacements });
    },
    [workspace, persistWorkspacePatch],
  );

  const setFolioBackground = useCallback(
    async (folioId: string, sourceUri: string) => {
      if (!workspace) {
        return;
      }
      const uri = await copyFolioBackgroundIntoWorkspace(workspace.id, folioId, sourceUri);
      const folioBackgrounds = { ...(workspace.folioBackgrounds ?? {}), [folioId]: uri };
      await persistWorkspacePatch({ folioBackgrounds });
    },
    [workspace, persistWorkspacePatch],
  );

  const value = useMemo<ScriptoriumContextValue>(
    () => ({
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
      editorBuffer,
      debouncedText,
      commitEditorBuffer,
      isParsing,
      isCompiling,
      compilationStatus,
      parsedManuscript,
      uploadedImages,
      applyTranscription,
      updateActiveText,
      updateImageUri,
      removeImageUri,
      loadBatch,
      hydrateFromWorkspace,
      createNewWorkspace,
      importTextFile,
      importHsmsBundle,
      exportHsmsBundle,
      loadSample,
      persistWorkspacePatch,
      addFreePlacement,
      setFolioBackground,
    }),
    [
      workspace,
      workspaceReady,
      workspaceTitle,
      commitWorkspaceTitle,
      registry,
      activeFileName,
      setActiveFile,
      localEditorBuffer,
      editorBuffer,
      debouncedText,
      commitEditorBuffer,
      isParsing,
      isCompiling,
      compilationStatus,
      parsedManuscript,
      uploadedImages,
      applyTranscription,
      updateActiveText,
      updateImageUri,
      removeImageUri,
      loadBatch,
      hydrateFromWorkspace,
      createNewWorkspace,
      importTextFile,
      importHsmsBundle,
      exportHsmsBundle,
      loadSample,
      persistWorkspacePatch,
      addFreePlacement,
      setFolioBackground,
    ],
  );

  return <ScriptoriumContext.Provider value={value}>{children}</ScriptoriumContext.Provider>;
}

export function useScriptorium(): ScriptoriumContextValue {
  const ctx = useContext(ScriptoriumContext);
  if (!ctx) {
    throw new Error("useScriptorium must be used within ScriptoriumProvider");
  }
  return ctx;
}
