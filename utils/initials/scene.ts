/**
 * Platform-agnostic decorated-initial scene graph (SPEC-ORNATE-INITIALS §9).
 * Web, native, SVG export, and HTML export all render this structure.
 * Decorative grades are the multi-layer letterform from dropInitialLetterform
 * (field, inner panel, penwork or foliage, gold frame, shadowed letter).
 */

import {
  buildOrnateInitialGeometry,
  type LetterformMatrix,
  type OrnateInitialGeometry,
} from "@/components/svgFacsimile/dropInitialLetterform";
import { mufiSerifStack } from "@/utils/mufiFontStack";

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
      opacity?: number;
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
      fontWeight?: string | number;
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
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
const MODERN_FACE = /Impact|Arial Black|Courier New/i;

function periodFace(fontFamily: string): string {
  return MODERN_FACE.test(fontFamily) ? mufiSerifStack([]) : fontFamily;
}

/** Tradition picks the ornament family; the seed still picks pigment and flourish. */
function matrixForTradition(tradition: InitialTradition, sequence: number): LetterformMatrix {
  switch (tradition) {
    case "ms.penwork":
      return sequence % 2 === 0 ? "lombardic" : "diaper_ground";
    case "ms.illuminated":
      return sequence % 2 === 0 ? "diaper_ground" : "lombardic";
    case "ms.romanesque":
      return "romanesque";
    case "ms.humanist":
      return "renaissance_foliated";
    case "print.incunable":
      return "lombardic";
    case "print.woodcut":
      return sequence % 2 === 0 ? "gothic_textura" : "renaissance_foliated";
  }
}

function geometryToItems(geom: OrnateInitialGeometry): SceneItem[] {
  const items: SceneItem[] = [
    {
      kind: "rect",
      x: geom.field.x,
      y: geom.field.y,
      w: geom.field.w,
      h: geom.field.h,
      rx: geom.field.rx,
      fill: geom.field.fill,
    },
    {
      kind: "rect",
      x: geom.inner.x,
      y: geom.inner.y,
      w: geom.inner.w,
      h: geom.inner.h,
      rx: geom.inner.rx,
      fill: geom.inner.fill,
    },
  ];
  for (const path of geom.paths) {
    items.push({
      kind: "path",
      d: path.d,
      fill: path.fill,
      stroke: path.stroke,
      strokeWidth: path.strokeWidth,
      opacity: path.opacity,
    });
  }
  items.push(
    {
      kind: "rect",
      x: geom.outerStroke.x,
      y: geom.outerStroke.y,
      w: geom.outerStroke.w,
      h: geom.outerStroke.h,
      rx: geom.outerStroke.rx,
      fill: "none",
      stroke: geom.outerStroke.stroke,
      strokeWidth: geom.outerStroke.strokeWidth,
    },
    {
      kind: "rect",
      x: geom.innerStroke.x,
      y: geom.innerStroke.y,
      w: geom.innerStroke.w,
      h: geom.innerStroke.h,
      rx: geom.innerStroke.rx,
      fill: "none",
      stroke: geom.innerStroke.stroke,
      strokeWidth: geom.innerStroke.strokeWidth,
      opacity: geom.innerStroke.opacity,
    },
  );
  if (geom.letterUnderlay) {
    const under = geom.letterUnderlay;
    items.push({
      kind: "text",
      text: under.text,
      x: under.x,
      y: under.y,
      fontFamily: periodFace(under.fontFamily),
      fontSize: under.fontSize,
      fontWeight: under.fontWeight,
      fill: under.fill,
      opacity: under.opacity,
      anchor: "middle",
    });
  }
  items.push({
    kind: "text",
    text: geom.letter.text,
    x: geom.letter.x,
    y: geom.letter.y,
    fontFamily: periodFace(geom.letter.fontFamily),
    fontSize: geom.letter.fontSize,
    fontWeight: geom.letter.fontWeight,
    fill: geom.letter.fill,
    stroke: geom.letter.stroke,
    strokeWidth: geom.letter.strokeWidth,
    anchor: "middle",
  });
  return items;
}

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

  const geom = buildOrnateInitialGeometry(
    letter,
    0,
    0,
    boxWidth,
    boxHeight,
    boxHeight * 0.72,
    `${spec.tradition}|${spec.seed}`,
    `init_${spec.seed}`,
    { matrix: matrixForTradition(spec.tradition, spec.sequence) },
  );
  items.push(...geometryToItems(geom));

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
      const rx = item.rx != null ? ` rx="${item.rx}"` : "";
      const op = item.opacity != null ? ` opacity="${item.opacity}"` : "";
      parts.push(
        `<rect x="${x(item.x)}" y="${y(item.y)}" width="${item.w}" height="${item.h}"${rx}${fill}${stroke}${sw}${op}/>`,
      );
    } else if (item.kind === "path") {
      const fill = item.fill ? ` fill="${item.fill}"` : ' fill="none"';
      const stroke = item.stroke ? ` stroke="${item.stroke}"` : "";
      const sw = item.strokeWidth != null ? ` stroke-width="${item.strokeWidth}"` : "";
      const op = item.opacity != null ? ` opacity="${item.opacity}"` : "";
      parts.push(`<path d="${escapeXml(item.d)}"${fill}${stroke}${sw}${op}/>`);
    } else if (item.kind === "text") {
      const anchor = item.anchor ?? "start";
      const weight = item.fontWeight != null ? ` font-weight="${item.fontWeight}"` : "";
      const stroke = item.stroke && item.stroke !== "none" ? ` stroke="${item.stroke}"` : "";
      const sw = item.strokeWidth ? ` stroke-width="${item.strokeWidth}"` : "";
      const op = item.opacity != null ? ` opacity="${item.opacity}"` : "";
      parts.push(
        `<text x="${x(item.x)}" y="${y(item.y)}" text-anchor="${anchor}" font-family="${escapeXml(item.fontFamily)}" font-size="${item.fontSize.toFixed(1)}" fill="${item.fill}"${weight}${stroke}${sw}${op}>${escapeXml(item.text)}</text>`,
      );
    } else if (item.kind === "image") {
      parts.push(
        `<image href="${escapeXml(item.href)}" x="${x(item.x)}" y="${y(item.y)}" width="${item.w}" height="${item.h}"/>`,
      );
    }
  }
  return `<g transform="translate(${originX.toFixed(2)},${originY.toFixed(2)})">${parts.join("")}</g>`;
}
