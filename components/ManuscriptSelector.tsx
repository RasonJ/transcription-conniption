import type { ManuscriptRegistry } from "@/constants/manuscript";
import { AlertCircle, ChevronDown, FileText } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  currentFileName: string | null;
  registry: ManuscriptRegistry;
  onSelect: (fileName: string) => void;
};

export function ManuscriptSelector({ currentFileName, registry, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const fileNames = Object.keys(registry);

  const toggleDropdown = useCallback(() => setIsOpen((prev) => !prev), []);

  if (fileNames.length <= 1) {
    return null;
  }

  return (
    <View style={[styles.container, isOpen && styles.containerActive]}>
      <Text style={styles.selectorLabel}>Transcription Source</Text>
      <Pressable
        onPress={toggleDropdown}
        style={({ pressed }) => [styles.triggerButton, pressed && styles.pressed]}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: isOpen }}
      >
        <View style={styles.triggerLeft}>
          <FileText color="#f6d890" size={16} />
          <Text style={styles.triggerText} numberOfLines={1}>
            {currentFileName ?? "No manuscript loaded"}
          </Text>
        </View>
        <ChevronDown color="#f6d890" size={16} style={isOpen ? styles.arrowOpen : undefined} />
      </Pressable>

      {isOpen ? (
        <View style={styles.dropdownOverlay}>
          <ScrollView
            style={styles.dropdownScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {fileNames.map((name) => {
              const isActive = name === currentFileName;
              const errorCount = registry[name]?.parsedTree?.validationErrors?.length ?? 0;

              return (
                <Pressable
                  key={name}
                  onPress={() => {
                    onSelect(name);
                    setIsOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    isActive && styles.optionRowActive,
                    pressed && styles.optionPressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.optionLeft}>
                    <FileText color={isActive ? "#2b110c" : "#fff4d2"} size={14} />
                    <Text
                      style={[styles.optionText, isActive && styles.optionTextActive]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                  </View>
                  {errorCount > 0 ? (
                    <View style={[styles.badge, isActive && styles.badgeActive]}>
                      <AlertCircle color={isActive ? "#9b2217" : "#f6d890"} size={12} />
                      <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                        {errorCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", zIndex: 50, position: "relative", marginBottom: 6 },
  containerActive: { zIndex: 9999 },
  selectorLabel: {
    color: "#f6d890",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  triggerButton: {
    minHeight: 48,
    backgroundColor: "rgba(33,13,11,0.7)",
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.25)",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  triggerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  triggerText: { color: "#fff4d2", fontSize: 14, fontWeight: "600" },
  arrowOpen: { transform: [{ rotate: "180deg" }] },
  pressed: { opacity: 0.85 },
  dropdownOverlay: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
    backgroundColor: "#210d0b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    zIndex: 10000,
    elevation: 8,
    overflow: "hidden",
  },
  dropdownScroll: { maxHeight: 200, padding: 4 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  optionRowActive: { backgroundColor: "#f6d890" },
  optionPressed: { backgroundColor: "rgba(246,216,144,0.1)" },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  optionText: { color: "#fff4d2", fontSize: 13, fontWeight: "500" },
  optionTextActive: { color: "#2b110c", fontWeight: "700" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(246,216,144,0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeActive: { backgroundColor: "rgba(43,17,11,0.15)" },
  badgeText: { color: "#f6d890", fontSize: 11, fontWeight: "bold" },
  badgeTextActive: { color: "#9b2217" },
});
