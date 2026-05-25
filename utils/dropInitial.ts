import type { Token } from "../constants/manuscript";

/** `{INn.}` plus optional nested `{…}` before the historiated grapheme. */
const DROP_INITIAL_TAG_RE = /^\s*\{IN(\d+)\.?\}(?:[^A-Za-z{]*\{[^}]*\})*\s*/;

function peelCapGrapheme(afterTag: string): { grapheme: string; consumed: number } | null {
  const leading = afterTag.length - afterTag.trimStart().length;
  const trimmed = afterTag.trimStart();
  if (!trimmed) return null;

  const slash = trimmed.match(/^\/([A-Za-z])\//);
  if (slash) {
    return {
      grapheme: slash[1].toUpperCase(),
      consumed: leading + slash[0].length,
    };
  }

  const cap = trimmed.match(/^([A-Z])/);
  if (!cap) return null;

  return {
    grapheme: cap[1],
    consumed: leading + 1,
  };
}

export function dropCapFontSize(initialDepth: number): number {
  return Math.min(Math.max(initialDepth * 12, 24), 60);
}

export function parseDropInitialLetterCluster(text: string): string | null {
  const tag = text.match(DROP_INITIAL_TAG_RE);
  if (!tag) return null;
  return peelCapGrapheme(text.slice(tag[0].length))?.grapheme ?? null;
}

export function parseDropInitialPrefix(text: string): { token: Token | null; rest: string } {
  const tag = text.match(DROP_INITIAL_TAG_RE);
  if (!tag) {
    return { token: null, rest: text };
  }

  const depth = parseInt(tag[1], 10);
  const afterTag = text.slice(tag[0].length);
  const cap = peelCapGrapheme(afterTag);
  if (!cap) {
    return { token: null, rest: text };
  }

  const rawPrefix = text.slice(0, tag[0].length + cap.consumed).trimEnd();

  return {
    token: {
      type: "drop_initial",
      value: cap.grapheme,
      raw: rawPrefix,
      initialDepth: depth,
    },
    rest: text.slice(tag[0].length + cap.consumed),
  };
}
