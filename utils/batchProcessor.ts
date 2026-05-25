import type { BatchFileStatus, BatchSummary, ParsedManuscript } from "@/constants/manuscript";
import { compileManuscriptTree } from "@/utils/compiler";

export interface RawFilePayload {
  name: string;
  content: string;
  size: number;
}

export interface BatchProcessResult {
  compiledTrees: Record<string, ParsedManuscript>;
  rawTexts: Record<string, string>;
  summary: BatchSummary;
}

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 16));

function cloneStatuses(statuses: BatchFileStatus[]): BatchFileStatus[] {
  return JSON.parse(JSON.stringify(statuses)) as BatchFileStatus[];
}

/**
 * Parses multiple transcriptions sequentially with UI yields between files.
 */
export async function processTranscriptionBatch(
  files: RawFilePayload[],
  onProgressUpdate: (statuses: BatchFileStatus[]) => void,
): Promise<BatchProcessResult> {
  const startTime = Date.now();
  const compiledTrees: Record<string, ParsedManuscript> = {};
  const rawTexts: Record<string, string> = {};

  const fileStatuses: BatchFileStatus[] = files.map((f) => ({
    fileName: f.name,
    fileSize: f.size,
    status: "queued",
    progress: 0,
  }));

  onProgressUpdate(cloneStatuses(fileStatuses));

  let totalWordsProcessed = 0;
  let totalAnomaliesDetected = 0;
  let failedFiles = 0;
  let completedFiles = 0;

  for (let i = 0; i < files.length; i++) {
    const targetFile = files[i];
    const statusRef = fileStatuses[i];

    statusRef.status = "processing";
    statusRef.progress = 25;
    onProgressUpdate(cloneStatuses(fileStatuses));

    try {
      await yieldToUi();
      const tree = compileManuscriptTree(targetFile.content);
      statusRef.progress = 75;

      const anomalyCount = tree.validationErrors?.length ?? 0;
      statusRef.stats = {
        totalWords: tree.stats.totalWords,
        totalLines: tree.stats.totalLines,
        rubricCount: tree.stats.rubricCount,
        glossCount: tree.stats.glossCount,
        anomalyCount,
      };

      totalWordsProcessed += tree.stats.totalWords;
      totalAnomaliesDetected += anomalyCount;
      completedFiles++;

      compiledTrees[targetFile.name] = tree;
      rawTexts[targetFile.name] = targetFile.content;

      statusRef.status = "completed";
      statusRef.progress = 100;
    } catch (err: unknown) {
      failedFiles++;
      statusRef.status = "failed";
      statusRef.progress = 100;

      if (err instanceof Error) {
        statusRef.error = err.message;
      } else if (typeof err === "object" && err !== null && "message" in err) {
        statusRef.error = String((err as Record<string, unknown>).message);
      } else {
        statusRef.error = "Unknown structural compiler failure";
      }
    }

    onProgressUpdate(cloneStatuses(fileStatuses));
  }

  return {
    compiledTrees,
    rawTexts,
    summary: {
      totalFiles: files.length,
      completedFiles,
      failedFiles,
      totalWordsProcessed,
      totalAnomaliesDetected,
      elapsedTimeMs: Date.now() - startTime,
    },
  };
}
