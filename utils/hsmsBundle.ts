import type { ScriptoriumWorkspace } from "@/constants/manuscript";
import * as FileSystem from "@/utils/expoFileSystem";
import { copyFigureIntoWorkspace, ensureWorkspaceDirectories } from "./figureAssetStorage";
import { createWorkspace, persistWorkspace } from "./scriptoriumWorkspace";

export const HSMS_BUNDLE_FORMAT = "hsms-scriptorium-bundle/1";

export interface HsmsBundleManifest {
  format: typeof HSMS_BUNDLE_FORMAT;
  exportedAt: string;
  workspace: Omit<ScriptoriumWorkspace, "assetMap" | "folioBackgrounds"> & {
    assetMap: Record<string, string>;
    folioBackgrounds?: Record<string, string>;
  };
}

type EncodedAsset = { mime: string; base64: string };

export interface HsmsBundleFile {
  manifest: HsmsBundleManifest;
  assets: Record<string, EncodedAsset>;
  folioBackgrounds: Record<string, EncodedAsset>;
}

const RE_MIME_PNG = /image\/png/i;
const RE_MIME_WEBP = /image\/webp/i;
const RE_SAN_FILE_KEY = /[^a-zA-Z0-9_-]+/g;

function extensionFromMime(mime: string): string {
  if (RE_MIME_PNG.test(mime)) return ".png";
  if (RE_MIME_WEBP.test(mime)) return ".webp";
  return ".jpg";
}

async function readFileAsBase64(uri: string): Promise<{ mime: string; base64: string }> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const lower = uri.toLowerCase();
  let mime = "image/jpeg";
  if (lower.endsWith(".png")) {
    mime = "image/png";
  } else if (lower.endsWith(".webp")) {
    mime = "image/webp";
  }
  return { mime, base64 };
}

async function writeBase64Asset(
  workspaceId: string,
  assetKey: string,
  encoded: EncodedAsset,
  subdir: "figures" | "folios",
): Promise<string> {
  await ensureWorkspaceDirectories(workspaceId);
  const root = `${FileSystem.documentDirectory ?? ""}scriptorium/${workspaceId}/${subdir}/`;
  const dest = `${root}${assetKey.replace(RE_SAN_FILE_KEY, "_")}${extensionFromMime(encoded.mime)}`;
  await FileSystem.writeAsStringAsync(dest, encoded.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

/** Builds a portable JSON bundle (`.hsms`) with embedded base64 assets. */
export async function buildHsmsBundle(workspace: ScriptoriumWorkspace): Promise<string> {
  const assets: Record<string, EncodedAsset> = {};
  const entries = Object.entries(workspace.assetMap);
  for (let i = 0; i < entries.length; i++) {
    const [figureId, uri] = entries[i];
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      assets[figureId] = await readFileAsBase64(uri);
    }
  }

  const folioBackgrounds: Record<string, EncodedAsset> = {};
  const bgEntries = Object.entries(workspace.folioBackgrounds ?? {});
  for (let i = 0; i < bgEntries.length; i++) {
    const [folioId, uri] = bgEntries[i];
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      folioBackgrounds[folioId] = await readFileAsBase64(uri);
    }
  }

  const bundle: HsmsBundleFile = {
    manifest: {
      format: HSMS_BUNDLE_FORMAT,
      exportedAt: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        manuscriptTitle: workspace.manuscriptTitle,
        sourceFileName: workspace.sourceFileName,
        transcriptionText: workspace.transcriptionText,
        assetMap: Object.fromEntries(Object.keys(assets).map((k) => [k, `assets/${k}`])),
        folioBackgrounds: Object.fromEntries(
          Object.keys(folioBackgrounds).map((k) => [k, `folios/${k}`]),
        ),
        freePlacements: workspace.freePlacements,
        createdAt: workspace.createdAt,
        lastModified: workspace.lastModified,
      },
    },
    assets,
    folioBackgrounds,
  };

  return JSON.stringify(bundle);
}

export async function exportHsmsBundleToFile(workspace: ScriptoriumWorkspace): Promise<string> {
  const json = await buildHsmsBundle(workspace);
  const safeTitle = workspace.manuscriptTitle.replace(RE_SAN_FILE_KEY, "_").slice(0, 48);
  const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}export_${safeTitle}_${Date.now()}.hsms`;
  await FileSystem.writeAsStringAsync(dest, json, { encoding: FileSystem.EncodingType.UTF8 });
  return dest;
}

export function parseHsmsBundleJson(json: string): HsmsBundleFile {
  const parsed = JSON.parse(json) as HsmsBundleFile;
  if (parsed?.manifest?.format !== HSMS_BUNDLE_FORMAT) {
    throw new Error("Unsupported or unrecognized external .hsms payload mapping profile.");
  }
  return parsed;
}

/** Restores workspace from a `.hsms` bundle file URI. */
export async function importHsmsBundleFromUri(uri: string): Promise<ScriptoriumWorkspace> {
  const json = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  const bundle = parseHsmsBundleJson(json);
  const m = bundle.manifest.workspace;

  const workspace = createWorkspace({
    transcriptionText: m.transcriptionText,
    manuscriptTitle: m.manuscriptTitle,
    sourceFileName: m.sourceFileName,
  });

  const assetMap: Record<string, string> = {};
  const assetKeys = Object.keys(bundle.assets);
  for (let i = 0; i < assetKeys.length; i++) {
    const figureId = assetKeys[i];
    assetMap[figureId] = await writeBase64Asset(workspace.id, figureId, bundle.assets[figureId], "figures");
  }

  const folioBackgrounds: Record<string, string> = {};
  const bgKeys = Object.keys(bundle.folioBackgrounds ?? {});
  for (let i = 0; i < bgKeys.length; i++) {
    const folioId = bgKeys[i];
    folioBackgrounds[folioId] = await writeBase64Asset(
      workspace.id,
      `bg_${folioId}`,
      bundle.folioBackgrounds[folioId],
      "folios",
    );
  }

  const restored: ScriptoriumWorkspace = {
    ...workspace,
    assetMap,
    folioBackgrounds: Object.keys(folioBackgrounds).length > 0 ? folioBackgrounds : undefined,
    freePlacements: m.freePlacements,
    lastModified: new Date().toISOString(),
  };

  await persistWorkspace(restored);
  return restored;
}

/** Re-encode a picked image into workspace storage (used when copying from picker URI). */
export async function importFigureFromPickerUri(
  workspaceId: string,
  figureId: string,
  sourceUri: string,
): Promise<string> {
  return copyFigureIntoWorkspace(workspaceId, figureId, sourceUri);
}
