import type { FolioSide } from "@/constants/manuscript";
import { SynopticPane } from "@/components/SynopticPane";
import React, { useCallback, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type HighlightTarget = { folioId: string; lineNumber?: string } | null;

type Props = {
  folio: FolioSide;
  highlight: HighlightTarget;
  diplomatic: React.ReactNode;
};

export function SynopticFolioSplit({ folio, highlight, diplomatic }: Props) {
  const leftScrollRef = useRef<ScrollView>(null);
  const rightScrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  const [showDiplomaticPanel, setShowDiplomaticPanel] = useState(true);
  const [showNormalizedPanel, setShowNormalizedPanel] = useState(true);

  const handleScroll = useCallback(
    (source: "left" | "right", event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!showDiplomaticPanel || !showNormalizedPanel) return;
      if (isScrolling.current) return;

      isScrolling.current = true;
      const yOffset = event.nativeEvent.contentOffset.y;
      const targetRef = source === "left" ? rightScrollRef : leftScrollRef;

      targetRef.current?.scrollTo({ y: yOffset, animated: false });

      setTimeout(() => {
        isScrolling.current = false;
      }, 20);
    },
    [showDiplomaticPanel, showNormalizedPanel],
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.toggleBar}>
        <Pressable
          onPress={() => setShowDiplomaticPanel((v) => !v)}
          style={[styles.toggleChip, showDiplomaticPanel && styles.toggleChipActive]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showDiplomaticPanel }}
        >
          <Text style={[styles.toggleText, showDiplomaticPanel && styles.toggleTextActive]}>
            Diplomatic
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowNormalizedPanel((v) => !v)}
          style={[styles.toggleChip, showNormalizedPanel && styles.toggleChipActive]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showNormalizedPanel }}
        >
          <Text style={[styles.toggleText, showNormalizedPanel && styles.toggleTextActive]}>
            Normalized
          </Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {showDiplomaticPanel ? (
          <ScrollView
            ref={leftScrollRef}
            style={[styles.paneScroll, !showNormalizedPanel && styles.paneFull]}
            contentContainerStyle={styles.paneContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onScroll={(e) => handleScroll("left", e)}
            scrollEventThrottle={16}
          >
            <Text style={styles.paneTitle}>Diplomatic View</Text>
            {diplomatic}
          </ScrollView>
        ) : null}

        {showNormalizedPanel ? (
          <ScrollView
            ref={rightScrollRef}
            style={[styles.paneScroll, !showDiplomaticPanel && styles.paneFull]}
            contentContainerStyle={styles.paneContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onScroll={(e) => handleScroll("right", e)}
            scrollEventThrottle={16}
          >
            <SynopticPane folio={folio} highlight={highlight} embedded />
          </ScrollView>
        ) : null}

        {!showDiplomaticPanel && !showNormalizedPanel ? (
          <Text style={styles.emptyPaneHint}>Enable at least one synoptic panel.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", maxWidth: 1200, alignSelf: "center" },
  toggleBar: { flexDirection: "row", gap: 8, marginBottom: 8, paddingHorizontal: 2 },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(109,83,57,0.35)",
    backgroundColor: "rgba(244,235,208,0.5)",
  },
  toggleChipActive: { backgroundColor: "#6d5339", borderColor: "#6d5339" },
  toggleText: { fontSize: 11, fontWeight: "800", color: "#6d5339", textTransform: "uppercase" },
  toggleTextActive: { color: "#f4ebd0" },
  row: { flexDirection: "row", width: "100%", height: 500, maxHeight: 600 },
  paneScroll: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(109,83,57,0.15)",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  paneFull: { flex: 1, width: "100%" },
  paneContent: { padding: 12, paddingBottom: 24 },
  paneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6d5339",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  emptyPaneHint: {
    flex: 1,
    textAlign: "center",
    color: "#99836a",
    fontStyle: "italic",
    paddingVertical: 48,
  },
});
