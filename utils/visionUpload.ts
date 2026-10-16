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

export function isPlainTextUploadFile(file: {
  name?: string | null;
  type?: string | null;
}): boolean {
  const mime = (file.type ?? "").toLowerCase();
  const name = file.name ?? "";
  if (mime.startsWith("text/") || mime === "application/json") return true;
  return /\.(txt|hsms|md|csv|tsv)$/i.test(name);
}

/** User phrasing that should trigger vision OCR when an image is attached. */
export function looksLikeTranscribeRequest(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true; // bare image send ⇒ transcribe
  return /transcri|ocr|vision|hsms|paleograph|scan|facsimile|folha|p[aá]gina|imagen|imagem/.test(
    q,
  );
}
