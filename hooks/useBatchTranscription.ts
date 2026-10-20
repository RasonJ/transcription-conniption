/**
 * Live incremental PDF/image vision transcription.
 * Each completed folio updates React state immediately so the parchment can re-render
 * before the next Azure call (page-level streaming, not wait-for-all-25).
 *
 * The Azure pipeline (`batchTranscriptionService` → orchestrator) is loaded only when a
 * batch starts (SPEC-LIGHTWEIGHT: keep eager entry free of Foundry/OpenAI client code).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { extractHsmsAsciiPayload } from "@/utils/hsmsAsciiPayload";
import type {
  BatchProgress,
  BatchTranscriptionInput,
  BatchTranscriptionResult,
  TranscribedFolio,
} from "@/services/batchTranscriptionTypes";

export type { TranscribedFolio, BatchProgress };

export type BatchTranscriptionProgress = {
  current: number;
  total: number;
  activeFolio: string;
  phase: BatchProgress["phase"] | "idle";
};

export type UseBatchTranscriptionOptions = {
  /** Called with cumulative HSMS after each folio — typically `applyTranscription`. */
  onCumulativeHsms?: (hsms: string, meta: { folio: TranscribedFolio; pageCount: number }) => void;
};

function mergeCompletedHsms(pages: string[]): string {
  return pages
    .map((p) => extractHsmsAsciiPayload(p))
    .filter((p) => p.length > 0)
    .join("\n\n");
}

export function useBatchTranscription(options: UseBatchTranscriptionOptions = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BatchTranscriptionProgress>({
    current: 0,
    total: 0,
    activeFolio: "",
    phase: "idle",
  });
  const [completedFolios, setCompletedFolios] = useState<TranscribedFolio[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCumulativeRef = useRef(options.onCumulativeHsms);
  onCumulativeRef.current = options.onCumulativeHsms;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    setCompletedFolios([]);
    setProgress({ current: 0, total: 0, activeFolio: "", phase: "idle" });
    setLastError(null);
    setIsProcessing(false);
  }, [cancel]);

  const startBatchTranscription = useCallback(
    async (
      input: Omit<BatchTranscriptionInput, "onFolioComplete" | "signal">,
    ): Promise<BatchTranscriptionResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setCompletedFolios([]);
      setLastError(null);
      setProgress({ current: 0, total: 0, activeFolio: "", phase: "slicing" });

      try {
        const { runHybridTranscriptionPipeline } = await import(
          "@/services/batchTranscriptionService"
        );
        const result = await runHybridTranscriptionPipeline({
          ...input,
          signal: controller.signal,
          onProgress: (p) => {
            setProgress({
              current: p.currentPage,
              total: p.totalPages,
              activeFolio: p.currentFolio,
              phase: p.phase,
            });
            input.onProgress?.(p);
          },
          onFolioComplete: async (folio, cumulativeHsms) => {
            setCompletedFolios((prev) => [...prev, folio]);
            setProgress((prev) => ({
              ...prev,
              current: folio.pageNumber,
              activeFolio: folio.folioId,
              // Keep "repairing" while batched Pass 2 folios stream in.
              phase: prev.phase === "repairing" ? "repairing" : "transcribing",
            }));
            onCumulativeRef.current?.(cumulativeHsms, {
              folio,
              pageCount: folio.pageNumber,
            });
          },
        });
        setProgress((prev) => ({
          ...prev,
          current: result.pageCount,
          total: result.pageCount,
          phase: "idle",
        }));
        return result;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setLastError(null);
          return null;
        }
        const message = err instanceof Error ? err.message : String(err);
        setLastError(message);
        throw err;
      } finally {
        setIsProcessing(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  const fullDocumentHsms = useMemo(
    () => mergeCompletedHsms(completedFolios.map((f) => f.hsmsAscii)),
    [completedFolios],
  );

  return {
    isProcessing,
    progress,
    completedFolios,
    fullDocumentHsms,
    lastError,
    startBatchTranscription,
    cancel,
    reset,
  };
}
