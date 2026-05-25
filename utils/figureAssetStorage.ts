import * as FileSystem from "@/utils/expoFileSystem";

const SCRIPTORIUM_ROOT = `${FileSystem.documentDirectory ?? ""}scriptorium/`;

function sanitizeFigureId(figureId: string): string {
  return figureId.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function extensionFromUri(uri: string): string {
  const match = uri.match(/\.(jpe?g|png|webp|gif|heic)(\?|$)/i);
  if (!match) {
    return ".jpg";
  }
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? ".jpg" : `.${ext}`;
}

export function workspaceRootDir(workspaceId: string): string {
  return `${SCRIPTORIUM_ROOT}${workspaceId}/`;
}

export function figureAssetPath(workspaceId: string, figureId: string, ext: string): string {
  return `${workspaceRootDir(workspaceId)}figures/${sanitizeFigureId(figureId)}${ext}`;
}

export async function ensureWorkspaceDirectories(workspaceId: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${workspaceRootDir(workspaceId)}figures/`, {
    intermediates: true,
  });
  await FileSystem.makeDirectoryAsync(`${workspaceRootDir(workspaceId)}folios/`, {
    intermediates: true,
  });
}

export function folioBackgroundPath(workspaceId: string, folioId: string, ext: string): string {
  const safe = folioId.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${workspaceRootDir(workspaceId)}folios/${safe}${ext}`;
}

export async function copyFolioBackgroundIntoWorkspace(
  workspaceId: string,
  folioId: string,
  sourceUri: string,
): Promise<string> {
  await ensureWorkspaceDirectories(workspaceId);
  const dest = folioBackgroundPath(workspaceId, folioId, extensionFromUri(sourceUri));
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

/** Copies a picked image into permanent app storage; returns the destination URI. */
export async function copyFigureIntoWorkspace(
  workspaceId: string,
  figureId: string,
  sourceUri: string,
): Promise<string> {
  await ensureWorkspaceDirectories(workspaceId);
  const dest = figureAssetPath(workspaceId, figureId, extensionFromUri(sourceUri));
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function deleteFigureAsset(uri: string | undefined): Promise<void> {
  if (!uri) {
    return;
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
