import { BatchProcessingPanel } from "@/components/BatchProcessingPanel";
import type { BatchProcessResult } from "@/utils/batchProcessor";
import { ChevronLeft, ChevronRight, FolderUp, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  onBatchComplete: (result: BatchProcessResult) => void;
};

export function ResponsiveBatchShell({ visible, onClose, onBatchComplete }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!visible) {
    return null;
  }

  if (isDesktop) {
    return (
      <View style={[styles.sidebarContainer, isCollapsed && styles.sidebarCollapsed]}>
        <Pressable onPress={() => setIsCollapsed(!isCollapsed)} style={styles.collapseHandle}>
          {isCollapsed ? (
            <ChevronLeft color="#f6d890" size={16} />
          ) : (
            <ChevronRight color="#f6d890" size={16} />
          )}
        </Pressable>
        {!isCollapsed ? (
          <View style={styles.innerPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Batch compiler</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <X color="#f6d890" size={18} />
              </Pressable>
            </View>
            <BatchProcessingPanel onBatchComplete={onBatchComplete} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.mobileContainer}>
        <View style={styles.mobileHeader}>
          <View style={styles.mobileTitleGroup}>
            <FolderUp color="#f6d890" size={20} />
            <Text style={styles.mobileTitle}>Batch processing</Text>
          </View>
          <Pressable onPress={onClose} style={styles.mobileCloseButton}>
            <X color="#2b110c" size={20} />
          </Pressable>
        </View>
        <ScrollView style={styles.mobileBody} contentContainerStyle={styles.mobileContent}>
          <Text style={styles.mobilePromptText}>
            Select multiple plaintext transcriptions (e.g. from an OSTA folder) to compile and validate in one pass.
          </Text>
          <BatchProcessingPanel onBatchComplete={onBatchComplete} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 380,
    backgroundColor: "rgba(35, 12, 9, 0.95)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(246, 216, 144, 0.25)",
    height: "100%",
    position: "relative",
  },
  sidebarCollapsed: { width: 20 },
  innerPanel: { flex: 1, padding: 16, gap: 12 },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  panelTitle: {
    color: "#fff4d2",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  closeButton: { padding: 4 },
  collapseHandle: {
    position: "absolute",
    left: -14,
    top: "50%",
    marginTop: -20,
    width: 14,
    height: 40,
    backgroundColor: "#5a2317",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: "rgba(246, 216, 144, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  mobileContainer: { flex: 1, backgroundColor: "#2b110c" },
  mobileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "#1a0a07",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246, 216, 144, 0.15)",
  },
  mobileTitleGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  mobileTitle: { color: "#fff4d2", fontSize: 18, fontWeight: "800" },
  mobileCloseButton: { backgroundColor: "#f6d890", padding: 6, borderRadius: 10 },
  mobileBody: { flex: 1 },
  mobileContent: { padding: 16, gap: 16 },
  mobilePromptText: { color: "rgba(255, 244, 210, 0.75)", fontSize: 14, lineHeight: 20 },
});
