/** Deterministic illuminated drop-cap letterform generator (seeded PRNG). */

export type LetterformMatrix =
  | "romanesque"
  | "gothic_textura"
  | "lombardic"
  | "renaissance_foliated"
  | "pen_flourish"
  | "diaper_ground";

export interface LetterformTheme {
  field: string;
  inner: string;
  letter: string;
  gold: string;
}

export interface LetterformSpec {
  matrix: LetterformMatrix;
  theme: LetterformTheme;
  fontFamily: string;
  flourishVariant: number;
  outerRadius: number;
  innerRadius: number;
  borderWidth: number;
  /** Fraction of box height to use for letter em size. */
  letterScale: number;
  letterWeight: number | string;
}

export interface OrnamentPath {
  key: string;
  d: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface OrnateInitialGeometry {
  spec: LetterformSpec;
  shadow: { x: number; y: number; w: number; h: number; rx: number };
  field: { x: number; y: number; w: number; h: number; rx: number; fill: string };
  inner: { x: number; y: number; w: number; h: number; rx: number; fill: string };
  outerStroke: { x: number; y: number; w: number; h: number; rx: number; stroke: string; strokeWidth: number };
  innerStroke: { x: number; y: number; w: number; h: number; rx: number; stroke: string; strokeWidth: number; opacity: number };
  paths: OrnamentPath[];
  /** Optional shadow letter rendered beneath the main letter for depth. */
  letterUnderlay?: {
    x: number; y: number; text: string; fontFamily: string;
    fontSize: number; fontWeight: number | string; fill: string; opacity: number;
  };
  letter: {
    x: number; y: number; text: string; fontFamily: string;
    fontSize: number; fontWeight: number | string; fill: string; stroke: string; strokeWidth: number;
  };
}

const GOLD_LEAF = "#d4af37";
export const GOLD_DARK = "#b8860b";
export const IVORY_LETTER = "#fffdf5";

export const ILLUMINATED_THEMES: LetterformTheme[] = [
  // Dark-ground themes 0-11
  { field: "#8a1c14", inner: "#5c1009", letter: IVORY_LETTER, gold: GOLD_LEAF },   // 0  Castilian crimson
  { field: "#1a237e", inner: "#0d1642", letter: IVORY_LETTER, gold: GOLD_LEAF },   // 1  Parisian ultramarine
  { field: "#1b4332", inner: "#0f2918", letter: IVORY_LETTER, gold: "#e8c547" },   // 2  herbarium green
  { field: "#4a1942", inner: "#2d0f28", letter: IVORY_LETTER, gold: GOLD_LEAF },   // 3  royal purple
  { field: "#7a4a08", inner: "#4a2d04", letter: IVORY_LETTER, gold: GOLD_LEAF },   // 4  court amber
  { field: "#3d2b1f", inner: "#241810", letter: "#f0e6d2",   gold: "#c9a227" },    // 5  dark walnut
  { field: "#5c4033", inner: "#3a281e", letter: IVORY_LETTER, gold: GOLD_DARK },   // 6  Tuscan ochre
  { field: "#c5901a", inner: "#9a6d10", letter: "#1a0a05",   gold: "#fffdf5" },    // 7  gilded ground
  { field: "#0e1060", inner: "#080b40", letter: IVORY_LETTER, gold: "#f4d04a" },   // 8  Flemish midnight
  { field: "#aa1e1e", inner: "#7a0e0e", letter: IVORY_LETTER, gold: "#ffd700" },   // 9  Pompeian red
  { field: "#3c2878", inner: "#241860", letter: IVORY_LETTER, gold: "#e8c060" },   // 10 Aragonese violet
  { field: "#0d5c5c", inner: "#083d3d", letter: IVORY_LETTER, gold: "#ffd700" },   // 11 Byzantine teal
  // Light parchment themes 12-14 (pen flourish only)
  { field: "#f0e6cc", inner: "#e0d0a0", letter: "#1a0800",   gold: "#8a1010" },    // 12 parchment + red ink
  { field: "#f5f0e8", inner: "#e8dfc8", letter: "#0a0a30",   gold: "#1a3080" },    // 13 cream + blue ink
  { field: "#e8dcc0", inner: "#d4c490", letter: "#2d1800",   gold: "#6a3808" },    // 14 vellum + sepia
];

const MATRIX_FONTS: Record<LetterformMatrix, string[]> = {
  romanesque: [
    "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
    "Georgia, 'Times New Roman', serif",
    "Garamond, Baskerville, Georgia, serif",
    "'Didot', 'Bodoni MT', Georgia, serif",
    "Baskerville, Georgia, serif",
  ],
  gothic_textura: [
    "'Times New Roman', Georgia, serif",
    "'Courier New', Courier, monospace",
    "Georgia, 'Times New Roman', serif",
    "Impact, 'Arial Black', sans-serif",
    "Baskerville, Georgia, serif",
  ],
  lombardic: [
    "Georgia, 'Times New Roman', serif",
    "'Palatino Linotype', Palatino, Georgia, serif",
    "'Bookman Old Style', Bookman, Georgia, serif",
    "Baskerville, Georgia, serif",
    "'Book Antiqua', Palatino, Georgia, serif",
  ],
  renaissance_foliated: [
    "'Palatino Linotype', Palatino, Georgia, serif",
    "Garamond, Georgia, serif",
    "Georgia, 'Times New Roman', serif",
    "Baskerville, Georgia, serif",
    "'Times New Roman', Georgia, serif",
  ],
  pen_flourish: [
    "'Times New Roman', Georgia, serif",
    "Georgia, serif",
    "'Palatino Linotype', Palatino, Georgia, serif",
    "Baskerville, Georgia, serif",
    "Garamond, Georgia, serif",
  ],
  diaper_ground: [
    "'Palatino Linotype', Palatino, Georgia, serif",
    "Garamond, Georgia, serif",
    "Baskerville, Georgia, serif",
    "Georgia, serif",
    "'Times New Roman', Georgia, serif",
  ],
};

const MATRICES: LetterformMatrix[] = [
  "romanesque",
  "gothic_textura",
  "lombardic",
  "renaissance_foliated",
  "pen_flourish",
  "diaper_ground",
];

const MATRIX_THEME_POOLS: Record<LetterformMatrix, number[]> = {
  romanesque:           [0, 4, 5, 6, 7, 9],
  gothic_textura:       [1, 3, 8, 10, 11],
  lombardic:            [0, 1, 2, 3, 4, 9],
  renaissance_foliated: [4, 5, 6, 7, 9],
  pen_flourish:         [12, 13, 14],
  diaper_ground:        [0, 1, 3, 8, 9, 10, 11],
};

/** Structural seed: folio side + letter + parent line index. */
export function buildDropCapSeed(folioId: string, letter: string, blockIndex: number): string {
  return `${folioId}|${letter}|${blockIndex}`;
}

export function seededRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h ^ seed.charCodeAt(i), 16777619)) >>> 0;
  }
  return () => {
    h = (h ^ (h << 13)) >>> 0;
    h = (h ^ (h >>> 17)) >>> 0;
    h = (h ^ (h << 5)) >>> 0;
    return h / 0xffffffff;
  };
}

