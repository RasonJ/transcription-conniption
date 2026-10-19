import { createHash } from "node:crypto";
import type { ReasoningGraphDoc } from "./types";
import { REASONING_GRAPH_SCHEMA_VERSION } from "./types";

/** Stable SHA-256 over sorted nodes/edges for causal / audit locks. */
export function computeReasoningDagHash(graphDoc: ReasoningGraphDoc | null | undefined): string {
  const doc = graphDoc ?? { schema_version: REASONING_GRAPH_SCHEMA_VERSION, nodes: [], edges: [] };
  const canonical = {
    schema_version: doc.schema_version || REASONING_GRAPH_SCHEMA_VERSION,
    nodes: [...(doc.nodes ?? [])]
      .filter((n) => n && typeof n === "object")
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    edges: [...(doc.edges ?? [])]
      .filter((e) => e && typeof e === "object")
      .sort((a, b) => {
        const ak = String(a.id || `${a.source}|${a.relation}|${a.target}`);
        const bk = String(b.id || `${b.source}|${b.relation}|${b.target}`);
        return ak.localeCompare(bk);
      }),
  };
  const blob = JSON.stringify(canonical);
  return createHash("sha256").update(blob, "utf8").digest("hex");
}

/** Short corpus lock (16 hex chars) for calibrated_thresholds.corpus_hash. */
export function shortCorpusHash(graphDoc: ReasoningGraphDoc | null | undefined): string {
  return computeReasoningDagHash(graphDoc).slice(0, 16);
}
