import { normalizeMetadataPlainText } from "@/utils/metadataText";

export function inferManuscriptTitle(
  transcriptionText: string,
  sourceFileName?: string,
): string {
  const rmkTitles: string[] = [];
  for (const line of transcriptionText.split(/\r?\n/)) {
    const match = line.match(/\{RMK:\s*([^}|]+)/);
    if (match) {
      const candidate = normalizeMetadataPlainText(match[1].replace(/\.\s*$/, "").trim());
      if (candidate.length > 0 && candidate.length < 120 && !candidate.includes("|")) {
        rmkTitles.push(candidate);
      }
    }
  }
  if (rmkTitles.length >= 2) {
    return rmkTitles[1];
  }
  if (rmkTitles.length === 1) {
    return rmkTitles[0];
  }
  if (sourceFileName) {
    return sourceFileName.replace(/\.txt$/i, "").replace(/_/g, " ");
  }
  return "Untitled manuscript";
}
