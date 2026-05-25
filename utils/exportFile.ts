import {
  cacheDirectory,
  EncodingType,
  resolveStoredFileUri,
  writeAsStringAsync,
} from "@/utils/expoFileSystem";
import { PARCHMENT_BG } from "@/components/svgFacsimile/pageLayout";
import type { ManuscriptExportFormat } from "@/utils/exportFormats";
import { inferExportFormatFromFileName, mimeTypeForExportFormat } from "@/utils/exportFormats";
import { Platform, Share } from "react-native";

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle>;
  }
}

export type SaveExportOptions = {
  fileName: string;
  format?: ManuscriptExportFormat;
  mimeType?: string;
  dialogTitle?: string;
};

const RE_WIDTH_ATTR = /width\s*=\s*"(\d+)"/;
const RE_HEIGHT_ATTR = /height\s*=\s*"(\d+)"/;
const RE_ILLEGAL_CHAR = /[/\\?%*:|"<>]/g;

async function svgTextToRasterBase64(
  svgText: string,
  format: "png" | "jpeg" | "webp",
): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Raster conversion engine missing valid display viewport scope.");
  }

  const widthMatch = svgText.match(RE_WIDTH_ATTR);
  const heightMatch = svgText.match(RE_HEIGHT_ATTR);
  const width = widthMatch ? parseInt(widthMatch[1], 10) : 800;
  const height = heightMatch ? parseInt(heightMatch[1], 10) : 1200;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas layout mapping initialization failed."));
          return;
        }
        ctx.fillStyle = PARCHMENT_BG;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const mime =
          format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
        const dataUrl = canvas.toDataURL(mime, format === "jpeg" ? 0.92 : undefined);
        const base64 = dataUrl.split(",")[1];
        if (!base64) {
          reject(new Error("Canvas payload allocation failed text translation."));
          return;
        }
        resolve(base64);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Vector graphics canvas generation failed compilation rules."));
    };
    img.src = url;
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error("Binary decode not available.");
}

async function writeBinaryFile(uri: string, base64: string): Promise<void> {
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
}

/** Save via File System Access API when the browser supports it. Returns true if handled. */
export async function tryBrowserSaveFilePicker(
  contents: string,
  options: SaveExportOptions,
  rasterBase64?: string,
): Promise<boolean> {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.showSaveFilePicker) {
    return false;
  }

  const format = options.format ?? inferExportFormatFromFileName(options.fileName) ?? "txt";
  const mimeType = options.mimeType ?? mimeTypeForExportFormat(format);

  const handle = await window.showSaveFilePicker({
    suggestedName: options.fileName,
    types: [
      { description: "HSMS transcription", accept: { "text/plain": [".txt"] } },
      { description: "HTML facsimile", accept: { "text/html": [".html", ".htm"] } },
      { description: "SVG image", accept: { "image/svg+xml": [".svg"] } },
      { description: "PNG image", accept: { "image/png": [".png"] } },
      { description: "JPEG image", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
      { description: "WebP image", accept: { "image/webp": [".webp"] } },
    ],
    excludeAcceptAllOption: false,
  });

  const writable = await handle.createWritable();
  if (rasterBase64) {
    await writable.write(base64ToUint8Array(rasterBase64));
  } else {
    await writable.write(contents);
  }
  await writable.close();
  return true;
}

export async function saveExportFile(
  contents: string,
  options: SaveExportOptions,
): Promise<void> {
  const safeName = options.fileName.replace(RE_ILLEGAL_CHAR, "_");
  const format = options.format ?? inferExportFormatFromFileName(safeName) ?? "txt";
  let mimeType = options.mimeType ?? mimeTypeForExportFormat(format);

  const textPayload = contents;
  let binaryBase64: string | undefined;

  if (format === "png" || format === "jpeg" || format === "webp") {
    binaryBase64 = await svgTextToRasterBase64(contents, format);
    mimeType = mimeTypeForExportFormat(format);
  }

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.showSaveFilePicker) {
      try {
        const handled = await tryBrowserSaveFilePicker(textPayload, options, binaryBase64);
        if (handled) return;
      } catch {
        /* Fall back to anchor download if picker permissions fail */
      }
    }

    if (typeof document !== "undefined") {
      const bytes = binaryBase64 ? base64ToUint8Array(binaryBase64) : textPayload;
      const blob = new Blob([bytes as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }

    await Share.share({
      message:
        textPayload.length > 12000 ? `${textPayload.slice(0, 12000)}\n… [truncated]` : textPayload,
      title: options.dialogTitle ?? safeName,
    });
    return;
  }

  const dir = cacheDirectory;
  if (!dir) throw new Error("Writable layout cache destination targets missing.");

  const uri = `${dir}${safeName}`;
  if (binaryBase64) {
    await writeBinaryFile(uri, binaryBase64);
  } else {
    await writeAsStringAsync(uri, textPayload, { encoding: EncodingType.UTF8 });
  }

  await Share.share({
    url: resolveStoredFileUri(uri),
    title: options.dialogTitle ?? safeName,
  });
}

/** @deprecated Use saveExportFile */
export async function shareTextFile(
  contents: string,
  fileName: string,
  options?: { mimeType?: string; dialogTitle?: string },
): Promise<void> {
  await saveExportFile(contents, {
    fileName,
    mimeType: options?.mimeType,
    dialogTitle: options?.dialogTitle,
  });
}
