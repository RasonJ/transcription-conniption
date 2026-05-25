import {
  buildDropCapSeed,
  GOLD_DARK,
  ILLUMINATED_THEMES,
  seededRng,
  type LetterformTheme,
} from "@/components/svgFacsimile/dropInitialLetterform";
import React from "react";
import { Circle, G, Image as SvgImage, Line, Path, Rect, Text as SvgText } from "react-native-svg";

const GOLD_LEAF = "#d4af37";

/** Style 0 — Lombardic / historiated */
const FONTS_VINES = [
  "Georgia, 'Times New Roman', serif",
  "'Palatino Linotype', Palatino, Georgia, serif",
  "'Bookman Old Style', Bookman, Georgia, serif",
  "Baskerville, Georgia, serif",
];

/** Style 1 — Gothic Textura / criblé */
const FONTS_CRIBLE = [
  "'Times New Roman', Georgia, serif",
  "Impact, 'Arial Black', sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Trajan Pro', Trajan, Georgia, serif",
];

/** Style 2 — Roman / Antiqua ribbon */
const FONTS_RIBBON = [
  "'Palatino Linotype', Palatino, Georgia, serif",
  "Garamond, 'EB Garamond', Georgia, serif",
  "Georgia, 'Times New Roman', serif",
  "Baskerville, Georgia, serif",
];

/** Style 3 — calligraphic damask */
const FONTS_DAMASK = [
  "Georgia, serif",
  "Garamond, 'EB Garamond', serif",
  "'Palatino Linotype', Palatino, serif",
  "'Book Antiqua', Palatino, Georgia, serif",
];

const STYLE_FONTS = [FONTS_VINES, FONTS_CRIBLE, FONTS_RIBBON, FONTS_DAMASK] as const;

const STYLE_LABELS = [
  "historiated_vines",
  "geometrical_crible",
  "renaissance_ribbon",
  "minstrel_damask",
] as const;

export type OrnateInitialStyleVariant = 0 | 1 | 2 | 3;

function innerPanel(cx: number, cy: number, capW: number, capH: number) {
  const pad = Math.min(capW, capH) * 0.08;
  return {
    pad,
    x: cx + pad,
    y: cy + pad,
    w: capW - pad * 2,
    h: capH - pad * 2,
  };
}

/** Style 0: winding acanthus vines and micro-foliage nodes */
function drawHistoriatedVines(
  panel: ReturnType<typeof innerPanel>,
  rng: () => number,
  k: string,
  gold: string,
): React.ReactNode[] {
  const { x, y, w, h } = panel;
  const nodes: React.ReactNode[] = [];
  const loops = 4 + Math.floor(rng() * 4);

  for (let i = 0; i < loops; i++) {
    const x1 = x + w * (0.15 + rng() * 0.7);
    const y1 = y + h * (0.15 + rng() * 0.7);
    const x2 = x + w * (0.15 + rng() * 0.7);
    const y2 = y + h * (0.15 + rng() * 0.7);
    const mx = x + w * (0.25 + rng() * 0.5);
    const my = y + h * (0.25 + rng() * 0.5);

    nodes.push(
      <Path
        key={`${k}-vne-${i}`}
        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
        stroke={gold}
        strokeWidth={1.2}
        fill="none"
        opacity={0.35 + rng() * 0.3}
      />,
    );

    if (rng() > 0.4) {
      nodes.push(
        <Circle
          key={`${k}-leaf-${i}`}
          cx={x2}
          cy={y2}
          r={1.8 + rng() * 2}
          fill={GOLD_DARK}
          opacity={0.6}
        />,
      );
    }

    if (rng() > 0.55) {
      const lx = x + rng() * w;
      const ly = y + rng() * h;
      nodes.push(
        <Path
          key={`${k}-spr-${i}`}
          d={`M ${lx} ${ly} q ${2 + rng() * 4} ${-3 - rng() * 4} ${4 + rng() * 3} ${rng() * 2}`}
          stroke={GOLD_DARK}
          strokeWidth={0.8}
          fill="none"
          opacity={0.45}
        />,
      );
    }
  }

  return nodes;
}

