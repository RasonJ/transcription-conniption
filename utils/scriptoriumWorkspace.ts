import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ScriptoriumWorkspace,
  WorkspaceIndex,
  WorkspaceIndexEntry,
} from "../constants/manuscript";
import { deleteFigureAsset, ensureWorkspaceDirectories } from "./figureAssetStorage";
import { normalizeMetadataPlainText } from "./metadataText";

/** Lightweight metadata index — no transcription blobs. */
export const WORKSPACE_INDEX_KEY = "hsms.scriptorium.index.v1";
/** Legacy monolithic index (migrated automatically on first load). */
export const LEGACY_WORKSPACE_INDEX_KEY = "hsms.scriptorium.workspaces.v1";
const WORKSPACE_SHARD_PREFIX = "hsms.scriptorium.workspace.";

const DEFAULT_DEMO_TITLE = "Pedro Nunes \u2014 Tratado da Sphera";

export function workspaceShardKey(id: string): string {
  return `${WORKSPACE_SHARD_PREFIX}${id}`;
}

export function newWorkspaceId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function inferManuscriptTitle(transcriptionText: string, sourceFileName?: string): string {
  const rmkTitles: string[] = [];
  const lines = transcriptionText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\{RMK:\s*([^}|]+)/);
    if (match) {
      const candidate = normalizeMetadataPlainText(match[1].replace(/\.\s*$/, "").trim());
      if (candidate.length > 0 && candidate.length < 120 && !candidate.includes("|")) {
        rmkTitles.push(candidate);
      }
    }
  }
  if (rmkTitles.length >= 2) return rmkTitles[1];
  if (rmkTitles.length === 1) return rmkTitles[0];
  if (sourceFileName) {
    return sourceFileName.replace(/\.txt$/i, "").replace(/_/g, " ");
  }
  return "Untitled manuscript";
}

export function createWorkspace(options: {
  transcriptionText: string;
  manuscriptTitle?: string;
  sourceFileName?: string;
}): ScriptoriumWorkspace {
  const now = new Date().toISOString();
  const title =
    options.manuscriptTitle ??
    inferManuscriptTitle(options.transcriptionText, options.sourceFileName);
  return {
    id: newWorkspaceId(),
    manuscriptTitle: title,
    sourceFileName: options.sourceFileName,
    transcriptionText: options.transcriptionText,
    assetMap: {},
    createdAt: now,
    lastModified: now,
  };
}

export function touchWorkspace(
  workspace: ScriptoriumWorkspace,
  patch: Partial<
    Pick<
      ScriptoriumWorkspace,
      | "transcriptionText"
      | "manuscriptTitle"
      | "sourceFileName"
      | "assetMap"
      | "folioBackgrounds"
      | "freePlacements"
    >
  >,
): ScriptoriumWorkspace {
  return {
    ...workspace,
    ...patch,
    lastModified: new Date().toISOString(),
  };
}

export function workspaceToIndexEntry(workspace: ScriptoriumWorkspace): WorkspaceIndexEntry {
  return {
    id: workspace.id,
    manuscriptTitle: workspace.manuscriptTitle,
    sourceFileName: workspace.sourceFileName,
    createdAt: workspace.createdAt,
    lastModified: workspace.lastModified,
  };
}

function isFullWorkspace(value: unknown): value is ScriptoriumWorkspace {
  return (
    typeof value === "object" &&
    value !== null &&
    "transcriptionText" in value &&
    typeof (value as ScriptoriumWorkspace).transcriptionText === "string" &&
    "id" in value &&
    typeof (value as ScriptoriumWorkspace).id === "string"
  );
}

function emptyIndex(): WorkspaceIndex {
  return { activeWorkspaceId: "", workspaces: {} };
}

export async function saveWorkspaceShard(workspace: ScriptoriumWorkspace): Promise<void> {
  await AsyncStorage.setItem(workspaceShardKey(workspace.id), JSON.stringify(workspace));
}

export async function getWorkspaceShard(id: string): Promise<ScriptoriumWorkspace | null> {
  if (!id) return null;
  const raw = await AsyncStorage.getItem(workspaceShardKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScriptoriumWorkspace;
  } catch {
    return null;
  }
}

async function migrateLegacyIndexIfNeeded(): Promise<void> {
  const existing = await AsyncStorage.getItem(WORKSPACE_INDEX_KEY);
  if (existing) return;

  const legacyRaw = await AsyncStorage.getItem(LEGACY_WORKSPACE_INDEX_KEY);
  if (!legacyRaw) return;

  try {
    const legacy = JSON.parse(legacyRaw) as {
      activeWorkspaceId?: string;
      workspaces?: Record<string, ScriptoriumWorkspace>;
    };
    const migrated = emptyIndex();
    migrated.activeWorkspaceId = legacy.activeWorkspaceId ?? "";

    const entries = Object.entries(legacy.workspaces ?? {});
    for (let i = 0; i < entries.length; i++) {
      const [id, ws] = entries[i];
      if (!isFullWorkspace(ws)) continue;
      await saveWorkspaceShard(ws);
      migrated.workspaces[id] = workspaceToIndexEntry(ws);
    }

    await AsyncStorage.setItem(WORKSPACE_INDEX_KEY, JSON.stringify(migrated));
    await AsyncStorage.removeItem(LEGACY_WORKSPACE_INDEX_KEY);
  } catch {
    /* keep legacy key if migration fails */
  }
}

