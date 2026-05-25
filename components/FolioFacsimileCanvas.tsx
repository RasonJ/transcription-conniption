import { FigurePlaceholder } from "@/components/FigurePlaceholder";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import type { FacsimilePlacement, FolioSide, Token } from "@/constants/manuscript";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

type Props = {
  folio: FolioSide;
  backgroundUri?: string;
  freePlacements: FacsimilePlacement[];
  placementMode: boolean;
  onCanvasPress?: (folioId: string, relX: number, relY: number) => void;
  onSetFolioBackground?: (folioId: string) => void;
  children: React.ReactNode;
};

function placementToken(placement: FacsimilePlacement): Token {
  return {
    type: "figure_anchor",
    value: placement.caption,
    raw: `{${placement.figureType}. ${placement.caption}}`,
    figureId: placement.placementId,
    figureType: placement.figureType,
  };
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampPercent(ratio: number): string {
  return `${Math.min(92, Math.max(4, ratio * 100))}%`;
}

export function FolioFacsimileCanvas({
  folio,
  backgroundUri,
  freePlacements,
  placementMode,
  onCanvasPress,
  onSetFolioBackground,
  children,
}: Props) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<View>(null);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasSize({ width, height });
    }
  }, []);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!placementMode || !onCanvasPress || canvasSize.width <= 0) return;

      const { locationX, locationY } = event.nativeEvent;
      const relX = clampRatio(locationX / canvasSize.width);
      const relY = clampRatio(locationY / canvasSize.height);

      onCanvasPress(folio.id, relX, relY);
    },
    [placementMode, onCanvasPress, canvasSize, folio.id],
  );

  const folioPlacements = useMemo(
    () => freePlacements.filter((p) => p.folioId === folio.id),
    [freePlacements, folio.id],
  );

  return (
    <View ref={canvasRef} style={styles.canvas} onLayout={handleLayout}>
      {backgroundUri ? (
        <Image
          source={{ uri: resolveStoredFileUri(backgroundUri) }}
          style={styles.backgroundImage}
          resizeMode="contain"
        />
      ) : null}

      <Pressable
        onPress={handlePress}
        style={[styles.contentLayer, placementMode && styles.contentLayerPlacementMode]}
      >
        {children}
      </Pressable>

      {folioPlacements.map((placement) => (
        <View
          key={placement.placementId}
          style={[
            styles.placementPin,
            {
              left: clampPercent(placement.relX),
              top: clampPercent(placement.relY),
              pointerEvents: "box-none",
            },
          ]}
        >
          <View style={styles.placementCard}>
            <FigurePlaceholder token={placementToken(placement)} />
          </View>
        </View>
      ))}

      {onSetFolioBackground ? (
        <Pressable
          onPress={() => onSetFolioBackground(folio.id)}
          style={({ pressed }) => [styles.folioBgButton, pressed && styles.pressed]}
        >
          <Text style={styles.folioBgButtonText}>
            {backgroundUri ? "Replace leaf scan" : "Add leaf scan"}
          </Text>
        </Pressable>
      ) : null}

      {placementMode ? (
        <View style={[styles.placementHint, { pointerEvents: "none" }]}>
          <Text style={styles.placementHintText}>Tap to place a facsimile fragment</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: "relative", minHeight: 200, width: "100%" },
  backgroundImage: { ...StyleSheet.absoluteFillObject, opacity: 0.35, borderRadius: 6 },
  contentLayer: { zIndex: 1, width: "100%" },
  contentLayerPlacementMode: {
    borderWidth: 1,
    borderColor: "rgba(155,34,23,0.35)",
    borderStyle: "dashed",
    borderRadius: 8,
  },
  placementPin: {
    position: "absolute",
    width: 140,
    marginLeft: -70,
    marginTop: -40,
    zIndex: 5,
  },
  placementCard: {
    backgroundColor: "rgba(244,235,208,0.95)",
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(155,34,23,0.4)",
  },
  folioBgButton: {
    position: "absolute",
    top: 4,
    left: 4,
    zIndex: 6,
    backgroundColor: "rgba(92,28,17,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  folioBgButtonText: { color: "#f6d890", fontSize: 10, fontWeight: "700" },
  placementHint: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(155,34,23,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 6,
  },
  placementHintText: { color: "#fff4d2", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.85 },
});
