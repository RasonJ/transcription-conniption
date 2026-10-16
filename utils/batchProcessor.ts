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

const yieldToMainThread = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

/**
 * Parses multiple transcriptions with main-thread yields so large batches
 * (50+ files) do not freeze the UI. Status updates use shallow copies —
 * not JSON deep-clone — to avoid GC spikes on mobile.
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

  onProgressUpdate([...fileStatuses]);

  let totalWordsProcessed = 0;
  let totalAnomaliesDetected = 0;
  let failedFiles = 0;
  let completedFiles = 0;

  for (let i = 0; i < files.length; i++) {
    const targetFile = files[i];
    const statusRef = fileStatuses[i];

    statusRef.status = "processing";
    statusRef.progress = 30;
    onProgressUpdate([...fileStatuses]);

    try {
      await yieldToMainThread();
      const tree = compileManuscriptTree(targetFile.content);

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
      statusRef.error = err instanceof Error ? err.message : String(err);
    }

    onProgressUpdate([...fileStatuses]);
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
