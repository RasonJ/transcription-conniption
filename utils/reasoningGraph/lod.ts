/**
 * Level-of-detail isolation for reasoning-graph queries.
 * Macro epistemic walks stay on MACRO_REASONING and MESO_DISCOURSE.
 * MICRO_PHILOLOGICAL nodes load only when a folio or line is in view.
 */
import type { LodTier, ReasoningGraphDoc, ReasoningNode } from "./types";
import { DEFAULT_LOD_BY_TYPE } from "./types";

export const MACRO_QUERY_TIERS: readonly LodTier[] = ["MACRO_REASONING", "MESO_DISCOURSE"];
export const MICRO_QUERY_TIERS: readonly LodTier[] = ["MICRO_PHILOLOGICAL"];

export function nodeLod(node: ReasoningNode): LodTier {
  return node.lod_tier ?? DEFAULT_LOD_BY_TYPE[node.type];
}

function mentionsFolio(node: ReasoningNode, folioId: string): boolean {
  const folio = folioId.replace(/^FOLIO:/, "");
  const blob = `${node.id} ${node.attributes.folioNumber ?? ""} ${node.attributes.folioId ?? ""}`;
  return blob.includes(folio);
}

/**
 * Project a graph onto the requested tiers. Schema version is unchanged.
 * Pass `folioId` to lazy-load only the micro nodes of one leaf.
 */
export function projectLod(
  doc: ReasoningGraphDoc,
  tiers: readonly LodTier[],
  opts?: { folioId?: string },
): ReasoningGraphDoc {
  const allow = new Set(tiers);
  const nodes = doc.nodes.filter((node) => {
    const tier = nodeLod(node);
    if (!allow.has(tier)) return false;
    if (opts?.folioId && tier === "MICRO_PHILOLOGICAL" && !mentionsFolio(node, opts.folioId)) {
      return false;
    }
    return true;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return {
    ...doc,
    nodes,
    edges,
  };
}
