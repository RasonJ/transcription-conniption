import { t as tNow } from "@/i18n/core";
import { LH } from "@/components/svgFacsimile/tokenRendering";
import type { Token } from "@/constants/manuscript";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import {
  buildInitialScene,
  serializeInitialScene,
  type InitialTradition,
} from "@/utils/initials/scene";
import { resolveInitialSpec } from "@/utils/initials/spec";
import { InitialTraditionContext } from "@/utils/initials/TraditionContext";
import React, { useContext } from "react";

export interface HtmlOrnateDropCapProps {
  token: Token;
  folioId: string;
  blockIndex: number;
  bkey: string;
  imageUri?: string;
  onPress?: () => void;
  tradition?: InitialTradition;
}

export function HtmlOrnateDropCap({
  token,
  folioId,
  blockIndex,
  bkey,
  imageUri,
  onPress,
  tradition,
}: HtmlOrnateDropCapProps) {
  const contextTradition = useContext(InitialTraditionContext);
  const activeTradition = tradition ?? contextTradition ?? "print.woodcut";
  const depth = token.initialDepth ?? 3;
  const letter = token.value ?? "?";
  const scene = buildInitialScene(
    resolveInitialSpec({
      letter,
      depth,
      tradition: activeTradition,
      illuminated: true,
      sequence: blockIndex,
      seed: `${folioId}|${letter}|${bkey}`,
    }),
    LH,
  );
  const resolvedUri = imageUri ? resolveStoredFileUri(imageUri) : undefined;

  const interactiveStyle: React.CSSProperties = {
    display: "block",
    width: scene.boxWidth,
    height: scene.boxHeight,
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
          border: "1px solid #3a2a1d",
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={tNow("facsimile.replaceInitial", { letter })}
      style={interactiveStyle}
    >
      <svg
        width={scene.boxWidth}
        height={scene.boxHeight}
        viewBox={`0 0 ${scene.boxWidth} ${scene.boxHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
        dangerouslySetInnerHTML={{ __html: serializeInitialScene(scene) }}
      />
    </button>
  );
}
