import { ValidationPanel } from "@/components/ValidationPanel";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";
import React, { useCallback } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export default function ValidationModalScreen() {
  const { parsedManuscript, debouncedText } = useScriptorium();
  const { navigateToLineIndex } = useScrollAnchor();

  const handleJump = useCallback(
    (lineIndex: number) => {
      navigateToLineIndex(lineIndex, debouncedText);
      router.back();
    },
    [debouncedText, navigateToLineIndex],
  );

  const errors = parsedManuscript.validationErrors ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Structural validation</Text>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <X color="#f6d890" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <ValidationPanel errors={errors} onJumpToLine={handleJump} />
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#2b110c" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246,216,144,0.2)",
  },
  title: { color: "#fff4d2", fontSize: 18, fontWeight: "900" },
  closeButton: { padding: 6 },
  body: { padding: 16, paddingBottom: 32 },
});
