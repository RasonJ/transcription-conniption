/**
 * Platform-agnostic decorated-initial scene graph (SPEC-ORNATE-INITIALS §9).
 * Web, native, SVG export, and HTML export all render this structure.
 */

export type InitialGrade =
  | "minor"
  | "major"
  | "principal"
  | "illuminated"
  | "historiated"
  | "unexecuted"
  | "supplied";

export type InitialTradition =
  | "ms.penwork"
  | "ms.illuminated"
  | "ms.romanesque"
  | "ms.humanist"
  | "print.woodcut"
  | "print.incunable";

export interface InitialSpec {
  letter: string;
  depth: number;
  grade: InitialGrade;
  tradition: InitialTradition;
  sequence: number;
  seed: string;
  isSupplied: boolean;
  isUnexecuted: boolean;
}

export type SceneItem =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      /** Kept for the type; production scenes leave this unset (square frames). */
      rx?: number;
    }
  | { kind: "path"; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | {
      kind: "text";
      text: string;
      x: number;
      y: number;
      fontFamily: string;
      fontSize: number;
      fontWeight?: string;
      fill: string;
      anchor?: "start" | "middle" | "end";
    }
  | { kind: "image"; href: string; x: number; y: number; w: number; h: number };

export interface InitialScene {
  boxWidth: number;
  boxHeight: number;
  marginOverflowLeft: number;
  marginOverflowTop: number;
  marginOverflowBottom: number;
  items: SceneItem[];
  a11yText: string;
}

/** Medieval pigment tokens (SPEC-ORNATE-INITIALS §6). Opaque; no mustard gold. */
export const PIGMENT_PALETTE = {
  vermilion: "#c23b22",
  azurite: "#2e5c9a",
  leadwhite: "#f3ede0",
  goldLeafHi: "#e2c06a",
  goldLeafLo: "#9a7424",
  printerInk: "#1c1916",
  ironGall: "#3a2a1d",
  parchmentBg: "#f4ebd0",
  editorial: "#7a5500",
} as const;

const PERIOD_FACE = "Junicode, Georgia, serif";

function letterAspect(letter: string): number {
  const ch = letter[0] ?? "A";
  if (ch === "I" || ch === "J") return 0.35;
  if (ch === "M" || ch === "W") return 0.75;
  return 0.55;
}

/** Builds a pure scene graph for a drop initial. */
export function buildInitialScene(spec: InitialSpec, lineAdvance: number): InitialScene {
  const boxHeight = Math.max(1, spec.depth) * lineAdvance;
  const letterCount = Math.max(1, spec.letter.length);
  const baseAspect = letterAspect(spec.letter);
  const boxWidth = Math.round(
    boxHeight * baseAspect * (letterCount > 1 ? 1 + 0.22 * (letterCount - 1) : 1),
  );

  const items: SceneItem[] = [];
  const letter = spec.letter || "?";

  if (spec.isUnexecuted || spec.grade === "unexecuted") {
    items.push(
      {
        kind: "rect",
        x: 0,
        y: 0,
        w: boxWidth,
        h: boxHeight,
        fill: "none",
        stroke: PIGMENT_PALETTE.ironGall,
        strokeWidth: 1,
      },
      {
        kind: "text",
        text: letter.toLowerCase(),
        x: 4,
        y: Math.round(boxHeight * 0.28),
        fontFamily: PERIOD_FACE,
        fontSize: Math.round(boxHeight * 0.2),
        fill: PIGMENT_PALETTE.ironGall,
      },
    );
    return {
      boxWidth,
      boxHeight,
      marginOverflowLeft: 0,
      marginOverflowTop: 0,
      marginOverflowBottom: 0,
      items,
      a11yText: letter,
    };
  }

  if (spec.isSupplied || spec.grade === "supplied") {
    items.push({
      kind: "text",
      text: `[${letter}]`,
      x: boxWidth / 2,
      y: boxHeight * 0.75,
      fontFamily: PERIOD_FACE,
      fontSize: boxHeight * 0.7,
      fill: PIGMENT_PALETTE.editorial,
      anchor: "middle",
    });
    return {
      boxWidth,
      boxHeight,
      marginOverflowLeft: 0,
      marginOverflowTop: 0,
      marginOverflowBottom: 0,
      items,
      a11yText: letter,
    };
  }

  const print = spec.tradition.startsWith("print");
  if (print) {
    items.push(
      {
        kind: "rect",
        x: 0,
        y: 0,
        w: boxWidth,
        h: boxHeight,
        fill: PIGMENT_PALETTE.printerInk,
        stroke: PIGMENT_PALETTE.printerInk,
        strokeWidth: 1,
      },
      {
        kind: "text",
        text: letter,
        x: boxWidth / 2,
        y: boxHeight * 0.78,
        fontFamily: PERIOD_FACE,
        fontSize: boxHeight * 0.72,
        fontWeight: "bold",
        fill: PIGMENT_PALETTE.leadwhite,
        anchor: "middle",
      },
    );
  } else {
    const primary =
      spec.sequence % 2 === 0 ? PIGMENT_PALETTE.vermilion : PIGMENT_PALETTE.azurite;
    const secondary =
      spec.sequence % 2 === 0 ? PIGMENT_PALETTE.azurite : PIGMENT_PALETTE.vermilion;
    const illuminated =
      spec.grade === "illuminated" ||
      spec.grade === "historiated" ||
      spec.tradition === "ms.illuminated";

    if (illuminated) {
      items.push({
        kind: "rect",
        x: 0,
        y: 0,
        w: boxWidth,
        h: boxHeight,
        fill: PIGMENT_PALETTE.goldLeafHi,
        stroke: PIGMENT_PALETTE.ironGall,
        strokeWidth: 1,
      });
    } else if (spec.grade !== "minor") {
      items.push({
        kind: "rect",
        x: 0,
        y: 0,
        w: boxWidth,
        h: boxHeight,
        fill: PIGMENT_PALETTE.parchmentBg,
        stroke: secondary,
        strokeWidth: 1,
      });
    }

    items.push({
      kind: "text",
      text: letter,
      x: boxWidth / 2,
      y: boxHeight * 0.78,
      fontFamily: PERIOD_FACE,
      fontSize: boxHeight * 0.72,
      fontWeight: "bold",
      fill: primary,
      anchor: "middle",
    });

    // Marginal penwork tail sits left of the box so it does not cross body text.
    if (spec.tradition === "ms.penwork" && (spec.grade === "major" || spec.grade === "principal")) {
      const tail = Math.round(boxHeight * (spec.grade === "principal" ? 0.55 : 0.28));
      items.push({
        kind: "path",
        d: `M 1 ${boxHeight * 0.2} C -10 ${boxHeight * 0.45}, -12 ${boxHeight * 0.7}, -8 ${boxHeight + tail}`,
        fill: "none",
        stroke: secondary,
        strokeWidth: 1,
        opacity: 1,
      });
    }
  }

  return {
    boxWidth,
    boxHeight,
    marginOverflowLeft: spec.tradition === "ms.penwork" ? 16 : 0,
    marginOverflowTop: 0,
    marginOverflowBottom: 0,
    items,
    a11yText: letter,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Serialize a scene to SVG markup (HTML + SVG document export). */
export function serializeInitialScene(scene: InitialScene, originX = 0, originY = 0): string {
  const parts: string[] = [];
  for (const item of scene.items) {
    const x = (n: number) => (n + originX).toFixed(2);
    const y = (n: number) => (n + originY).toFixed(2);
    if (item.kind === "rect") {
      const fill = item.fill ? ` fill="${item.fill}"` : ' fill="none"';
      const stroke = item.stroke ? ` stroke="${item.stroke}"` : "";
      const sw = item.strokeWidth != null ? ` stroke-width="${item.strokeWidth}"` : "";
      parts.push(
        `<rect x="${x(item.x)}" y="${y(item.y)}" width="${item.w}" height="${item.h}"${fill}${stroke}${sw}/>`,
      );
    } else if (item.kind === "path") {
      const fill = item.fill ? ` fill="${item.fill}"` : ' fill="none"';
      const stroke = item.stroke ? ` stroke="${item.stroke}"` : "";
      const sw = item.strokeWidth != null ? ` stroke-width="${item.strokeWidth}"` : "";
      const op = item.opacity != null ? ` opacity="${item.opacity}"` : "";
      parts.push(`<path d="${escapeXml(item.d)}"${fill}${stroke}${sw}${op}/>`);
    } else if (item.kind === "text") {
      const anchor = item.anchor ?? "start";
      const weight = item.fontWeight ? ` font-weight="${item.fontWeight}"` : "";
      parts.push(
        `<text x="${x(item.x)}" y="${y(item.y)}" text-anchor="${anchor}" font-family="${escapeXml(item.fontFamily)}" font-size="${item.fontSize.toFixed(1)}" fill="${item.fill}"${weight}>${escapeXml(item.text)}</text>`,
      );
    } else if (item.kind === "image") {
      parts.push(
        `<image href="${escapeXml(item.href)}" x="${x(item.x)}" y="${y(item.y)}" width="${item.w}" height="${item.h}"/>`,
      );
    }
  }
  return `<g transform="translate(${originX.toFixed(2)},${originY.toFixed(2)})">${parts.join("")}</g>`;
}
