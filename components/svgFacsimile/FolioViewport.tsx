/**
 * Folio viewport: fit width, pan, and zoom (SPEC-FOLIO-VIEWPORT).
 */
import { ActionButton } from "@/components/ui/ActionButton";
import { useT } from "@/i18n/runtime";
import {
  belowLegibilityFloor,
  clampZoom,
  computeFitScale,
  stepZoom,
} from "@/utils/folioScale";
import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CANVAS_W } from "./pageLayout";
import { FS } from "./tokenRendering";

export interface FolioViewportProps {
  pageWidth?: number;
  pageHeight?: number;
  children: React.ReactNode;
  onSwitchToReadingView?: () => void;
  /** Changing this resets zoom to fit width (FV-7, per workspace). */
  resetKey?: string;
}

type ZoomMode = "fit" | "actual" | "custom";

export function FolioViewport({
  pageWidth = CANVAS_W,
  pageHeight,
  children,
  onSwitchToReadingView,
  resetKey,
}: FolioViewportProps) {
  const t = useT();
  const { setViewportScale } = useScrollAnchor();
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(pageHeight ?? 1);
  const [mode, setMode] = useState<ZoomMode>("fit");
  const [customScale, setCustomScale] = useState(1);
  const [legibilityDismissed, setLegibilityDismissed] = useState(false);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setContainerWidth(width);
  }, []);

  const fitScale = useMemo(
    () => computeFitScale(containerWidth, pageWidth),
    [containerWidth, pageWidth],
  );

  const activeScale = mode === "fit" ? fitScale : mode === "actual" ? 1 : customScale;
  const scaleRef = useRef(1);
  scaleRef.current = activeScale;
  const layoutHeight = pageHeight ?? contentHeight;

  useEffect(() => {
    setMode("fit");
    setCustomScale(1);
    setLegibilityDismissed(false);
  }, [resetKey]);

  useEffect(() => {
    setViewportScale(activeScale);
  }, [activeScale, setViewportScale]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setMode("custom");
        setCustomScale(stepZoom(scaleRef.current, 1));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setMode("custom");
        setCustomScale(stepZoom(scaleRef.current, -1));
      } else if (event.key === "0") {
        event.preventDefault();
        setMode("fit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitScale]);

  const showLegibility =
    !legibilityDismissed && belowLegibilityFloor(FS, activeScale) && Boolean(onSwitchToReadingView);

  const cycleMode = () => {
    if (mode === "fit") setMode("actual");
    else setMode("fit");
  };

  return (
    <View style={styles.viewport} onLayout={handleLayout}>
      <View style={styles.toolbar}>
        <ActionButton
          variant="ghost"
          label="−"
          accessibilityLabel={t("folio.zoomOut")}
          onPress={() => {
            setMode("custom");
            setCustomScale(stepZoom(activeScale, -1));
          }}
        />
        <ActionButton
          variant="ghost"
          label={mode === "fit" ? t("folio.zoomFit") : `${Math.round(clampZoom(activeScale) * 100)}%`}
          accessibilityLabel={t("folio.zoomCycle")}
          onPress={cycleMode}
        />
        <ActionButton
          variant="ghost"
          label="+"
          accessibilityLabel={t("folio.zoomIn")}
          onPress={() => {
            setMode("custom");
            setCustomScale(stepZoom(activeScale, 1));
          }}
        />
      </View>

      {showLegibility ? (
        <View style={styles.legibilityBanner} accessibilityRole="alert">
          <Text style={styles.legibilityText}>{t("folio.legibility")}</Text>
          <ActionButton
            variant="secondary"
            label={t("folio.readingView")}
            onPress={onSwitchToReadingView}
          />
          <ActionButton
            variant="ghost"
            label={t("common.close")}
            onPress={() => setLegibilityDismissed(true)}
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.scroller}
        contentContainerStyle={styles.scrollerContent}
      >
        <ScrollView nestedScrollEnabled>
          <View
            style={{
              width: pageWidth * activeScale,
              height: Math.max(1, layoutHeight) * activeScale,
            }}
          >
            <View
              onLayout={(event) => {
                const next = event.nativeEvent.layout.height;
                if (next > 0) setContentHeight(next);
              }}
              style={{
                width: pageWidth,
                transform: [{ scale: activeScale }],
                ...(Platform.OS === "web" ? ({ transformOrigin: "top left" } as object) : null),
              }}
            >
              {children}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: "100%",
    ...(Platform.OS === "web" ? ({ overflow: "auto" } as object) : null),
  },
  toolbar: { flexDirection: "row", gap: 4, marginBottom: 6, flexWrap: "wrap" },
  scroller: { width: "100%", maxHeight: 1200 },
  scrollerContent: { flexGrow: 1 },
  legibilityBanner: {
    width: "100%",
    backgroundColor: "rgba(42, 18, 12, 0.95)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    marginBottom: 8,
  },
  legibilityText: { color: "#fff4d2", fontSize: 13 },
});
