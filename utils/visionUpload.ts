import { isTranscriptionDocumentFile } from "@/utils/transcriptionFileText";

/** Detect image / PDF uploads destined for Azure vision → HSMS. */
export function isVisionUploadFile(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  const mime = (file.mimeType ?? file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (mime.startsWith("image/") || mime === "application/pdf") return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?|pdf)$/i.test(name);
}

/** @deprecated Prefer `isTranscriptionDocumentFile` — kept for existing imports. */
export function isPlainTextUploadFile(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): boolean {
  return isTranscriptionDocumentFile(file);
}

/** Studio hero upload: one control routes transcription docs → compile, image/PDF → vision. */
export type StudioUploadKind = "vision" | "text" | "unsupported";

export function classifyStudioUpload(file: {
  name?: string | null;
  type?: string | null;
  mimeType?: string | null;
}): StudioUploadKind {
  if (isVisionUploadFile(file)) return "vision";
  if (isTranscriptionDocumentFile(file)) return "text";
  return "unsupported";
}

/** Pasted / dropped plain text that already looks like HSMS — never send to Azure. */
export function looksLikeHsmsAscii(text: string): boolean {
  const sample = text.slice(0, 4000);
  return /\[fol\./i.test(sample) || /\{CB\d*\./i.test(sample) || /\{RMK:/i.test(sample);
}

/** User phrasing that should trigger vision OCR when an image is attached. */
export function looksLikeTranscribeRequest(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true; // bare image send ⇒ transcribe
  return /transcri|ocr|vision|hsms|paleograph|scan|facsimile|folha|p[aá]gina|imagen|imagem/.test(
    q,
  );
}

/** Read a browser File as a data URI (images) or object URL (PDF). */
export function browserFileToVisionUri(file: File): Promise<{
  uri: string;
  mimeType: string;
  revoke?: () => void;
}> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const objectUrl = URL.createObjectURL(file);
    return Promise.resolve({
      uri: objectUrl,
      mimeType: "application/pdf",
      revoke: () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* ignore */
        }
      },
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === "string" ? reader.result : "";
      if (!dataUri) {
        reject(new Error("Could not read image file"));
        return;
      }
      resolve({
        uri: dataUri,
        mimeType: file.type || "image/jpeg",
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}
