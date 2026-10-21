/**
 * CSS / SVG font-family stacks for MUFI faces.
 * Kept free of react-native so Node scripts (library catalog, HTML export) can import it.
 */

const ANDRON_CSS_FAMILY = "Andron Scriptor Web";
const FALLBACK_SERIF = "Georgia, 'Times New Roman', serif";

/** Andron Scriptor first, then Junicode, then the caller's extra faces. */
export function mufiSerifStack(extraFallbacks: string[] = []): string {
  const parts = [
    `'${ANDRON_CSS_FAMILY}'`,
    "'Andron Scriptor'",
    "Junicode",
    ...extraFallbacks.map((f) => (f.includes(",") ? f : f.includes(" ") ? `'${f}'` : f)),
    FALLBACK_SERIF,
  ];
  return parts.join(", ");
}