async function repairBloatedIndex(index: WorkspaceIndex): Promise<WorkspaceIndex> {
  let repaired = false;
  const next: WorkspaceIndex = {
    activeWorkspaceId: index.activeWorkspaceId,
    workspaces: {},
  };

  const entries = Object.entries(index.workspaces);
  for (let i = 0; i < entries.length; i++) {
    const [id, entry] = entries[i];
    if (isFullWorkspace(entry)) {
      await saveWorkspaceShard(entry);
      next.workspaces[id] = workspaceToIndexEntry(entry);
      repaired = true;
    } else if (entry && typeof entry === "object" && "id" in entry) {
      next.workspaces[id] = entry as WorkspaceIndexEntry;
    }
  }

  if (repaired) {
    await saveWorkspaceIndex(next);
  }
  return repaired ? next : index;
}

export async function loadWorkspaceIndex(): Promise<WorkspaceIndex> {
  await migrateLegacyIndexIfNeeded();

  const raw = await AsyncStorage.getItem(WORKSPACE_INDEX_KEY);
  if (!raw) return emptyIndex();

  try {
    const parsed = JSON.parse(raw) as WorkspaceIndex;
    if (parsed && typeof parsed === "object" && parsed.workspaces && typeof parsed.workspaces === "object") {
      const index: WorkspaceIndex = {
        activeWorkspaceId: parsed.activeWorkspaceId ?? "",
        workspaces: parsed.workspaces ?? {},
      };
      return repairBloatedIndex(index);
    }
  } catch {
    /* fall through */
  }
  return emptyIndex();
}

export async function saveWorkspaceIndex(index: WorkspaceIndex): Promise<void> {
  const strippedWorkspaces: Record<string, WorkspaceIndexEntry> = {};
  const entries = Object.entries(index.workspaces);

  for (let i = 0; i < entries.length; i++) {
    const [id, ws] = entries[i];
    if (isFullWorkspace(ws)) {
      strippedWorkspaces[id] = workspaceToIndexEntry(ws);
    } else {
      strippedWorkspaces[id] = ws;
    }
  }

  await AsyncStorage.setItem(
    WORKSPACE_INDEX_KEY,
    JSON.stringify({
      activeWorkspaceId: index.activeWorkspaceId,
      workspaces: strippedWorkspaces,
    }),
  );
}

export async function getActiveWorkspace(index: WorkspaceIndex): Promise<ScriptoriumWorkspace | null> {
  if (!index.activeWorkspaceId) return null;
  return getWorkspaceShard(index.activeWorkspaceId);
}

export async function persistWorkspace(workspace: ScriptoriumWorkspace): Promise<WorkspaceIndex> {
  await saveWorkspaceShard(workspace);

  const index = await loadWorkspaceIndex();
  index.workspaces[workspace.id] = workspaceToIndexEntry(workspace);
  index.activeWorkspaceId = workspace.id;
  await saveWorkspaceIndex(index);
  return index;
}

export async function setActiveWorkspace(workspaceId: string): Promise<ScriptoriumWorkspace | null> {
  const shard = await getWorkspaceShard(workspaceId);
  if (!shard) return null;

  const index = await loadWorkspaceIndex();
  index.activeWorkspaceId = workspaceId;
  await saveWorkspaceIndex(index);
  return shard;
}

export async function removeFigureFromWorkspace(
  workspace: ScriptoriumWorkspace,
  figureId: string,
): Promise<ScriptoriumWorkspace> {
  const uri = workspace.assetMap[figureId];
  await deleteFigureAsset(uri);
  const assetMap = { ...workspace.assetMap };
  delete assetMap[figureId];

  const updated = touchWorkspace(workspace, { assetMap });
  await saveWorkspaceShard(updated);

  const index = await loadWorkspaceIndex();
  if (index.workspaces[workspace.id]) {
    index.workspaces[workspace.id] = workspaceToIndexEntry(updated);
    await saveWorkspaceIndex(index);
  }

  return updated;
}

export async function bootstrapDefaultWorkspace(
  defaultTranscription: string,
  defaultSourceFileName = "Nunes_Demo.txt",
): Promise<ScriptoriumWorkspace> {
  const workspace = createWorkspace({
    transcriptionText: defaultTranscription,
    manuscriptTitle: DEFAULT_DEMO_TITLE,
    sourceFileName: defaultSourceFileName,
  });
  await ensureWorkspaceDirectories(workspace.id);
  await persistWorkspace(workspace);
  return workspace;
}

export async function loadOrCreateActiveWorkspace(
  defaultTranscription: string,
): Promise<ScriptoriumWorkspace> {
  const index = await loadWorkspaceIndex();
  let workspace = await getActiveWorkspace(index);

  if (!workspace) {
    const keys = Object.keys(index.workspaces);
    if (keys.length > 0) {
      workspace = await getWorkspaceShard(keys[0]);
      if (workspace) {
        index.activeWorkspaceId = workspace.id;
        await saveWorkspaceIndex(index);
      }
    }
  }

  if (!workspace) {
    workspace = await bootstrapDefaultWorkspace(defaultTranscription);
  }

  await ensureWorkspaceDirectories(workspace.id);
  return workspace;
}
