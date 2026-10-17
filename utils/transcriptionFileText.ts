/**
 * Extract plain HSMS / transcription text from Studio uploads.
 * Supported: .txt, .hsms (ASCII or scriptorium JSON bundle), .docx (OOXML via JSZip).
 * Legacy binary .doc is rejected with a clear convert-to-.docx/.txt message.
 *
 * Note: do not use `mammoth` here — its Node entry (`options-reader`) fails under Expo Metro.
 */
import JSZip from "jszip";
import { EncodingType, readAsStringAsync } from "@/utils/expoFileSystem";
import { HSMS_BUNDLE_FORMAT } from "@/utils/hsmsBundle";
import { isBundleV2 } from "@/utils/ingest/bundleV2";

const WORD_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_DOC_MIME = "application/msword";

export function isWordTranscriptionFile(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (mime === WORD_DOCX_MIME || mime === WORD_DOC_MIME) return true;
  return /\.(docx|doc)$/i.test(name);
}

export function isHsmsExtension(name?: string | null): boolean {
  return /\.hsms$/i.test(name ?? "");
}

/** Local transcription documents (bypass Azure). */
export function isTranscriptionDocumentFile(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (mime.startsWith("text/") || mime === "application/json") return true;
  if (isWordTranscriptionFile(file)) return true;
  if (isHsmsExtension(name)) return true;
  return /\.(txt|md|csv|tsv)$/i.test(name);
}

export function isLegacyBinaryWordDoc(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (/\.docx$/i.test(name) || mime === WORD_DOCX_MIME) return false;
  return /\.doc$/i.test(name) || mime === WORD_DOC_MIME;
}

/** Pull witness text out of a scriptorium `.hsms` JSON bundle when present. */
export function transcriptionTextFromHsmsPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isBundleV2(parsed)) {
      return parsed.manifest.witness.text ?? null;
    }
    const bundle = parsed as {
      manifest?: { format?: string; workspace?: { transcriptionText?: string } };
    };
    if (bundle.manifest?.format === HSMS_BUNDLE_FORMAT) {
      return bundle.manifest.workspace?.transcriptionText ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Extract raw paragraph text from Word OOXML `word/document.xml`. */
export function extractTextFromWordDocumentXml(xml: string): string {
  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paragraphs.map((paragraph) => {
    const runs = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) =>
      decodeXmlEntities(m[1]),
    );
    return runs.join("");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Word .docx is missing word/document.xml");
  }
  const xml = await docFile.async("string");
  const text = extractTextFromWordDocumentXml(xml);
  if (!text) {
    throw new Error("Word document contained no extractable text.");
  }
  return text;
}

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (typeof fetch === "function") {
    try {
      const res = await fetch(uri);
      if (res.ok) return await res.arrayBuffer();
    } catch {
      /* fall through to base64 */
    }
  }
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Read a local URI (DocumentPicker / cache) into transcription ASCII.
 */
export async function extractTranscriptionTextFromUri(
  uri: string,
  meta: { name?: string | null; mimeType?: string | null } = {},
): Promise<string> {
  const name = meta.name ?? uri;
  const mime = meta.mimeType ?? "";

  if (isLegacyBinaryWordDoc({ name, mimeType: mime })) {
    throw new Error(
      "Legacy .doc is not supported. Save as .docx or .txt / .hsms and upload again.",
    );
  }

  if (isWordTranscriptionFile({ name, mimeType: mime }) || /\.docx$/i.test(name)) {
    return extractDocxText(await readUriAsArrayBuffer(uri));
  }

  const raw = await readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
  if (isHsmsExtension(name)) {
    const fromBundle = transcriptionTextFromHsmsPayload(raw);
    if (fromBundle != null && fromBundle.trim()) return fromBundle;
  }
  return raw;
}

/**
 * Read a browser File (drop / paste) into transcription ASCII.
 */
export async function extractTranscriptionTextFromBrowserFile(file: File): Promise<string> {
  if (isLegacyBinaryWordDoc({ name: file.name, type: file.type })) {
    throw new Error(
      "Legacy .doc is not supported. Save as .docx or .txt / .hsms and upload again.",
    );
  }

  if (isWordTranscriptionFile({ name: file.name, type: file.type })) {
    const buffer = await file.arrayBuffer();
    return extractDocxText(buffer);
  }

  const raw = await file.text();
  if (isHsmsExtension(file.name)) {
    const fromBundle = transcriptionTextFromHsmsPayload(raw);
    if (fromBundle != null && fromBundle.trim()) return fromBundle;
  }
  return raw;
}
