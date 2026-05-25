/**
 * Expo SDK 54+ deprecates the default `expo-file-system` entry for legacy async APIs.
 * On web, the legacy native module omits directory APIs — this module supplies safe shims.
 * @see https://docs.expo.dev/versions/latest/sdk/filesystem/
 */
import { Platform } from "react-native";
import * as Legacy from "expo-file-system/legacy";

export const EncodingType = Legacy.EncodingType;

const IS_WEB = Platform.OS === "web";

export const WEB_VIRTUAL_ROOT = "expo-web-fs://scriptorium/";

const webReadableByVirtualUri = new Map<string, string>();

export const documentDirectory: string | null = IS_WEB ? WEB_VIRTUAL_ROOT : Legacy.documentDirectory;
export const cacheDirectory: string | null = IS_WEB ? WEB_VIRTUAL_ROOT : Legacy.cacheDirectory;
export const bundleDirectory: string | null = Legacy.bundleDirectory;

export function isWebFileSystemShim(): boolean {
  return IS_WEB;
}

export function resolveStoredFileUri(uri: string): string {
  if (!IS_WEB) return uri;
  return webReadableByVirtualUri.get(uri) ?? uri;
}

function isFetchableUri(uri: string): boolean {
  return /^(https?|blob|data):/i.test(uri);
}

function isVirtualUri(uri: string): boolean {
  return uri.startsWith(WEB_VIRTUAL_ROOT);
}

async function readFetchableUri(
  uri: string,
  encoding?: (typeof EncodingType)[keyof typeof EncodingType],
): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read structural location tracking payload: ${response.status}`);
  }

  if (encoding === EncodingType.Base64) {
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunks: string[] = [];
    const chunkSize = 0xffff;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
    }
    return btoa(chunks.join(""));
  }
  return response.text();
}

export async function makeDirectoryAsync(
  fileUri: string,
  options: Legacy.MakeDirectoryOptions = {},
): Promise<void> {
  if (IS_WEB) return;
  return Legacy.makeDirectoryAsync(fileUri, options);
}

export async function getInfoAsync(
  fileUri: string,
  options?: Legacy.InfoOptions,
): Promise<Legacy.FileInfo> {
  if (IS_WEB) {
    const readable = resolveStoredFileUri(fileUri);
    if (readable !== fileUri || isFetchableUri(fileUri)) {
      return { exists: true, isDirectory: false, uri: fileUri };
    }
    if (isVirtualUri(fileUri) && fileUri.endsWith("/")) {
      return { exists: true, isDirectory: true, uri: fileUri };
    }
    return { exists: false, isDirectory: false };
  }
  return Legacy.getInfoAsync(fileUri, options);
}

export async function readAsStringAsync(
  fileUri: string,
  options: Legacy.ReadingOptions = {},
): Promise<string> {
  if (IS_WEB) {
    const readable = resolveStoredFileUri(fileUri);
    if (isFetchableUri(readable)) {
      return readFetchableUri(readable, options.encoding);
    }
    throw new Error(`Platform filesystem missing file structure map target: ${fileUri}`);
  }
  return Legacy.readAsStringAsync(fileUri, options);
}

export async function writeAsStringAsync(
  fileUri: string,
  contents: string,
  options: Legacy.WritingOptions = {},
): Promise<void> {
  if (IS_WEB) {
    const priorUrl = webReadableByVirtualUri.get(fileUri);
    if (priorUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(priorUrl);
    }

    const mime =
      options.encoding === EncodingType.Base64
        ? "application/octet-stream"
        : "application/json;charset=utf-8";
    let body: BlobPart = contents;
    if (options.encoding === EncodingType.Base64) {
      body = Uint8Array.from(atob(contents), (c) => c.charCodeAt(0));
    }

    const blob = new Blob([body], { type: mime });
    webReadableByVirtualUri.set(fileUri, URL.createObjectURL(blob));
    return;
  }
  return Legacy.writeAsStringAsync(fileUri, contents, options);
}

export async function copyAsync(options: Legacy.RelocatingOptions): Promise<void> {
  if (IS_WEB) {
    const targetUrl = webReadableByVirtualUri.get(options.from);
    if (targetUrl) webReadableByVirtualUri.set(options.to, targetUrl);
    return;
  }
  return Legacy.copyAsync(options);
}

export async function moveAsync(options: Legacy.RelocatingOptions): Promise<void> {
  if (IS_WEB) {
    await copyAsync(options);
    webReadableByVirtualUri.delete(options.from);
    return;
  }
  return Legacy.moveAsync(options);
}

export async function deleteAsync(
  fileUri: string,
  options: Legacy.DeletingOptions = {},
): Promise<void> {
  if (IS_WEB) {
    const blobUrl = webReadableByVirtualUri.get(fileUri);
    if (blobUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrl);
    }
    webReadableByVirtualUri.delete(fileUri);
    return;
  }
  return Legacy.deleteAsync(fileUri, options);
}

export {
  downloadAsync,
  uploadAsync,
  createDownloadResumable,
  createUploadTask,
  getContentUriAsync,
  readDirectoryAsync,
  getFreeDiskStorageAsync,
  getTotalDiskCapacityAsync,
  StorageAccessFramework,
} from "expo-file-system/legacy";
