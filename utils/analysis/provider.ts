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
    return { ok: false, providerId: this.id, error: `Recipe not implemented: ${request.recipeId}` };
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
