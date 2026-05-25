import { Platform, type ViewStyle } from "react-native";

/** Native shadow on iOS/Android; `boxShadow` on web (avoids RN Web deprecation warnings). */
export function platformShadow(
  offsetY: number,
  blur: number,
  opacity: number,
  color = "#000",
): ViewStyle {
  if (Platform.OS === "web") {
    return {
      boxShadow: `0px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity})`,
    };
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: blur,
    elevation: Math.max(1, Math.round(blur / 4)),
  };
}
