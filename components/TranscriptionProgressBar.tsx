import { scriptoriumTheme as theme } from "@/constants/scriptoriumTheme";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export type TranscriptionProgressBarProps = {
  isProcessing: boolean;
  current: number;
  total: number;
  activeFolio: string;
  phase?: "slicing" | "transcribing" | "repairing" | "merging" | "idle";
  /** Localized status line from the Studio (preferred). */
  label?: string;
};

export function TranscriptionProgressBar({
  isProcessing,
  current,
  total,
  activeFolio,
  phase = "transcribing",
  label,
}: TranscriptionProgressBarProps) {
  if (!isProcessing) return null;

  const safeTotal = Math.max(total, 1);
  const percentage = Math.min(100, Math.round((Math.max(current, 0) / safeTotal) * 100));
  const display =
    label ??
    (phase === "slicing"
      ? `Slicing PDF… ${current}/${total || "…"}`
      : phase === "repairing"
        ? `Batch syntax repair… (${current} of ${total || "…"})`
        : phase === "merging"
          ? "Finalizing…"
          : `Transcribing fol. [${activeFolio || "…"}] (${current} of ${total || "…"})`);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={display}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
    >
      <View style={styles.row}>
        <ActivityIndicator size="small" color={theme.goldMuted} />
        <Text style={styles.label} numberOfLines={2}>
          {display}
        </Text>
        <Text style={styles.percentage}>{percentage}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percentage}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#2a100b",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    marginVertical: 8,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flex: 1, color: "#fff4d2", fontSize: 13, fontWeight: "600" },
  percentage: {
    color: theme.goldMuted,
    fontWeight: "900",
    fontFamily: "monospace",
    fontSize: 12,
  },
  track: {
    height: 4,
    backgroundColor: "rgba(244,235,208,0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: theme.goldMuted },
});
