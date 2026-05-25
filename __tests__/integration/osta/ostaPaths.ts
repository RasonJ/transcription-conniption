import path from "path";

/** Sibling repo: `_gu/OSTA/transcriptions`. Override with OSTA_TRANSCRIPTIONS_PATH. */
export function resolveOstaTranscriptionsPath(): string {
  return (
    process.env.OSTA_TRANSCRIPTIONS_PATH ??
    path.resolve(__dirname, "../../../../OSTA/transcriptions")
  );
}

export function requireOstaIntegration(): void {
  if (process.env.OSTA_INTEGRATION !== "1") {
    throw new Error("OSTA corpus tests run only via npm run test:osta.");
  }
}