/** Style 1: stippled metal punch (criblé) within inner panel */
function drawCribleStippling(
  panel: ReturnType<typeof innerPanel>,
  rng: () => number,
  k: string,
  gold: string,
): React.ReactNode[] {
  const { x, y, w, h } = panel;
  const nodes: React.ReactNode[] = [];
  const density = Math.min(55, 25 + Math.floor(rng() * 25));

  for (let i = 0; i < density; i++) {
    const px = x + rng() * w;
    const py = y + rng() * h;
    nodes.push(
      <Circle
        key={`${k}-dot-${i}`}
        cx={px}
        cy={py}
        r={0.7 + rng() * 0.8}
        fill={gold}
        opacity={0.25 + rng() * 0.4}
      />,
    );
  }
  return nodes;
}

/** Style 2: double-ruled ribbon knotwork bands */
function drawRibbonInterlace(
  panel: ReturnType<typeof innerPanel>,
  rng: () => number,
  k: string,
  gold: string,
  fieldInk: string,
): React.ReactNode[] {
  const { x, y, w, h } = panel;
  const nodes: React.ReactNode[] = [];
  const steps = 3 + Math.floor(rng() * 3);
  const span = Math.max(h, 1);

  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0.5 : i / (steps - 1);
    const yPos = y + span * (0.12 + t * 0.76);
    const d = `M ${x} ${yPos} C ${x + w * 0.3} ${yPos - 12}, ${x + w * 0.7} ${yPos + 12}, ${x + w} ${yPos}`;
    nodes.push(
      <Path
        key={`${k}-rbn-${i}`}
        d={d}
        stroke={gold}
        strokeWidth={1.6}
        fill="none"
        opacity={0.3}
      />,
      <Path
        key={`${k}-rbni-${i}`}
        d={d}
        stroke={fieldInk}
        strokeWidth={0.6}
        fill="none"
        opacity={0.4}
      />,
    );
    if (rng() > 0.5) {
      const yPos2 = y + span * (0.2 + (1 - t) * 0.6);
      const d2 = `M ${x} ${yPos2} C ${x + w * 0.35} ${yPos2 + 10}, ${x + w * 0.65} ${yPos2 - 10}, ${x + w} ${yPos2}`;
      nodes.push(
        <Path key={`${k}-rbn2-${i}`} d={d2} stroke={gold} strokeWidth={0.9} fill="none" opacity={0.22} />,
      );
    }
  }
  return nodes;
}

/** Style 3: damask checker or cross-hatch tessellation */
function drawDamaskTessellation(
  panel: ReturnType<typeof innerPanel>,
  rng: () => number,
  k: string,
  theme: LetterformTheme,
): React.ReactNode[] {
  const { x, y, w, h } = panel;
  const nodes: React.ReactNode[] = [];

  if (rng() > 0.45) {
    const cols = 4 + Math.floor(rng() * 3);
    const rows = 4 + Math.floor(rng() * 3);
    const cellW = w / cols;
    const cellH = h / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if ((row + col) % 2 !== 0) continue;
        nodes.push(
          <Rect
            key={`${k}-chk-${row}-${col}`}
            x={x + col * cellW}
            y={y + row * cellH}
            width={cellW}
            height={cellH}
            fill={theme.gold}
            opacity={0.08 + rng() * 0.06}
          />,
        );
      }
    }
    return nodes;
  }

  const linesCount = 8 + Math.floor(rng() * 8);
  for (let i = 0; i < linesCount; i++) {
    const offset = (i * w) / linesCount;
    nodes.push(
      <Line
        key={`${k}-htch1-${i}`}
        x1={x + offset}
        y1={y}
        x2={x}
        y2={y + offset}
        stroke={GOLD_DARK}
        strokeWidth={0.6}
        opacity={0.25}
      />,
      <Line
        key={`${k}-htch2-${i}`}
        x1={x + w}
        y1={y + offset}
        x2={x + offset}
        y2={y + h}
        stroke={GOLD_DARK}
        strokeWidth={0.6}
        opacity={0.25}
      />,
    );
  }
  return nodes;
}

function cornerFlourishes(
  panel: ReturnType<typeof innerPanel>,
  bkey: string,
  gold: string,
): React.ReactNode[] {
  const q = 3;
  const { x, y, w, h } = panel;
  const corners: [number, number][] = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
  return corners.map(([px, py], i) => (
    <Path
      key={`${bkey}-crn-${i}`}
      d={`M ${px - q} ${py} L ${px} ${py - q} L ${px + q} ${py} L ${px} ${py + q} Z`}
      fill={gold}
      opacity={0.5}
    />
  ));
}

