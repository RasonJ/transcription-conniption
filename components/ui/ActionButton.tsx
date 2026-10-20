import React from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { scriptoriumTheme as theme } from "@/constants/scriptoriumTheme";

export interface ActionButtonProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "chip";
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

/**
 * Accessible action control (SPEC-ACCESSIBILITY A11Y-1).
 * Always exposes `accessibilityRole="button"` and a ≥44×44 tap target.
 */
export function ActionButton({
  label,
  variant = "primary",
  style,
  textStyle,
  icon,
  disabled,
  accessibilityState,
  accessibilityLabel,
  ...props
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled), ...accessibilityState }}
      disabled={disabled}
      style={(state) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        state.pressed && !disabled && styles.pressed,
        Platform.OS === "web" && (state as { focused?: boolean }).focused
          ? styles.focused
          : null,
        style,
      ]}
      {...props}
    >
      {icon}
      <Text
        style={[styles.textBase, styles[`${variant}Text` as const], textStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primary: {
    backgroundColor: theme.goldMuted,
  },
  secondary: {
    backgroundColor: "rgba(255, 211, 110, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.3)",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(246, 216, 144, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.3)",
  },
  textBase: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryText: { color: theme.inkDark },
  secondaryText: { color: theme.goldMuted },
  ghostText: { color: theme.goldMuted },
  chipText: { color: "#fff4d2", fontSize: 12 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  focused: {
    // Web focus ring (3:1 against dark chrome / parchment)
    outlineColor: theme.goldMuted,
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: 2,
  } as ViewStyle,
});
