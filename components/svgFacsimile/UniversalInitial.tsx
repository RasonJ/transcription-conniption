/**
 * Renders an InitialScene with react-native-svg (web + native).
 */
import {
  buildInitialScene,
  type InitialScene,
  type InitialSpec,
  type SceneItem,
} from "@/utils/initials/scene";
import React from "react";
import { G, Image as SvgImage, Path, Rect, Svg, Text as SvgText } from "react-native-svg";

export interface UniversalInitialProps {
  spec: InitialSpec;
  lineAdvance: number;
  uploadedUri?: string;
  onPress?: () => void;
}

export function sceneItemsToNodes(
  scene: InitialScene,
  originX: number,
  originY: number,
  keyPrefix: string,
): React.ReactNode[] {
  return [
    <G key={keyPrefix} transform={`translate(${originX}, ${originY})`}>
      {scene.items.map((item: SceneItem, idx: number) => {
        const key = `${keyPrefix}-${idx}`;
        switch (item.kind) {
          case "rect":
            return (
              <Rect
                key={key}
                x={item.x}
                y={item.y}
                width={item.w}
                height={item.h}
                fill={item.fill ?? "none"}
                stroke={item.stroke}
                strokeWidth={item.strokeWidth}
              />
            );
          case "path":
            return (
              <Path
                key={key}
                d={item.d}
                fill={item.fill ?? "none"}
                stroke={item.stroke}
                strokeWidth={item.strokeWidth}
                opacity={item.opacity}
              />
            );
          case "text":
            return (
              <SvgText
                key={key}
                x={item.x}
                y={item.y}
                fontFamily={item.fontFamily}
                fontSize={item.fontSize}
                fontWeight={item.fontWeight}
                fill={item.fill}
                textAnchor={item.anchor ?? "start"}
              >
                {item.text}
              </SvgText>
            );
          case "image":
            return (
              <SvgImage key={key} x={item.x} y={item.y} width={item.w} height={item.h} href={item.href} />
            );
          default:
            return null;
        }
      })}
    </G>,
  ];
}

export function UniversalInitial({ spec, lineAdvance, uploadedUri, onPress }: UniversalInitialProps) {
  const scene = buildInitialScene(spec, lineAdvance);

  if (uploadedUri) {
    return (
      <Svg width={scene.boxWidth} height={scene.boxHeight} onPress={onPress}>
        <SvgImage
          x={0}
          y={0}
          width={scene.boxWidth}
          height={scene.boxHeight}
          href={uploadedUri}
          preserveAspectRatio="xMidYMid slice"
        />
      </Svg>
    );
  }

  const width = scene.boxWidth + scene.marginOverflowLeft;
  const height = scene.boxHeight + scene.marginOverflowTop + scene.marginOverflowBottom;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`-${scene.marginOverflowLeft} -${scene.marginOverflowTop} ${width} ${height}`}
      onPress={onPress}
      accessibilityRole="image"
      accessibilityLabel={`Decorated initial ${scene.a11yText}`}
    >
      {sceneItemsToNodes(scene, 0, 0, "initial")}
    </Svg>
  );
}
