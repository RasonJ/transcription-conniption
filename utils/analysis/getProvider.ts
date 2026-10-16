import {
  CompositeProvider,
  LocalAnalysisProvider,
  type AnalysisProvider,
} from "./provider";

let cached: AnalysisProvider | null = null;

/** Local provider by default. The backend flag selects the composite stub (still local-only for now). */
export function getAnalysisProvider(): AnalysisProvider {
  if (cached) return cached;
  const local = new LocalAnalysisProvider();
  cached =
    process.env.EXPO_PUBLIC_ANALYSIS_BACKEND === "1" ? new CompositeProvider(local) : local;
  return cached;
}

export function resetAnalysisProviderForTests(): void {
  cached = null;
}
