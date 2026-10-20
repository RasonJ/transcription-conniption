/**
 * Native SVG adapter over `buildInitialScene` (SPEC-ORNATE-INITIALS §9).
 */
import { sceneItemsToNodes } from "@/components/svgFacsimile/UniversalInitial";
import { buildInitialScene, type InitialTradition } from "@/utils/initials/scene";
import { resolveInitialSpec } from "@/utils/initials/spec";
import React from "react";
import { Image as SvgImage, Rect } from "react-native-svg";

export type OrnateInitialStyleVariant = 0 | 1 | 2 | 3;

export function renderOrnateInitialSvg(
  letter: string,
  cx: number,
  cy: number,
  capW: number,
  capH: number,
  _capFS: number,
  folioId: string,
  blockIndex: number,
  bkey: string,
  uploadedUri?: string,
  onPress?: () => void,
  options?: { tradition?: InitialTradition; depth?: number },
): React.ReactNode[] {
  const depth = Math.max(1, options?.depth ?? 3);
  const lineAdvance = capH / depth;
  const spec = resolveInitialSpec({
    letter,
    depth,
    tradition: options?.tradition ?? "ms.penwork",
    sequence: blockIndex,
    seed: `${folioId}|${letter}|${blockIndex}`,
  });
  const scene = buildInitialScene(spec, lineAdvance);

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
        stroke="#3a2a1d"
        strokeWidth={1}
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

  return [
    ...sceneItemsToNodes(scene, cx, cy, bkey),
    <Rect
      key={`${bkey}-tap`}
      x={cx}
      y={cy}
      width={scene.boxWidth}
      height={scene.boxHeight}
      fill="transparent"
      onPress={onPress}
    />,
  ];
}
