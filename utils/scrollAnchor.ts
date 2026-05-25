const RE_FOLIO_SCAN = /\[\s*fol(?:io)?\.?\s*([^\]\s]+)/i;
const RE_LINE_NUM_SCAN = /^\s*(\d{1,4})[\).:\s-]/;

/** Map a source line index to the nearest folio marker and physical line number. */
export function anchorFromLineIndex(
  transcriptionText: string,
  lineIndex: number,
): { folioId?: string; lineNumber?: string } {
  const lines = transcriptionText.split(/\r?\n/);
  let folioId: string | undefined;
  const clamped = Math.max(0, Math.min(lineIndex, lines.length - 1));

  for (let i = 0; i <= clamped; i++) {
    const folioMatch = lines[i].match(RE_FOLIO_SCAN);
    if (folioMatch) {
      folioId = folioMatch[1].trim();
    }
  }

  const line = lines[clamped] ?? "";
  const numMatch = line.match(RE_LINE_NUM_SCAN);
  return {
    folioId,
    lineNumber: numMatch?.[1],
  };
}

export function lineAnchorKey(folioId: string, lineNumber: string): string {
  return `${folioId}:${lineNumber}`;
}
