import type { FigureMnemonic, Token } from "@/constants/manuscript";

export type FigureLayoutMode = "margin" | "inline" | "fullWidth";

export function figureLayoutMode(figureType?: FigureMnemonic): FigureLayoutMode {
  switch (figureType) {
    case "ILL":
      return "margin";
    case "DIAG":
      return "fullWidth";
    case "MIN":
    case "SYMB":
    default:
      return "inline";
  }
}

export function isMarginFigure(token: Token): boolean {
  return token.type === "figure_anchor" && figureLayoutMode(token.figureType) === "margin";
}

export function isFullWidthFigure(token: Token): boolean {
  return token.type === "figure_anchor" && figureLayoutMode(token.figureType) === "fullWidth";
}

export type TokenSegment =
  | { kind: "text"; tokens: Token[] }
  | { kind: "figure"; token: Token };

export function segmentTokensForRender(tokens: Token[]): TokenSegment[] {
  const segments: TokenSegment[] = [];
  let textRun: Token[] = [];

  for (const token of tokens) {
    if (token.type === "figure_anchor") {
      if (textRun.length > 0) {
        segments.push({ kind: "text", tokens: textRun });
        textRun = [];
      }
      segments.push({ kind: "figure", token });
    } else {
      textRun.push(token);
    }
  }

  if (textRun.length > 0) {
    segments.push({ kind: "text", tokens: textRun });
  }

  return segments;
}

export function partitionFigureSegments(segments: TokenSegment[]): {
  marginFigures: Token[];
  fullWidthFigures: Token[];
  flowSegments: TokenSegment[];
} {
  const marginFigures: Token[] = [];
  const fullWidthFigures: Token[] = [];
  const flowSegments: TokenSegment[] = [];

  for (const segment of segments) {
    if (segment.kind === "figure") {
      const mode = figureLayoutMode(segment.token.figureType);
      if (mode === "margin") {
        marginFigures.push(segment.token);
      } else if (mode === "fullWidth") {
        fullWidthFigures.push(segment.token);
      } else {
        flowSegments.push(segment);
      }
    } else {
      flowSegments.push(segment);
    }
  }

  return { marginFigures, fullWidthFigures, flowSegments };
}
