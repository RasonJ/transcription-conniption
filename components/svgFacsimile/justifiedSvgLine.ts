import { gw, microTrackingSpace } from "@/components/svgFacsimile/glyphMetrics";
import type { Seg } from "@/components/svgFacsimile/tokenRendering";
import { coalesceSegs, FS } from "@/components/svgFacsimile/tokenRendering";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function segmentDecoration(s: Seg): string {
  if (s.strike && s.underline) return ' text-decoration="underline line-through"';
  if (s.strike) return ' text-decoration="line-through"';
  if (s.underline) return ' text-decoration="underline"';
  return "";
}

/**
 * Compact SVG line: one `<tspan>` per segment with space-separated `dx` offsets.
 */
export function renderJustifiedSvgLine(
  segs: Seg[],
  textStartX: number,
  baselineY: number,
  targetWidth: number,
  isLastLine: boolean,
  skipJustify: boolean,
): string {
  const visible = coalesceSegs(segs.filter((s) => s.text));
  if (visible.length === 0) return "";

  const trackingSpace = microTrackingSpace(visible, targetWidth, isLastLine, skipJustify);
  const parts: string[] = [];
  let charGlobalIdx = 0;
  let baselineShift = 0;

  for (const s of visible) {
    const dxList: string[] = [];
    for (let i = 0; i < s.text.length; i++) {
      const w = gw(s.text[i], s.fs);
      dxList.push((charGlobalIdx === 0 ? 0 : w + trackingSpace).toFixed(2));
      charGlobalIdx++;
    }

    let dyAttr = "";
    if (s.super) {
      const dy = -FS * 0.28 - baselineShift;
      dyAttr = ` dy="${dy.toFixed(2)}"`;
      baselineShift = -FS * 0.28;
    } else if (baselineShift !== 0) {
      dyAttr = ` dy="${(-baselineShift).toFixed(2)}"`;
      baselineShift = 0;
    }

    parts.push(
      `<tspan dx="${dxList.join(" ")}" font-size="${s.fs.toFixed(1)}" fill="${s.fill}"` +
        ` font-style="${s.italic ? "italic" : "normal"}" font-weight="${s.bold ? "bold" : "normal"}"` +
        `${dyAttr}${segmentDecoration(s)}>${escapeXml(s.text)}</tspan>`,
    );
  }

  return (
    `<text x="${textStartX.toFixed(2)}" y="${baselineY.toFixed(2)}" ` +
    `font-family="Georgia, 'Times New Roman', serif" font-size="${FS}">${parts.join("")}</text>`
  );
}
