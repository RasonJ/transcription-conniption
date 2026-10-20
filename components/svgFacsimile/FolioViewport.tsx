/**
 * Responsive parchment scale + legibility floor (SPEC-FOLIO-VIEWPORT FV-1…FV-5).
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CANVAS_W } from "./pageLayout";
import { FS } from "./tokenRendering";

export interface FolioViewportProps {
  pageWidth?: number;
  pageHeight: number;
  children: React.ReactNode;
  onSwitchToReadingView?: () => void;
}

const LEGIBILITY_FLOOR_PX = 11;

export function FolioViewport({
  pageWidth = CANVAS_W,
  pageHeight,
  children,
  onSwitchToReadingView,
}: FolioViewportProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [userScale, setUserScale] = useState<number | null>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }, []);

  const fitScale = useMemo(() => {
    if (containerWidth <= 0) return 1;
    const padding = 16;
    const available = containerWidth - padding * 2;
    return Math.min(1.5, Math.max(0.25, available / pageWidth));
  }, [containerWidth, pageWidth]);

  const activeScale = userScale ?? fitScale;
  const effectiveFontSize = FS * activeScale;
  const isBelowLegibilityFloor = effectiveFontSize < LEGIBILITY_FLOOR_PX;

  return (
    <View style={styles.viewportContainer} onLayout={handleLayout}>
      {isBelowLegibilityFloor && onSwitchToReadingView ? (
        <View style={styles.legibilityBanner} accessibilityRole="alert">
          <Text style={styles.legibilityText}>
            Text size is small at this width ({effectiveFontSize.toFixed(1)}px).
          </Text>
          <Pressable
            onPress={onSwitchToReadingView}
            style={styles.bannerButton}
            accessibilityRole="button"
            accessibilityLabel="Switch to Reading View"
          >
            <Text style={styles.bannerButtonText}>Switch to Reading View</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.scalableCanvas,
          {
            width: pageWidth * activeScale,
            height: pageHeight * activeScale,
          },
        ]}
      >
        <View
          style={{
            width: pageWidth,
            height: pageHeight,
            transform: [{ scale: activeScale }],
            ...(Platform.OS === "web"
              ? ({ transformOrigin: "top left" } as object)
              : null),
          }}
        >
          {children}
        </View>
      </View>

      {userScale !== null ? (
        <Pressable
          onPress={() => setUserScale(null)}
          accessibilityRole="button"
          accessibilityLabel="Reset zoom to fit"
          style={styles.resetZoom}
        >
          <Text style={styles.resetZoomText}>Fit width</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewportContainer: {
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
  },
  scalableCanvas: {
    overflow: "hidden",
    alignSelf: "center",
  },
  legibilityBanner: {
    width: "100%",
    backgroundColor: "rgba(155, 34, 23, 0.9)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  legibilityText: { color: "#fff4d2", fontSize: 12, flex: 1 },
  bannerButton: {
    backgroundColor: "#f6d890",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bannerButtonText: { color: "#1a0a05", fontSize: 11, fontWeight: "bold" },
  resetZoom: { marginTop: 6, padding: 4 },
  resetZoomText: { color: "#f6d890", fontSize: 11, fontWeight: "700" },
});
