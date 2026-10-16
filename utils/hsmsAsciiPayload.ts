/**
 * Strip Markdown fences / conversational preambles so only HSMS ASCII remains.
 * Used after every Azure vision turn before lint + compile.
 */
export function extractHsmsAsciiPayload(raw: string): string {
  let text = raw.trim();

  // Prefer fenced payload if the model ignored "no markdown" instructions.
  const fenced = /```(?:hsms|text|txt|markdown)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  }

  // Drop common one-line / multi-line conversational openers.
  text = text.replace(
    /^(?:here(?:'s| is)(?:\s+the)?(?:\s+transcription)?|sure[,!]?\s*|okay[,!]?\s*|ok[,!]?\s*|to\s+transcribe|i(?:'ll| will)\s+transcribe|output:|transcription:)\s*/i,
    "",
  );
  text = text.replace(
    /^(?:Here is the transcription|To transcribe|Below is the transcription|The transcription(?: is| follows)?|Certainly[,!]?)[^\n]*\n+/is,
    "",
  );

  // Prefer content starting at first folio / RMK / CB / RUB / IN marker.
  const start = text.search(/(\[fol\.|\{RMK:|\{CB\d+\.|\{RUB\.|\{IN\d+\.)/i);
  if (start > 0 && start < 400) {
    text = text.slice(start);
  }

  // Vision models sometimes echo the same folio twice; keep the first copy.
  text = dedupeRepeatedFolioBlocks(text);
  // Trailing spaces from tokenizers break nothing but clutter parchment.
  text = text.replace(/[ \t]+$/gm, "");

  return text.trim();
}

const FOLIO_SPLIT = /(?=\[\s*fol(?:io)?\.?\s*[^\]]+\])/i;

/** Drop exact duplicate `[fol. …]` segments (common gpt-4o echo). */
export function dedupeRepeatedFolioBlocks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const firstFolio = trimmed.search(/\[\s*fol(?:io)?\.?\s*[^\]]+\]/i);
  if (firstFolio < 0) return trimmed;

  const prefix = firstFolio > 0 ? trimmed.slice(0, firstFolio).trim() : "";
  const body = firstFolio > 0 ? trimmed.slice(firstFolio) : trimmed;
  const segments = body.split(FOLIO_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return trimmed;

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const folioMatch = seg.match(/^\[\s*fol(?:io)?\.?\s*([^\]]+)\]/i);
    const folioId = folioMatch?.[1]?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
    // Normalize all whitespace so trailing spaces / blank lines do not defeat dedupe.
    const normalizedContent = seg.replace(/\s+/g, " ").trim().toLowerCase();
    const key = folioId ? `${folioId}::${normalizedContent}` : `::${normalizedContent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(seg);
  }

  return [prefix, ...kept].filter(Boolean).join("\n").trim();
}