function matrixGeometry(matrix: LetterformMatrix): Pick<
  LetterformSpec,
  "outerRadius" | "innerRadius" | "borderWidth" | "letterScale" | "letterWeight"
> {
  switch (matrix) {
    case "romanesque":
      return { outerRadius: 8, innerRadius: 5, borderWidth: 2.5, letterScale: 0.72, letterWeight: "bold" };
    case "gothic_textura":
      return { outerRadius: 2, innerRadius: 1, borderWidth: 3.2, letterScale: 0.78, letterWeight: 900 };
    case "lombardic":
      return { outerRadius: 6, innerRadius: 4, borderWidth: 2.2, letterScale: 0.80, letterWeight: "bold" };
    case "renaissance_foliated":
      return { outerRadius: 5, innerRadius: 3, borderWidth: 2.0, letterScale: 0.74, letterWeight: "bold" };
    case "pen_flourish":
      return { outerRadius: 4, innerRadius: 2, borderWidth: 2.0, letterScale: 0.84, letterWeight: 900 };
    case "diaper_ground":
    default:
      return { outerRadius: 3, innerRadius: 2, borderWidth: 2.5, letterScale: 0.76, letterWeight: "bold" };
  }
}

export function pickLetterform(seed: string): LetterformSpec {
  const rng = seededRng(seed);
  const matrix = MATRICES[Math.floor(rng() * MATRICES.length)];
  const pool = MATRIX_THEME_POOLS[matrix];
  const theme = ILLUMINATED_THEMES[pool[Math.floor(rng() * pool.length)]];
  const fonts = MATRIX_FONTS[matrix];
  const fontFamily = fonts[Math.floor(rng() * fonts.length)];
  const flourishVariant = Math.floor(rng() * 3);
  return { matrix, theme, fontFamily, flourishVariant, ...matrixGeometry(matrix) };
}

// ── SVG path helpers ──────────────────────────────────────────────────────────

/**
 * Build a cubic-bezier d-string from fractional coordinates within the inner box.
 * fracs: [Mx,My,  C1c1x,C1c1y,C1c2x,C1c2y,C1ex,C1ey,  C2c1x,…]
 */
function fp(iX: number, iY: number, iW: number, iH: number, fracs: number[]): string {
  const ax = (f: number) => (iX + f * iW).toFixed(1);
  const ay = (f: number) => (iY + f * iH).toFixed(1);
  let d = `M ${ax(fracs[0])} ${ay(fracs[1])}`;
  for (let i = 2; i < fracs.length; i += 6) {
    d += ` C ${ax(fracs[i])} ${ay(fracs[i + 1])},${ax(fracs[i + 2])} ${ay(fracs[i + 3])},${ax(fracs[i + 4])} ${ay(fracs[i + 5])}`;
  }
  return d;
}

