import {
  CompositeProvider,
  LocalAnalysisProvider,
  RemoteAnalysisProvider,
  type AnalysisProvider,
  type AnalysisRequest,
  type AnalysisResult,
} from "./provider";
import { remoteCallsAllowed } from "./remoteConsent";

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
      ? new CompositeProvider(
          local,
          url ? new ConsentGatedRemoteProvider(new RemoteAnalysisProvider(url)) : undefined,
        )
      : local;
  return cached;
}

export function resetAnalysisProviderForTests(): void {
  cached = null;
}

/** Blocks remote calls until the researcher allows them (SPEC-LIGHTWEIGHT §5). */
class ConsentGatedRemoteProvider implements AnalysisProvider {
  readonly id = "remote" as const;

  constructor(private readonly inner: AnalysisProvider) {}

  capabilities() {
    return this.inner.capabilities();
  }

  run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>> {
    if (!remoteCallsAllowed()) {
      return Promise.resolve({
        ok: false,
        providerId: "remote",
        error: "Remote analysis needs consent",
      });
    }
    return this.inner.run<R>(request);
  }
}
