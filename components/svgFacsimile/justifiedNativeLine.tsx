import { JUSTIFY_MAX_GAP, wordGapExtra } from "@/components/svgFacsimile/glyphMetrics";
import type { Seg } from "@/components/svgFacsimile/tokenRendering";
import { coalesceSegs, FS } from "@/components/svgFacsimile/tokenRendering";
import React from "react";
import { Text as SvgText, TSpan } from "react-native-svg";

export type JustifiedNativeLineProps = {
  segs: Seg[];
  baselineY: number;
  startX: number;
  trackWidth: number;
  keyPrefix: string;
  isLastLine: boolean;
  skipJustify?: boolean;
  fontFamily: string;
  defaultFill: string;
};

/**
 * Renders one line using one {@link TSpan} per segment with a compact `dx`
 * array. Extra advance applies only to word spaces. Salient words arrive with
 * a new fill only, so this gap math still lands on the right rule.
 */
export function renderJustifiedNativeLine(props: JustifiedNativeLineProps): React.ReactNode | null {
  const {
    segs,
    baselineY,
    startX,
    trackWidth,
    keyPrefix,
    isLastLine,
    skipJustify = false,
    fontFamily,
    defaultFill,
  } = props;

  const visible = coalesceSegs(segs.filter((s) => s.text));
  if (visible.length === 0) return null;

  const gapExtra = wordGapExtra(visible, trackWidth, isLastLine, skipJustify, JUSTIFY_MAX_GAP);
  // Skip dx allocations for sub-pixel micro-jitter (long folios / low-end devices).
  const applyJustify = gapExtra > 0.01;

  const tspans: React.ReactNode[] = [];
  let baselineShift = 0;

  for (let segIdx = 0; segIdx < visible.length; segIdx++) {
    const s = visible[segIdx];
    // SVG `dx` adds to natural advance — only space glyphs get justification extras.
    let dxValues: number[] | undefined;
    if (applyJustify) {
      const values: number[] = [];
      let anyExtra = false;
      for (let i = 0; i < s.text.length; i++) {
        const extra = s.text[i] === " " ? gapExtra : 0;
        if (extra > 0) anyExtra = true;
        values.push(extra);
      }
      if (anyExtra) dxValues = values;
    }

    let dy = 0;
    if (s.super) {
      dy = -FS * 0.28 - baselineShift;
      baselineShift = -FS * 0.28;
    } else if (baselineShift !== 0) {
      dy = -baselineShift;
      baselineShift = 0;
    }

    tspans.push(
      <TSpan
        key={`${keyPrefix}-seg-${segIdx}`}
        dx={dxValues}
        dy={dy}
        fontSize={s.fs}
        fill={s.fill}
        fontStyle={s.italic ? "italic" : "normal"}
        fontWeight={s.bold ? "bold" : "normal"}
        textDecoration={
          s.strike ? "line-through" : s.underline ? "underline" : "none"
        }
      >
        {s.text}
      </TSpan>,
    );
  }

  return (
    <SvgText
      key={keyPrefix}
      x={startX}
      y={baselineY}
      fontFamily={fontFamily}
      fontSize={FS}
      fill={defaultFill}
    >
      {tspans}
    </SvgText>
  );
}