/** Filled teardrop leaf from base (x1,y1) to tip (x2,y2) with half-width w. */
function mkLeaf(
  bkey: string, idx: number,
  x1: number, y1: number, x2: number, y2: number,
  w: number, fill: string, opacity: number,
): OrnamentPath {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * w; const ny = (dx / len) * w;
  const cpx = x1 + dx * 0.4; const cpy = y1 + dy * 0.4;
  const f = (n: number) => n.toFixed(1);
  return {
    key: `${bkey}-lf-${idx}`,
    d: `M ${f(x1)} ${f(y1)} C ${f(cpx + nx)} ${f(cpy + ny)} ${f(x2 + nx * 0.3)} ${f(y2 + ny * 0.3)} ${f(x2)} ${f(y2)} C ${f(x2 - nx * 0.3)} ${f(y2 - ny * 0.3)} ${f(cpx - nx)} ${f(cpy - ny)} ${f(x1)} ${f(y1)} Z`,
    fill, opacity,
  };
}

/** Filled circle (boss, berry, medallion). */
function mkBoss(
  bkey: string, idx: number,
  cx: number, cy: number, r: number,
  fill: string, opacity: number,
  stroke?: string, sw?: number,
): OrnamentPath {
  const f = (n: number) => n.toFixed(1);
  return {
    key: `${bkey}-bs-${idx}`,
    d: `M ${f(cx - r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}`,
    fill, opacity, stroke, strokeWidth: sw,
  };
}

/** Filled diamond at (cx,cy) with half-extents rx,ry. */
function mkDiamond(
  bkey: string, idx: number,
  cx: number, cy: number, rx: number, ry: number,
  fill: string, stroke: string, opacity: number,
): OrnamentPath {
  const f = (n: number) => n.toFixed(1);
  return {
    key: `${bkey}-dm-${idx}`,
    d: `M ${f(cx)} ${f(cy - ry)} L ${f(cx + rx)} ${f(cy)} L ${f(cx)} ${f(cy + ry)} L ${f(cx - rx)} ${f(cy)} Z`,
    fill, stroke, opacity,
  };
}

// ── Per-matrix ornament generators ───────────────────────────────────────────

