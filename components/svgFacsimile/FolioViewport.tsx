/**
 * Folio viewport: fit width, scroll-pan, pinch zoom, and double-tap (SPEC-FOLIO-VIEWPORT).
 * Pan stays on the scroll views so wheel, scrollbars, and line anchors keep working.
 * Pinch and double-tap use gesture-handler callbacks on the JS thread.
 */
import { ActionButton } from "@/components/ui/ActionButton";
import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import { useT } from "@/i18n/runtime";
import {
  belowLegibilityFloor,
  computeFitScale,
  cycleZoomMode,
  resolveDisplayFitScale,
  scaleFromPinch,
  stepZoom,
  type ZoomMode,
} from "@/utils/folioScale";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { PinchGestureHandler, State, TapGestureHandler } from "react-native-gesture-handler";
import { CANVAS_W } from "./pageLayout";
import { FS } from "./tokenRendering";

export type { ZoomMode } from "@/utils/folioScale";

export interface FolioViewportProps {
  pageWidth?: number;
  pageHeight?: number;
  children: React.ReactNode;
  onSwitchToReadingView?: () => void;
  /** Resets zoom mode when the workspace changes. */
  resetKey?: string;
  /** Fires when the scale used for line anchors changes. */
  onScaleChange?: (scale: number) => void;
}

function preferredZoomMode(): ZoomMode {
  return Platform.OS === "web" ? "actual" : "fit";
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const FolioViewport = React.memo(function FolioViewport({
  pageWidth = CANVAS_W,
  pageHeight,
  children,
  onSwitchToReadingView,
  resetKey,
  onScaleChange,
}: FolioViewportProps) {
  const t = useT();
  const { setViewportScale } = useScrollAnchor();
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(pageHeight ?? 1);
  const [mode, setMode] = useState<ZoomMode>(preferredZoomMode);
  const [customScale, setCustomScale] = useState(1);
  const [legibilityDismissed, setLegibilityDismissed] = useState(false);
  const pinchStart = useRef(1);
  const pendingPinch = useRef(1);
  const pinchFrame = useRef<number | null>(null);
  const legibilityMounted = useRef(false);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setContainerWidth((prev) => (width > 0 && Math.abs(width - prev) > 1 ? width : prev));
  }, []);

  const rawFitScale = useMemo(
    () => computeFitScale(containerWidth, pageWidth),
    [containerWidth, pageWidth],
  );
  const fitScale = useMemo(
    () =>
      resolveDisplayFitScale(rawFitScale, FS, {
        web: Platform.OS === "web",
        containerWidth,
      }),
    [containerWidth, rawFitScale],
  );

  const activeScale = mode === "fit" ? fitScale : mode === "actual" ? 1 : customScale;
  const scaleRef = useRef(activeScale);
  scaleRef.current = activeScale;
  const layoutHeight = pageHeight ?? contentHeight;

  useEffect(() => {
    setMode(preferredZoomMode());
    setCustomScale(1);
    setLegibilityDismissed(false);
  }, [resetKey]);

  useEffect(() => {
    setViewportScale(activeScale);
    onScaleChange?.(activeScale);
  }, [activeScale, onScaleChange, setViewportScale]);

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
  }, []);

  const showLegibility =
    !legibilityDismissed && belowLegibilityFloor(FS, activeScale) && Boolean(onSwitchToReadingView);

  useEffect(() => {
    if (!legibilityMounted.current) {
      legibilityMounted.current = true;
      return;
    }
    if (Platform.OS === "web") return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [showLegibility]);

  const cycleMode = useCallback(() => {
    setMode((prev) => cycleZoomMode(prev));
  }, []);

  const handleZoomOut = useCallback(() => {
    setMode("custom");
    setCustomScale(stepZoom(scaleRef.current, -1));
  }, []);

  const handleZoomIn = useCallback(() => {
    setMode("custom");
    setCustomScale(stepZoom(scaleRef.current, 1));
  }, []);

  const commitPinch = useCallback((next: number) => {
    setMode("custom");
    setCustomScale(next);
  }, []);

  const onPinchStateChange = useCallback(
    (event: { nativeEvent: { state: number; scale: number } }) => {
      const { state, scale } = event.nativeEvent;
      if (state === State.BEGAN) pinchStart.current = scaleRef.current;
      if (state === State.END || state === State.CANCELLED) {
        commitPinch(scaleFromPinch(pinchStart.current, scale));
      }
    },
    [commitPinch],
  );

  const onPinchEvent = useCallback(
    (event: { nativeEvent: { scale: number } }) => {
      pendingPinch.current = scaleFromPinch(pinchStart.current, event.nativeEvent.scale);
      if (pinchFrame.current != null) return;
      pinchFrame.current = requestAnimationFrame(() => {
        pinchFrame.current = null;
        commitPinch(pendingPinch.current);
      });
    },
    [commitPinch],
  );

  const onDoubleTap = useCallback(
    (event: { nativeEvent: { state: number } }) => {
      if (event.nativeEvent.state === State.ACTIVE) cycleMode();
    },
    [cycleMode],
  );

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next <= 0) return;
    setContentHeight((prev) => (Math.abs(next - prev) > 1 ? next : prev));
  }, []);

  const percentageLabel = `${Math.round(activeScale * 100)}%`;
  const webScaleStyle =
    Platform.OS === "web"
      ? ({ transformOrigin: "top left", willChange: "transform" } as object)
      : null;

  return (
    <View style={styles.viewport} onLayout={handleLayout}>
      <View style={styles.toolbar} accessibilityRole="toolbar">
        <ActionButton
          variant="ghost"
          label="−"
          accessibilityLabel={t("folio.zoomOut")}
          onPress={handleZoomOut}
        />
        <ActionButton
          variant="ghost"
          label={mode === "fit" ? `${t("folio.zoomFit")} (${percentageLabel})` : percentageLabel}
          accessibilityLabel={t("folio.zoomCycle")}
          onPress={cycleMode}
        />
        <ActionButton
          variant="ghost"
          label="+"
          accessibilityLabel={t("folio.zoomIn")}
          onPress={handleZoomIn}
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

      <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
        <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            style={styles.scroller}
            contentContainerStyle={styles.scrollerContent}
            showsHorizontalScrollIndicator
          >
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
              <View
                style={{
                  width: pageWidth * activeScale,
                  height: Math.max(1, layoutHeight) * activeScale,
                }}
              >
                <View
                  onLayout={handleContentLayout}
                  style={{
                    width: pageWidth,
                    transform: [{ scale: activeScale }],
                    ...webScaleStyle,
                  }}
                >
                  {children}
                </View>
              </View>
            </ScrollView>
          </ScrollView>
        </PinchGestureHandler>
      </TapGestureHandler>
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: {
    width: "100%",
    ...(Platform.OS === "web" ? ({ overflow: "auto" } as object) : null),
  },
  toolbar: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  scroller: { width: "100%", maxHeight: 1200 },
  scrollerContent: { flexGrow: 1 },
  legibilityBanner: {
    width: "100%",
    backgroundColor: "rgba(42, 18, 12, 0.95)",
    borderColor: "rgba(246, 216, 144, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  legibilityText: { color: "#fff4d2", fontSize: 13, flex: 1 },
});
