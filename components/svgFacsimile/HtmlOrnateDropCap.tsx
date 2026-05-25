import {
  buildDropCapSeed,
  buildOrnateInitialGeometry,
  GOLD_DARK,
} from "@/components/svgFacsimile/dropInitialLetterform";
import { dropCapBoxWidth } from "@/components/svgFacsimile/pageLayout";
import { LH } from "@/components/svgFacsimile/tokenRendering";
import type { Token } from "@/constants/manuscript";
import { dropCapFontSize } from "@/utils/dropInitial";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import React, { createElement } from "react";

const GOLD_LEAF = "#d4af37";

export interface HtmlOrnateDropCapProps {
  token: Token;
  folioId: string;
  blockIndex: number;
  bkey: string;
  imageUri?: string;
  onPress?: () => void;
}

function SvgRect(props: React.SVGAttributes<SVGRectElement>) {
  return createElement("rect", props);
}

function SvgPath(props: React.SVGAttributes<SVGPathElement>) {
  return createElement("path", props);
}

function SvgTextEl(props: React.SVGAttributes<SVGTextElement>) {
  return createElement("text", props);
}

export function HtmlOrnateDropCap({
  token,
  folioId,
  blockIndex,
  bkey,
  imageUri,
  onPress,
}: HtmlOrnateDropCapProps) {
  const depth = token.initialDepth ?? 3;
  const letterCount = Math.max(1, (token.value ?? "?").length);
  const boxH = depth * LH;
  const boxW = dropCapBoxWidth(boxH, letterCount);
  const capFS =
    Math.min(dropCapFontSize(depth), boxH * 0.78) /
    (letterCount > 1 ? 1 + 0.22 * (letterCount - 1) : 1);
  const resolvedUri = imageUri ? resolveStoredFileUri(imageUri) : undefined;

  const interactiveStyle: React.CSSProperties = {
    display: "block",
    width: boxW,
    height: boxH,
    flexShrink: 0,
    cursor: onPress ? "pointer" : "default",
    border: "none",
    padding: 0,
    background: "transparent",
  };

  if (resolvedUri) {
    return (
      <img
        src={resolvedUri}
        alt=""
        onClick={onPress}
        role={onPress ? "button" : undefined}
        style={{
          ...interactiveStyle,
          objectFit: "contain",
          border: `1.5px solid ${GOLD_LEAF}`,
          borderRadius: 4,
        }}
      />
    );
  }

  const letter = token.value ?? "?";
  const seed = buildDropCapSeed(folioId, letter, blockIndex);
  const geo = buildOrnateInitialGeometry(letter, 0, 0, boxW, boxH, capFS, seed, bkey);

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Replace initial ${letter} with facsimile scan`}
      style={interactiveStyle}
    >
      <svg
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <SvgRect
          x={geo.shadow.x}
          y={geo.shadow.y}
          width={geo.shadow.w}
          height={geo.shadow.h}
          rx={geo.shadow.rx}
          fill="rgba(26,10,5,0.18)"
        />
        <SvgRect
          x={geo.field.x}
          y={geo.field.y}
          width={geo.field.w}
          height={geo.field.h}
          rx={geo.field.rx}
          fill={geo.field.fill}
        />
        <SvgRect
          x={geo.inner.x}
          y={geo.inner.y}
          width={geo.inner.w}
          height={geo.inner.h}
          rx={geo.inner.rx}
          fill={geo.inner.fill}
        />
        <SvgRect
          x={geo.outerStroke.x}
          y={geo.outerStroke.y}
          width={geo.outerStroke.w}
          height={geo.outerStroke.h}
          rx={geo.outerStroke.rx}
          fill="none"
          stroke={geo.outerStroke.stroke}
          strokeWidth={geo.outerStroke.strokeWidth}
        />
        <SvgRect
          x={geo.innerStroke.x}
          y={geo.innerStroke.y}
          width={geo.innerStroke.w}
          height={geo.innerStroke.h}
          rx={geo.innerStroke.rx}
          fill="none"
          stroke={GOLD_DARK}
          strokeWidth={geo.innerStroke.strokeWidth}
          opacity={geo.innerStroke.opacity}
        />
        {geo.paths.map((p) => (
          <SvgPath
            key={p.key}
            d={p.d}
            stroke={p.stroke}
            fill={p.fill ?? "none"}
            strokeWidth={p.strokeWidth}
            opacity={p.opacity}
          />
        ))}
        {geo.letterUnderlay && (
          <SvgTextEl
            x={geo.letterUnderlay.x}
            y={geo.letterUnderlay.y}
            textAnchor="middle"
            fontFamily={geo.letterUnderlay.fontFamily}
            fontSize={geo.letterUnderlay.fontSize}
            fontWeight={String(geo.letterUnderlay.fontWeight)}
            fill={geo.letterUnderlay.fill}
            opacity={geo.letterUnderlay.opacity}
          >
            {geo.letterUnderlay.text}
          </SvgTextEl>
        )}
        <SvgTextEl
          x={geo.letter.x}
          y={geo.letter.y}
          textAnchor="middle"
          fontFamily={geo.letter.fontFamily}
          fontSize={geo.letter.fontSize}
          fontWeight={String(geo.letter.fontWeight)}
          fill={geo.letter.fill}
          stroke={geo.letter.stroke}
          strokeWidth={geo.letter.strokeWidth}
        >
          {geo.letter.text}
        </SvgTextEl>
      </svg>
    </button>
  );
}
