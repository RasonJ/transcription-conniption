import {
  CompositeProvider,
  LocalAnalysisProvider,
  RemoteAnalysisProvider,
  type AnalysisProvider,
} from "./provider";

let cached: AnalysisProvider | null = null;

/**
 * Local provider by default (SPEC-LIGHTWEIGHT §5). With `EXPO_PUBLIC_ANALYSIS_BACKEND=1` and
 * `EXPO_PUBLIC_ANALYSIS_URL` set, Tier D capabilities route to the remote provider.
 */
export function getAnalysisProvider(): AnalysisProvider {
  if (cached) return cached;
  const local = new LocalAnalysisProvider();
  const url = process.env.EXPO_PUBLIC_ANALYSIS_URL;
  cached =
    process.env.EXPO_PUBLIC_ANALYSIS_BACKEND === "1"
      ? new CompositeProvider(local, url ? new RemoteAnalysisProvider(url) : undefined)
      : local;
  return cached;
}

export function resetAnalysisProviderForTests(): void {
  cached = null;
}