function backgroundForStyle(
  styleVariant: OrnateInitialStyleVariant,
  panel: ReturnType<typeof innerPanel>,
  rng: () => number,
  bkey: string,
  theme: LetterformTheme,
): React.ReactNode[] {
  switch (styleVariant) {
    case 0:
      return drawHistoriatedVines(panel, rng, bkey, theme.gold);
    case 1:
      return drawCribleStippling(panel, rng, bkey, theme.gold);
    case 2:
      return drawRibbonInterlace(panel, rng, bkey, theme.gold, theme.inner);
    case 3:
    default:
      return drawDamaskTessellation(panel, rng, bkey, theme);
  }
}

/**
 * High-fidelity algorithmic woodblock initial engine.
 * Four style matrices (vines, criblé, ribbon, damask) driven by folio-scoped seeded RNG.
 */
export function renderOrnateInitialSvg(
  letter: string,
  cx: number,
  cy: number,
  capW: number,
  capH: number,
  capFS: number,
  folioId: string,
  blockIndex: number,
  bkey: string,
  uploadedUri?: string,
  onPress?: () => void,
): React.ReactNode[] {
  if (uploadedUri) {
    return [
      <SvgImage
        key={`${bkey}-uimg`}
        x={cx}
        y={cy}
        width={capW}
        height={capH}
        href={uploadedUri}
        preserveAspectRatio="xMidYMid meet"
      />,
      <Rect
        key={`${bkey}-ubrd`}
        x={cx}
        y={cy}
        width={capW}
        height={capH}
        fill="none"
        stroke={GOLD_LEAF}
        strokeWidth={1.5}
        rx={3}
      />,
      <Rect
        key={`${bkey}-utap`}
        x={cx}
        y={cy}
        width={capW}
        height={capH}
        fill="transparent"
        onPress={onPress}
      />,
    ];
  }

  const seed = buildDropCapSeed(folioId, letter, blockIndex);
  const rng = seededRng(`${seed}|${bkey}`);
  const theme = ILLUMINATED_THEMES[Math.floor(rng() * 12)]; // indices 0-11 are dark-ground themes
  const styleVariant = Math.floor(rng() * 4) as OrnateInitialStyleVariant;
  const fonts = STYLE_FONTS[styleVariant];
  const fontFace = fonts[Math.floor(rng() * fonts.length)];

  const panel = innerPanel(cx, cy, capW, capH);
  const lx = cx + capW / 2;
  const ly = cy + capH * 0.82;
  const letterFS = Math.min(capFS, capH * 0.74);

  const backgroundDoodles = backgroundForStyle(styleVariant, panel, rng, bkey, theme);

  return [
    <G key={`${bkey}-cap-group`} data-style={STYLE_LABELS[styleVariant]}>
      <Rect
        x={cx + 1.5}
        y={cy + 1.5}
        width={capW}
        height={capH}
        fill="rgba(20, 8, 4, 0.22)"
        rx={5}
      />
      <Rect x={cx} y={cy} width={capW} height={capH} fill={theme.field} rx={5} />
      <Rect
        x={panel.x}
        y={panel.y}
        width={panel.w}
        height={panel.h}
        fill={theme.inner}
        rx={3}
      />
      <Rect
        x={cx}
        y={cy}
        width={capW}
        height={capH}
        fill="none"
        stroke={theme.gold}
        strokeWidth={2.2}
        rx={5}
      />
      <Rect
        x={panel.x + 2}
        y={panel.y + 2}
        width={panel.w - 4}
        height={panel.h - 4}
        fill="none"
        stroke={GOLD_DARK}
        strokeWidth={0.5}
        opacity={0.75}
        rx={2}
      />
      {backgroundDoodles}
      {cornerFlourishes(panel, bkey, theme.gold)}
      <SvgText
        x={lx}
        y={ly}
        textAnchor="middle"
        fontFamily={fontFace}
        fontSize={letterFS}
        fontWeight={styleVariant === 1 ? "900" : "bold"}
        fill={theme.letter}
        stroke={theme.gold}
        strokeWidth={0.35}
      >
        {letter}
      </SvgText>
      <Rect x={cx} y={cy} width={capW} height={capH} fill="transparent" onPress={onPress} />
    </G>,
  ];
}
