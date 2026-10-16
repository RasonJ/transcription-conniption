export type Capability =
  | "concordance"
  | "facets"
  | "ngrams"
  | "collocations"
  | "pos_tagging"
  | "clause_parsing"
  | "corpus_diachronic"
  | "aljamiado_mapping"
  | "dialect_features"
  | "pdf_ingest"
  | "htr"
  | "iiif_hosting";

export const LOCAL_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "concordance",
  "facets",
  "ngrams",
  "collocations",
]);

export interface AnalysisRequest {
  recipeId: string;
  capability?: Capability;
  params: Record<string, unknown>;
  witness: { hash: string; title: string };
  /** Local provider only: the parsed witness (never serialized to a server). */
  parsed?: import("../../constants/manuscript").ParsedManuscript;
}

export type AnalysisResult<R> =
  | { ok: true; providerId: AnalysisProvider["id"]; data: R }
  | { ok: false; providerId: AnalysisProvider["id"]; error: string };

export interface AnalysisProvider {
  readonly id: "local" | "remote";
  capabilities(): ReadonlySet<Capability>;
  run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>>;
}

export class LocalAnalysisProvider implements AnalysisProvider {
  readonly id = "local" as const;

  capabilities(): ReadonlySet<Capability> {
    return LOCAL_CAPABILITIES;
  }

  async run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>> {
    const capability = request.capability;
    if (capability && !LOCAL_CAPABILITIES.has(capability)) {
      return { ok: false, providerId: this.id, error: `Unsupported capability: ${capability}` };
    }
    if (!request.parsed) {
      return { ok: false, providerId: this.id, error: "Local analysis needs the parsed witness" };
    }
    // Copilot code is Tier 1: load it only when an analysis actually runs.
    const { runRecipeById } = await import("../copilot/ask");
    const answer = runRecipeById(request.recipeId, request.parsed, {
      params: request.params as import("../copilot/types").RecipeParams,
    });
    if (!answer) return { ok: false, providerId: this.id, error: `Unknown recipe: ${request.recipeId}` };
    return { ok: true, providerId: this.id, data: answer as unknown as R };
  }
}

/** Server capabilities (SPEC-COPILOT §13); the remote provider advertises these. */
export const REMOTE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "pos_tagging",
  "clause_parsing",
  "corpus_diachronic",
  "aljamiado_mapping",
  "dialect_features",
  "pdf_ingest",
  "htr",
  "iiif_hosting",
]);

/**
 * HTTP provider for Tier D recipes (`POST {baseUrl}/v1/recipes/{id}`). Sends the recipe id,
 * params and witness hash only; the server resolves the witness from its own store
 * (uploaded with consent), so no transcription text leaves the device here.
 */
export class RemoteAnalysisProvider implements AnalysisProvider {
  readonly id = "remote" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  capabilities(): ReadonlySet<Capability> {
    return REMOTE_CAPABILITIES;
  }

  async run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/v1/recipes/${encodeURIComponent(request.recipeId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ params: request.params, witness: request.witness, capability: request.capability }),
      });
      if (!res.ok) return { ok: false, providerId: this.id, error: `HTTP ${res.status}` };
      return { ok: true, providerId: this.id, data: (await res.json()) as R };
    } catch (e) {
      return { ok: false, providerId: this.id, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Routes to local when it can answer, otherwise to the remote provider (when present). */
export class CompositeProvider implements AnalysisProvider {
  readonly id = "local" as const;

  constructor(
    private readonly local: AnalysisProvider,
    private readonly remote?: AnalysisProvider,
  ) {}

  capabilities(): ReadonlySet<Capability> {
    if (!this.remote) return this.local.capabilities();
    return new Set<Capability>([...this.local.capabilities(), ...this.remote.capabilities()]);
  }

  run<R>(request: AnalysisRequest): Promise<AnalysisResult<R>> {
    const capability = request.capability;
    const localCan = !capability || this.local.capabilities().has(capability);
    if (localCan || !this.remote) return this.local.run<R>(request);
    return this.remote.run<R>(request);
  }
}
