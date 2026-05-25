import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  message: string;
};

export function CompilationOverlay({ visible, message }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.backdrop} accessibilityRole="progressbar" accessibilityLabel={message}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#ffd36e" />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 5, 4, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  card: {
    padding: 24,
    backgroundColor: "#29100a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.2)",
    alignItems: "center",
    gap: 14,
    maxWidth: 320,
    marginHorizontal: 24,
  },
  message: {
    color: "#fff4d2",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
