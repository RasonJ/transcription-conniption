import type { ReasoningNodeType } from "./types";

/** Build a stable URN for HSMS reasoning-graph nodes. */
export function makeNodeUri(
  type: ReasoningNodeType,
  ...parts: Array<string | number | undefined | null>
): string {
  const slug = [type.toLowerCase(), ...parts]
    .filter((p) => p != null && String(p).length > 0)
    .map((p) =>
      String(p)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9._:-]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .join(":");
  return `urn:hsms:${slug}`;
}
