/** Escape dynamic strings before embedding in RegExp constructors. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a sticky-safe RegExp from a pattern without a leading anchor. */
export function toStickyRegex(source: string, flags = "y"): RegExp {
  const normalized = source.startsWith("^") ? source.slice(1) : source;
  const uniqueFlags = new Set([...flags, "y"]);
  return new RegExp(normalized, [...uniqueFlags].join(""));
}
