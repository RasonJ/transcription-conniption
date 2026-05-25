import { gw, microTrackingSpace } from "@/components/svgFacsimile/glyphMetrics";
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
 * Renders one micro-tracked line using one {@link TSpan} per segment with a compact
 * `dx` offset array (not one React node per glyph).
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

  const trackingSpace = microTrackingSpace(visible, trackWidth, isLastLine, skipJustify);

  const tspans: React.ReactNode[] = [];
  let charGlobalIdx = 0;
  let baselineShift = 0;

  for (let segIdx = 0; segIdx < visible.length; segIdx++) {
    const s = visible[segIdx];
    const dxValues: number[] = [];

    for (let i = 0; i < s.text.length; i++) {
      const ch = s.text[i];
      const charWidth = gw(ch, s.fs);
      if (charGlobalIdx === 0) {
        dxValues.push(0);
      } else {
        dxValues.push(charWidth + trackingSpace);
      }
      charGlobalIdx++;
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
