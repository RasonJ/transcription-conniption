import type { BatchFileStatus, BatchSummary } from "@/constants/manuscript";
import { processTranscriptionBatch, type BatchProcessResult } from "@/utils/batchProcessor";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/expoFileSystem";
import { AlertTriangle, CheckCircle, FolderUp } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  onBatchComplete: (result: BatchProcessResult) => void;
};

export function BatchProcessingPanel({ onBatchComplete }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<BatchFileStatus[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  const handleDirectorySelection = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setIsProcessing(true);
      setSummary(null);

      const preparedPayloads = await Promise.all(
        result.assets.map(async (asset) => {
          const content = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          return {
            name: asset.name ?? "unknown.txt",
            content,
            size: asset.size ?? content.length,
          };
        }),
      );

      const batchResult = await processTranscriptionBatch(preparedPayloads, setFileStatuses);
      setSummary(batchResult.summary);
      setIsProcessing(false);
      onBatchComplete(batchResult);
    } catch (error) {
      console.warn("Batch processing failed", error);
      setIsProcessing(false);
    }
  }, [onBatchComplete]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => void handleDirectorySelection()}
        disabled={isProcessing}
        style={({ pressed }) => [
          styles.uploadZone,
          isProcessing && styles.disabledZone,
          pressed && styles.pressed,
        ]}
      >
        <FolderUp color="#f6d890" size={32} />
        <Text style={styles.zoneTitle}>Upload transcription batch</Text>
        <Text style={styles.zoneSub}>Select multiple plain-text HSMS files</Text>
      </Pressable>

      {summary ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Compilation summary</Text>
          <View style={styles.grid}>
            <Text style={styles.gridText}>
              Success: {summary.completedFiles} / {summary.totalFiles}
            </Text>
            <Text style={styles.gridText}>Failed: {summary.failedFiles}</Text>
            <Text style={styles.gridText}>
              Words: {summary.totalWordsProcessed.toLocaleString()}
            </Text>
            <Text style={styles.gridText}>Anomalies: {summary.totalAnomaliesDetected}</Text>
            <Text style={styles.gridText}>Time: {summary.elapsedTimeMs}ms</Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.statusList} nestedScrollEnabled>
        {fileStatuses.map((file, idx) => (
          <View key={`${file.fileName}-${idx}`} style={styles.fileRow}>
            <View style={styles.fileMeta}>
              <Text style={styles.fileNameText} numberOfLines={1}>
                {file.fileName}
              </Text>
              <Text style={styles.fileSizeText}>{(file.fileSize / 1024).toFixed(1)} KB</Text>
            </View>
            <View style={styles.statusBadgeRow}>
              {file.status === "processing" ? (
                <ActivityIndicator size="small" color="#c8995f" />
              ) : null}
              {file.status === "completed" ? <CheckCircle color="#44bb22" size={16} /> : null}
              {file.status === "failed" ? <AlertTriangle color="#9b2217" size={16} /> : null}
              <Text
                style={[
                  styles.statusText,
                  file.status === "completed" && styles.successText,
                  file.status === "failed" && styles.errorText,
                ]}
              >
                {file.status}
                {file.stats ? ` (${file.stats.anomalyCount})` : ""}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 14, padding: 4 },
  uploadZone: {
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#f6d890",
    backgroundColor: "rgba(53,28,17,0.4)",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  disabledZone: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  zoneTitle: { color: "#fff4d2", fontSize: 16, fontWeight: "bold" },
  zoneSub: { color: "rgba(255,244,210,0.6)", fontSize: 12, textAlign: "center" },
  summaryCard: {
    backgroundColor: "rgba(255,244,210,0.06)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.15)",
  },
  summaryTitle: {
    color: "#f6d890",
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridText: { color: "#fff4d2", fontSize: 12, width: "47%" },
  statusList: { maxHeight: 240, backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 14, padding: 10 },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,244,210,0.05)",
    alignItems: "center",
  },
  fileMeta: { flex: 1, marginRight: 12 },
  fileNameText: { color: "#fff4d2", fontSize: 13, fontWeight: "500" },
  fileSizeText: { color: "rgba(255,244,210,0.4)", fontSize: 11, marginTop: 1 },
  statusBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { color: "#aaa", fontSize: 12, fontWeight: "bold", textTransform: "capitalize" },
  successText: { color: "#44bb22" },
  errorText: { color: "#9b2217" },
});