function matrixOrnaments(
  spec: LetterformSpec,
  cx: number, cy: number,
  capW: number, capH: number,
  bkey: string,
): OrnamentPath[] {
  const pad = Math.min(capW, capH) * 0.065;
  const iX = cx + pad; const iY = cy + pad;
  const iW = capW - pad * 2; const iH = capH - pad * 2;
  const mx = iX + iW / 2; const my = iY + iH / 2;
  const gold = spec.theme.gold;
  const paths: OrnamentPath[] = [];

  switch (spec.matrix) {

    // ── Pen Flourish ─────────────────────────────────────────────────────────
    case "pen_flourish": {
      const ac = gold;
      const sw = 1.5;

      // Four corner C-scrolls: [path fracs, leaf-base fx,fy, leaf-tip fx,fy]
      const cornerScrolls: [number[], number, number, number, number][] = [
        [[0.04,0.04, 0.04,0.26,0.22,0.04,0.25,0.26, 0.28,0.44,0.04,0.34,0.06,0.44, 0.08,0.54,0.22,0.46,0.30,0.44], 0.25,0.44, 0.30,0.38],
        [[0.96,0.04, 0.96,0.26,0.78,0.04,0.75,0.26, 0.72,0.44,0.96,0.34,0.94,0.44, 0.92,0.54,0.78,0.46,0.70,0.44], 0.75,0.44, 0.70,0.38],
        [[0.04,0.96, 0.04,0.74,0.22,0.96,0.25,0.74, 0.28,0.56,0.04,0.66,0.06,0.56, 0.08,0.46,0.22,0.54,0.30,0.56], 0.25,0.56, 0.30,0.62],
        [[0.96,0.96, 0.96,0.74,0.78,0.96,0.75,0.74, 0.72,0.56,0.96,0.66,0.94,0.56, 0.92,0.46,0.78,0.54,0.70,0.56], 0.75,0.56, 0.70,0.62],
      ];
      cornerScrolls.forEach(([fracs, bfx, bfy, tfx, tfy], i) => {
        paths.push({ key: `${bkey}-pf-cs${i}`, d: fp(iX,iY,iW,iH,fracs), stroke: ac, strokeWidth: sw, fill: "none", opacity: 0.82 });
        paths.push(mkLeaf(bkey, i, iX+bfx*iW, iY+bfy*iH, iX+tfx*iW, iY+tfy*iH, iW*0.035, ac, 0.65));
      });

      // Left/right edge S-scrolls
      paths.push({ key: `${bkey}-pf-ls`, d: fp(iX,iY,iW,iH,[0.08,0.22, 0.01,0.22,0.01,0.38,0.08,0.38, 0.15,0.38,0.15,0.54,0.08,0.54, 0.01,0.54,0.01,0.70,0.08,0.70]), stroke: ac, strokeWidth: 1.1, fill: "none", opacity: 0.65 });
      paths.push({ key: `${bkey}-pf-rs`, d: fp(iX,iY,iW,iH,[0.92,0.22, 0.99,0.22,0.99,0.38,0.92,0.38, 0.85,0.38,0.85,0.54,0.92,0.54, 0.99,0.54,0.99,0.70,0.92,0.70]), stroke: ac, strokeWidth: 1.1, fill: "none", opacity: 0.65 });

      // Top/bottom S-scrolls on higher variants
      if (spec.flourishVariant >= 1) {
        paths.push({ key: `${bkey}-pf-ts`, d: fp(iX,iY,iW,iH,[0.22,0.08, 0.22,0.01,0.38,0.01,0.38,0.08, 0.38,0.15,0.54,0.15,0.54,0.08, 0.54,0.01,0.70,0.01,0.70,0.08]), stroke: ac, strokeWidth: 1.0, fill: "none", opacity: 0.55 });
        paths.push({ key: `${bkey}-pf-bs`, d: fp(iX,iY,iW,iH,[0.22,0.92, 0.22,0.99,0.38,0.99,0.38,0.92, 0.38,0.85,0.54,0.85,0.54,0.92, 0.54,0.99,0.70,0.99,0.70,0.92]), stroke: ac, strokeWidth: 1.0, fill: "none", opacity: 0.55 });
      }
      if (spec.flourishVariant >= 2) {
        paths.push({ key: `${bkey}-pf-ml`, d: fp(iX,iY,iW,iH,[0.28,0.42, 0.18,0.42,0.18,0.50,0.28,0.50, 0.38,0.50,0.38,0.58,0.28,0.58]), stroke: ac, strokeWidth: 0.9, fill: "none", opacity: 0.45 });
        paths.push({ key: `${bkey}-pf-mr`, d: fp(iX,iY,iW,iH,[0.72,0.42, 0.82,0.42,0.82,0.50,0.72,0.50, 0.62,0.50,0.62,0.58,0.72,0.58]), stroke: ac, strokeWidth: 0.9, fill: "none", opacity: 0.45 });
      }

      // Berry dots at edge midpoints and diagonal positions
      const bDots: [number, number][] = [[0.07,0.5],[0.93,0.5],[0.5,0.06],[0.5,0.94],[0.18,0.18],[0.82,0.18],[0.18,0.82],[0.82,0.82]];
      bDots.forEach(([fx,fy],i) => paths.push(mkBoss(bkey, 10+i, iX+fx*iW, iY+fy*iH, iW*0.018, ac, 0.52)));
      break;
    }

    // ── Diaper Ground ────────────────────────────────────────────────────────
    case "diaper_ground": {
      const dStep = Math.max(9, Math.min(14, iW / 7));
      let di = 0;
      for (let dx = iX - dStep; dx < iX + iW + dStep; dx += dStep) {
        for (let dy = iY - dStep; dy < iY + iH + dStep; dy += dStep) {
          const dh = dStep / 2;
          paths.push({ key: `${bkey}-dp-${di++}`, d: `M ${dx.toFixed(1)} ${(dy+dh).toFixed(1)} L ${(dx+dh).toFixed(1)} ${dy.toFixed(1)} L ${(dx+dStep).toFixed(1)} ${(dy+dh).toFixed(1)} L ${(dx+dh).toFixed(1)} ${(dy+dStep).toFixed(1)} Z`, stroke: gold, strokeWidth: 0.45, fill: "none", opacity: 0.22 });
        }
      }
      // Double border frame
      paths.push({ key: `${bkey}-dg-f1`, d: `M ${iX+3} ${iY+3} L ${iX+iW-3} ${iY+3} L ${iX+iW-3} ${iY+iH-3} L ${iX+3} ${iY+iH-3} Z`, stroke: gold, strokeWidth: 1.4, fill: "none", opacity: 0.65 });
      paths.push({ key: `${bkey}-dg-f2`, d: `M ${iX+7} ${iY+7} L ${iX+iW-7} ${iY+7} L ${iX+iW-7} ${iY+iH-7} L ${iX+7} ${iY+iH-7} Z`, stroke: gold, strokeWidth: 0.7, fill: "none", opacity: 0.4 });
      // 8-pointed corner stars
      [[iX+5,iY+5],[iX+iW-5,iY+5],[iX+5,iY+iH-5],[iX+iW-5,iY+iH-5]].forEach(([sx,sy],idx) => {
        const sr = 4.5;
        paths.push({ key: `${bkey}-dg-star${idx}`, d: `M ${sx-sr} ${sy} L ${sx-sr*0.3} ${sy-sr*0.3} L ${sx} ${sy-sr} L ${sx+sr*0.3} ${sy-sr*0.3} L ${sx+sr} ${sy} L ${sx+sr*0.3} ${sy+sr*0.3} L ${sx} ${sy+sr} L ${sx-sr*0.3} ${sy+sr*0.3} Z`, fill: gold, opacity: 0.62 });
      });
      // Centre diamond rosette
      const cr = Math.min(iW, iH) * 0.09;
      paths.push(mkDiamond(bkey, 100, mx, my, cr, cr*0.65, "none", gold, 0.45));
      paths.push(mkBoss(bkey, 101, mx, my, cr*0.32, gold, 0.55, spec.theme.inner, 0.8));
      // Mid-edge diamond accents
      [[mx,iY+5],[mx,iY+iH-5],[iX+5,my],[iX+iW-5,my]].forEach(([bx,by],i) => {
        paths.push(mkDiamond(bkey, 200+i, bx, by, 3.5, 3.5, gold, "none", 0.5));
      });
      break;
    }

    // ── Romanesque ──────────────────────────────────────────────────────────
    case "romanesque": {
      // Double inner frame
      paths.push({ key: `${bkey}-rom-f2`, d: `M ${iX+4} ${iY+4} L ${iX+iW-4} ${iY+4} L ${iX+iW-4} ${iY+iH-4} L ${iX+4} ${iY+iH-4} Z`, stroke: gold, strokeWidth: 0.9, fill: "none", opacity: 0.42 });

      // Tympanum arch with voussoir radiating lines
      const arcCY = iY + iH * 0.43;
      const arcR = iW * 0.42;
      paths.push({ key: `${bkey}-rom-tym`, d: `M ${iX+6} ${arcCY} A ${arcR} ${arcR} 0 0 1 ${iX+iW-6} ${arcCY}`, stroke: gold, strokeWidth: 1.6, fill: "none", opacity: 0.52 });
      for (let vi = 1; vi <= 4; vi++) {
        const ang = Math.PI * vi / 5;
        const vx = mx - Math.cos(ang) * arcR;
        const vy = arcCY - Math.sin(ang) * arcR;
        paths.push({ key: `${bkey}-rom-vou${vi}`, d: `M ${vx.toFixed(1)} ${vy.toFixed(1)} L ${mx.toFixed(1)} ${(arcCY+iH*0.07).toFixed(1)}`, stroke: gold, strokeWidth: 0.65, fill: "none", opacity: 0.25 });
      }

      // Column shafts with capital, base, and chevron decorations
      [[iX+6],[iX+iW-6]].forEach(([colX], ci) => {
        const colTop = arcCY; const colBot = iY + iH - 8;
        paths.push({ key: `${bkey}-rom-shaft${ci}`, d: `M ${colX} ${colTop} L ${colX} ${colBot}`, stroke: gold, strokeWidth: 3, fill: "none", opacity: 0.28 });
        paths.push({ key: `${bkey}-rom-cap${ci}`, d: `M ${colX-5} ${colTop} L ${colX+5} ${colTop} L ${colX+4} ${colTop+7} L ${colX-4} ${colTop+7} Z`, fill: gold, opacity: 0.28 });
        paths.push({ key: `${bkey}-rom-base${ci}`, d: `M ${colX-5} ${colBot} L ${colX+5} ${colBot} L ${colX+4} ${colBot-6} L ${colX-4} ${colBot-6} Z`, fill: gold, opacity: 0.22 });
        const shaftH = colBot - colTop - 14;
        for (let ci2 = 0; ci2 < 3; ci2++) {
          const sy2 = colTop + 10 + ci2 * (shaftH / 3);
          paths.push({ key: `${bkey}-rom-chv${ci}-${ci2}`, d: `M ${colX-3} ${sy2} L ${colX} ${sy2+5} L ${colX+3} ${sy2}`, stroke: gold, strokeWidth: 0.7, fill: "none", opacity: 0.2 });
        }
      });

      // Bottom zigzag border
      let zPath = `M ${iX+4} ${iY+iH-5}`;
      for (let zx = iX+4; zx < iX+iW-12; zx += 10) {
        zPath += ` L ${zx+5} ${iY+iH-11} L ${zx+10} ${iY+iH-5}`;
      }
      paths.push({ key: `${bkey}-rom-zz`, d: zPath, stroke: gold, strokeWidth: 0.9, fill: "none", opacity: 0.32 });

      // Corner bead clusters (triangle of 3)
      [[iX+8,iY+8],[iX+iW-8,iY+8],[iX+8,iY+iH-8],[iX+iW-8,iY+iH-8]].forEach(([bx,by],idx) => {
        [[0,-3.5],[-2.8,1.5],[2.8,1.5]].forEach(([ddx,ddy],j) => {
          paths.push(mkBoss(bkey, idx*4+j, bx+ddx, by+ddy, 2, gold, 0.55));
        });
      });
      break;
    }

    // ── Gothic Textura ───────────────────────────────────────────────────────
    case "gothic_textura": {
      // Twin lancet arches meeting at top, cusped foils between
      const peakY = iY + 6;
      paths.push({ key: `${bkey}-gt-lancL`, d: `M ${iX+5} ${my+10} Q ${iX+iW*0.3} ${peakY} ${mx-2} ${peakY+10}`, stroke: gold, strokeWidth: 1.6, fill: "none", opacity: 0.58 });
      paths.push({ key: `${bkey}-gt-lancR`, d: `M ${iX+iW-5} ${my+10} Q ${iX+iW*0.7} ${peakY} ${mx+2} ${peakY+10}`, stroke: gold, strokeWidth: 1.6, fill: "none", opacity: 0.58 });
      const fr = iW * 0.07;
      [[mx-fr*2.2,peakY+fr+8],[mx,peakY+fr+8],[mx+fr*2.2,peakY+fr+8]].forEach(([qx,qy],qi) => {
        paths.push({ key: `${bkey}-gt-cusp${qi}`, d: `M ${qx-fr} ${qy} A ${fr} ${fr} 0 1 1 ${qx+fr} ${qy} A ${fr} ${fr} 0 0 1 ${qx-fr} ${qy}`, stroke: gold, strokeWidth: 0.9, fill: "none", opacity: 0.42 });
      });
      // Inverted arch at bottom
      paths.push({ key: `${bkey}-gt-archB`, d: `M ${iX+5} ${my-10} Q ${mx} ${iY+iH-6} ${iX+iW-5} ${my-10}`, stroke: gold, strokeWidth: 1.2, fill: "none", opacity: 0.38 });
      // Diagonal diaper at very low opacity
      const dds = 11;
      for (let ddi = -Math.ceil(iH/dds)*dds; ddi < iW+iH; ddi += dds) {
        paths.push({ key: `${bkey}-gt-d1-${ddi}`, d: `M ${iX} ${iY+ddi} L ${iX+iW} ${iY+ddi-iW}`, stroke: gold, strokeWidth: 0.3, fill: "none", opacity: 0.1 });
        paths.push({ key: `${bkey}-gt-d2-${ddi}`, d: `M ${iX} ${iY+ddi} L ${iX+iW} ${iY+ddi+iW}`, stroke: gold, strokeWidth: 0.3, fill: "none", opacity: 0.1 });
      }
      // Corner pinnacles (pointed triangles)
      [[iX+5,iY+4,-1],[iX+iW-5,iY+4,-1],[iX+5,iY+iH-4,1],[iX+iW-5,iY+iH-4,1]].forEach(([px,py,dir],idx) => {
        paths.push({ key: `${bkey}-gt-pin${idx}`, d: `M ${px-5} ${py} L ${px} ${py+dir*11} L ${px+5} ${py} Z`, fill: gold, opacity: 0.38 });
      });
      // Vertical bar tracery dividers
      const divs = Math.max(2, Math.floor(iW / 16));
      for (let vi = 1; vi < divs; vi++) {
        const vx = iX + vi * (iW / divs);
        paths.push({ key: `${bkey}-gt-bar${vi}`, d: `M ${vx.toFixed(1)} ${(iY+10).toFixed(1)} L ${vx.toFixed(1)} ${(iY+iH-10).toFixed(1)}`, stroke: gold, strokeWidth: 0.55, fill: "none", opacity: 0.2 });
      }
      // Centre quatrefoil
      const qr = Math.min(iW, iH) * 0.07;
      paths.push({ key: `${bkey}-gt-qf`, d: `M ${mx-qr} ${my} A ${qr} ${qr} 0 0 1 ${mx} ${my-qr} A ${qr} ${qr} 0 0 1 ${mx+qr} ${my} A ${qr} ${qr} 0 0 1 ${mx} ${my+qr} A ${qr} ${qr} 0 0 1 ${mx-qr} ${my} Z`, stroke: gold, strokeWidth: 0.9, fill: "none", opacity: 0.45 });
      break;
    }

    // ── Lombardic ────────────────────────────────────────────────────────────
    case "lombardic": {
      // Four vine scrolls from corners to centre, with filled leaves at midpoints
      [
        { sx: iX+4,     sy: iY+4,      c1x: iX+iW*0.16, c1y: iY+4,       c2x: iX+4,       c2y: iY+iH*0.16, ex: mx-10, ey: my-10 },
        { sx: iX+iW-4,  sy: iY+4,      c1x: iX+iW*0.84, c1y: iY+4,       c2x: iX+iW-4,    c2y: iY+iH*0.16, ex: mx+10, ey: my-10 },
        { sx: iX+4,     sy: iY+iH-4,   c1x: iX+iW*0.16, c1y: iY+iH-4,    c2x: iX+4,       c2y: iY+iH*0.84, ex: mx-10, ey: my+10 },
        { sx: iX+iW-4,  sy: iY+iH-4,   c1x: iX+iW*0.84, c1y: iY+iH-4,    c2x: iX+iW-4,    c2y: iY+iH*0.84, ex: mx+10, ey: my+10 },
      ].forEach(({ sx, sy, c1x, c1y, c2x, c2y, ex, ey }, i) => {
        paths.push({ key: `${bkey}-lom-vine${i}`, d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, stroke: gold, strokeWidth: 1.8, fill: "none", opacity: 0.52 });
        // Main leaf at 55% along vine
        const lx = sx + (ex - sx) * 0.55; const ly = sy + (ey - sy) * 0.55;
        paths.push(mkLeaf(bkey, i, lx, ly, ex, ey, iW*0.045, gold, 0.58));
        // Secondary leaf curling back
        paths.push(mkLeaf(bkey, i+10, lx, ly, sx+(lx-sx)*0.4, sy+(ly-sy)*0.4, iW*0.03, gold, 0.38));
      });

      // Berry clusters (3 dots triangle) at corners + centre
      [[iX+8,iY+8],[iX+iW-8,iY+8],[iX+8,iY+iH-8],[iX+iW-8,iY+iH-8],[mx,my]].forEach(([bx,by],bi) => {
        [[0,-4],[-3,2],[3,2]].forEach(([ddx,ddy],j) => {
          paths.push(mkBoss(bkey, bi*4+j+20, bx+ddx, by+ddy, bi===4 ? 3.2 : 2.6, gold, bi===4 ? 0.72 : 0.58));
        });
      });

      // Beaded border along all four inner edges
      const bGap = 9; const bRad = 1.6;
      for (let bx2 = iX+6; bx2 < iX+iW-6; bx2 += bGap) {
        paths.push(mkBoss(bkey, 1000+Math.round(bx2), bx2, iY+4,    bRad, gold, 0.4));
        paths.push(mkBoss(bkey, 2000+Math.round(bx2), bx2, iY+iH-4, bRad, gold, 0.4));
      }
      for (let by2 = iY+14; by2 < iY+iH-14; by2 += bGap) {
        paths.push(mkBoss(bkey, 3000+Math.round(by2), iX+4,    by2, bRad, gold, 0.4));
        paths.push(mkBoss(bkey, 4000+Math.round(by2), iX+iW-4, by2, bRad, gold, 0.4));
      }

      // Side leaf pairs on higher variants
      if (spec.flourishVariant > 0) {
        const lp: [number,number,number,number][] = [
          [iX+10,my,iX+18,my-9],[iX+10,my,iX+18,my+9],
          [iX+iW-10,my,iX+iW-18,my-9],[iX+iW-10,my,iX+iW-18,my+9],
        ];
        lp.forEach(([x1,y1,x2,y2],i) => paths.push(mkLeaf(bkey, 50+i, x1,y1,x2,y2, iW*0.04, gold, 0.44)));
      }
      break;
    }

    // ── Renaissance Foliated ─────────────────────────────────────────────────
    case "renaissance_foliated":
    default: {
      // Egg-and-dart top border
      const ead = 13;
      for (let ex2 = iX+6; ex2 < iX+iW-10; ex2 += ead) {
        paths.push({ key: `${bkey}-rf-egg${Math.round(ex2)}`, d: `M ${ex2-3.8} ${iY+5} A 3.8 5 0 1 1 ${ex2+3.8} ${iY+5}`, stroke: gold, strokeWidth: 0.65, fill: "none", opacity: 0.38 });
        paths.push({ key: `${bkey}-rf-dart${Math.round(ex2)}`, d: `M ${ex2+3.8} ${iY+5} L ${ex2+5.8} ${iY+10} L ${ex2+7.8} ${iY+5}`, stroke: gold, strokeWidth: 0.5, fill: "none", opacity: 0.3 });
      }
      // Cartouche frame with ear extensions
      paths.push({ key: `${bkey}-rf-cart`, d: `M ${iX+iW*0.2} ${iY} Q ${mx} ${iY-5} ${iX+iW*0.8} ${iY} L ${iX+iW} ${iY} L ${iX+iW} ${iY+iH} L ${iX+iW*0.8} ${iY+iH} Q ${mx} ${iY+iH+5} ${iX+iW*0.2} ${iY+iH} L ${iX} ${iY+iH} L ${iX} ${iY} Z`, stroke: gold, strokeWidth: 0.9, fill: "none", opacity: 0.32 });

      // Acanthus scrolls from corners with 2 leaf lobes each
      [
        { sx: iX+4,     sy: iY+4,      c1x: iX+iW*0.28, c1y: iY+4,      c2x: iX+4,      c2y: iY+iH*0.28, ex: iX+iW*0.32, ey: iY+iH*0.32 },
        { sx: iX+iW-4,  sy: iY+4,      c1x: iX+iW*0.72, c1y: iY+4,      c2x: iX+iW-4,   c2y: iY+iH*0.28, ex: iX+iW*0.68, ey: iY+iH*0.32 },
        { sx: iX+4,     sy: iY+iH-4,   c1x: iX+iW*0.28, c1y: iY+iH-4,   c2x: iX+4,      c2y: iY+iH*0.72, ex: iX+iW*0.32, ey: iY+iH*0.68 },
        { sx: iX+iW-4,  sy: iY+iH-4,   c1x: iX+iW*0.72, c1y: iY+iH-4,   c2x: iX+iW-4,   c2y: iY+iH*0.72, ex: iX+iW*0.68, ey: iY+iH*0.68 },
      ].forEach(({ sx, sy, c1x, c1y, c2x, c2y, ex, ey }, i) => {
        paths.push({ key: `${bkey}-rf-ac${i}`, d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, stroke: gold, strokeWidth: 1.2, fill: "none", opacity: 0.48 });
        const ldx = ex - sx > 0 ? 8 : -8;
        paths.push(mkLeaf(bkey, 10+i, ex, ey, ex+ldx, ey-7, iW*0.05, gold, 0.45));
        paths.push(mkLeaf(bkey, 20+i, ex, ey, ex+ldx*0.4, ey+9, iW*0.038, gold, 0.40));
      });

      // Classical pilaster strips with flute lines
      const pilW = Math.max(4, iW * 0.085);
      [[iX+3],[iX+iW-3-pilW]].forEach(([px],pi) => {
        paths.push({ key: `${bkey}-rf-pil${pi}`, d: `M ${px} ${iY+14} L ${px+pilW} ${iY+14} L ${px+pilW} ${iY+iH-14} L ${px} ${iY+iH-14} Z`, stroke: gold, strokeWidth: 0.5, fill: gold, opacity: 0.13 });
        for (let fi = 1; fi <= 2; fi++) {
          const fx = px + pilW * fi / 3;
          paths.push({ key: `${bkey}-rf-fl${pi}-${fi}`, d: `M ${fx.toFixed(1)} ${(iY+16).toFixed(1)} L ${fx.toFixed(1)} ${(iY+iH-16).toFixed(1)}`, stroke: gold, strokeWidth: 0.35, fill: "none", opacity: 0.2 });
        }
      });

      // Diamond rosette at centre with 4 satellite diamonds
      const rq = Math.min(iW, iH) * 0.075;
      paths.push(mkDiamond(bkey, 200, mx, my, rq, rq*0.65, gold, "none", 0.42));
      paths.push(mkBoss(bkey, 201, mx, my, rq*0.38, gold, 0.48));
      [[mx,my-rq*2],[mx+rq*2,my],[mx,my+rq*2],[mx-rq*2,my]].forEach(([dx2,dy2],i) => {
        paths.push(mkDiamond(bkey, 210+i, dx2, dy2, rq*0.45, rq*0.35, "none", gold, 0.35));
      });

      // Foliated wave band (higher variants)
      if (spec.flourishVariant > 0) {
        const amp = iH * 0.04; const freq = iW * 0.26;
        let wPath = `M ${iX+8} ${my}`;
        for (let wx = iX+8; wx < iX+iW-8; wx += freq) {
          wPath += ` Q ${wx+freq/2} ${my-amp} ${wx+freq} ${my}`;
        }
        paths.push({ key: `${bkey}-rf-wave`, d: wPath, stroke: gold, strokeWidth: 0.8, fill: "none", opacity: 0.32 });
      }

      // Corner diamond ornaments
      [[iX+5,iY+5],[iX+iW-5,iY+5],[iX+5,iY+iH-5],[iX+iW-5,iY+iH-5]].forEach(([px,py],idx) => {
        paths.push(mkDiamond(bkey, 300+idx, px, py, 4, 4, gold, "none", 0.52));
      });
      break;
    }
  }

  return paths;
}

