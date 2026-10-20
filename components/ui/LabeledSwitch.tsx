import React from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from "react-native";
import { scriptoriumTheme as theme } from "@/constants/scriptoriumTheme";

export interface LabeledSwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  helperText?: string;
  disabled?: boolean;
  style?: ViewStyle;
  /** Visible On/Off cue for color-blind / phone layouts (SPEC A11Y-3). */
  showStateText?: boolean;
}

/**
 * Labeled switch with programmatic name + checked state (SPEC-ACCESSIBILITY A11Y-3).
 * Neutral off track — never red — so color alone does not imply error.
 */
export function LabeledSwitch({
  label,
  value,
  onValueChange,
  helperText,
  disabled = false,
  style,
  showStateText = Platform.OS !== "web",
}: LabeledSwitchProps) {
  const toggle = () => {
    if (!disabled) onValueChange(!value);
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      accessibilityHint={helperText}
      style={[styles.container, style]}
    >
      <View style={styles.labelWrapper}>
        <Text style={styles.label}>{label}</Text>
        {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      </View>
      {showStateText ? (
        <Text style={styles.stateText} accessibilityElementsHidden>
          {value ? "On" : "Off"}
        </Text>
      ) : null}
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        thumbColor={value ? theme.goldMuted : "#b0a090"}
        trackColor={{
          true: "rgba(246, 216, 144, 0.45)",
          false: "rgba(160, 150, 140, 0.35)",
        }}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: 6,
    gap: 12,
  },
  labelWrapper: { flex: 1 },
  label: { color: "#dfcba5", fontSize: 13, fontWeight: "600" },
  helper: { color: "rgba(223, 203, 165, 0.65)", fontSize: 11, marginTop: 2 },
  stateText: {
    color: "rgba(223, 203, 165, 0.8)",
    fontSize: 11,
    fontWeight: "700",
    minWidth: 28,
    textAlign: "right",
  },
});
