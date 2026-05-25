import {
  EXPORT_FORMAT_OPTIONS,
  defaultFileNameForFormat,
  ensureFileNameExtension,
  inferExportFormatFromFileName,
  type ManuscriptExportFormat,
} from "@/utils/exportFormats";
import { X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  sourceFileName?: string | null;
  onExport: (fileName: string, format: ManuscriptExportFormat) => Promise<void>;
};

export function ExportManuscriptSheet({ visible, onClose, sourceFileName, onExport }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<ManuscriptExportFormat>("html");
  const [fileName, setFileName] = useState(defaultFileNameForFormat(sourceFileName, "html"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedFormat("html");
      setFileName(defaultFileNameForFormat(sourceFileName, "html"));
    }
  }, [visible, sourceFileName]);

  const activeHint = useMemo(
    () => EXPORT_FORMAT_OPTIONS.find((o) => o.format === selectedFormat)?.hint ?? "",
    [selectedFormat],
  );

  const inferredFromName = useMemo(() => inferExportFormatFromFileName(fileName), [fileName]);

  const handleFormatSelect = (format: ManuscriptExportFormat) => {
    setSelectedFormat(format);
    setFileName(defaultFileNameForFormat(sourceFileName, format));
  };

  const handleExportPress = async () => {
    const format = inferredFromName ?? selectedFormat;
    const resolvedName = ensureFileNameExtension(fileName, format);
    setBusy(true);
    try {
      await onExport(resolvedName, format);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Export manuscript</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X color="#ffd36e" size={20} />
            </Pressable>
          </View>

          <Text style={styles.label}>File name (extension sets format)</Text>
          <TextInput
            value={fileName}
            onChangeText={setFileName}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="TEXT.ACR.html"
            placeholderTextColor="rgba(255,244,210,0.35)"
            style={styles.input}
          />
          {inferredFromName ? (
            <Text style={styles.inferred}>Detected format: .{inferredFromName === "jpeg" ? "jpg" : inferredFromName}</Text>
          ) : (
            <Text style={styles.inferredWarn}>Add an extension (.txt, .html, .svg, .png, .jpg)</Text>
          )}

          <Text style={styles.label}>Or choose a format</Text>
          <View style={styles.formatGrid}>
            {EXPORT_FORMAT_OPTIONS.map((opt) => {
              const active = (inferredFromName ?? selectedFormat) === opt.format;
              return (
                <Pressable
                  key={opt.format}
                  onPress={() => handleFormatSelect(opt.format)}
                  style={[styles.formatChip, active && styles.formatChipActive]}
                >
                  <Text style={[styles.formatChipText, active && styles.formatChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.hint}>{activeHint}</Text>
          {Platform.OS !== "web" && (selectedFormat === "png" || selectedFormat === "jpeg") ? (
            <Text style={styles.hint}>
              PNG/JPEG raster export works best in the web app; native shares SVG or opens the share sheet.
            </Text>
          ) : null}

          <Pressable
            onPress={() => void handleExportPress()}
            disabled={busy}
            style={[styles.exportBtn, busy && styles.exportBtnDisabled]}
          >
            <Text style={styles.exportBtnText}>{busy ? "Exporting…" : "Export file"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 5, 4, 0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#29100a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.15)",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fffdf4", fontSize: 17, fontWeight: "800" },
  closeBtn: { padding: 4 },
  label: {
    color: "#f6d890",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.25)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    color: "#fff4d2",
    fontSize: 15,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  inferred: { color: "rgba(255,244,210,0.65)", fontSize: 12 },
  inferredWarn: { color: "#ff9a7a", fontSize: 12 },
  formatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formatChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.2)",
    backgroundColor: "rgba(255, 211, 110, 0.04)",
  },
  formatChipActive: { backgroundColor: "#ffd36e", borderColor: "#ffd36e" },
  formatChipText: { color: "#ffd36e", fontSize: 11, fontWeight: "700" },
  formatChipTextActive: { color: "#110504" },
  hint: { color: "rgba(255,244,210,0.55)", fontSize: 12, lineHeight: 18 },
  exportBtn: {
    marginTop: 8,
    backgroundColor: "#ffd36e",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { color: "#110504", fontSize: 14, fontWeight: "800" },
});