// ── Public geometry builder ───────────────────────────────────────────────────

export function buildOrnateInitialGeometry(
  letter: string,
  cx: number,
  cy: number,
  capW: number,
  capH: number,
  _capFS: number,
  seed: string,
  bkey: string,
): OrnateInitialGeometry {
  const spec = pickLetterform(seed);
  const pad = Math.min(capW, capH) * 0.065;
  const iX = cx + pad; const iY = cy + pad;
  const iW = capW - pad * 2; const iH = capH - pad * 2;

  const letterFS = capH * spec.letterScale;
  const letterY = cy + capH / 2 + letterFS * 0.36;
  const lx = cx + capW / 2;

  const isLightGround = spec.matrix === "pen_flourish";
  const letterStroke = isLightGround ? "none" : spec.theme.gold;
  const letterSW = isLightGround ? 0 : 0.5;

  const letterUnderlay = isLightGround ? undefined : {
    x: lx + letterFS * 0.025,
    y: letterY + letterFS * 0.025,
    text: letter,
    fontFamily: spec.fontFamily,
    fontSize: letterFS,
    fontWeight: spec.letterWeight,
    fill: "rgba(0,0,0,0.4)",
    opacity: 1,
  };

  return {
    spec,
    shadow: { x: cx+2, y: cy+2, w: capW, h: capH, rx: spec.outerRadius },
    field: { x: cx, y: cy, w: capW, h: capH, rx: spec.outerRadius, fill: spec.theme.field },
    inner: { x: iX, y: iY, w: iW, h: iH, rx: spec.innerRadius, fill: spec.theme.inner },
    outerStroke: { x: cx, y: cy, w: capW, h: capH, rx: spec.outerRadius, stroke: spec.theme.gold, strokeWidth: spec.borderWidth },
    innerStroke: { x: iX+2.5, y: iY+2.5, w: iW-5, h: iH-5, rx: Math.max(1, spec.innerRadius-1), stroke: GOLD_DARK, strokeWidth: 0.7, opacity: 0.9 },
    paths: matrixOrnaments(spec, cx, cy, capW, capH, bkey),
    letterUnderlay,
    letter: {
      x: lx, y: letterY, text: letter,
      fontFamily: spec.fontFamily, fontSize: letterFS, fontWeight: spec.letterWeight,
      fill: spec.theme.letter, stroke: letterStroke, strokeWidth: letterSW,
    },
  };
}
