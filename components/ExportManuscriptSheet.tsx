import {
  EXPORT_FORMAT_OPTIONS,
  defaultFileNameForFormat,
  ensureFileNameExtension,
  inferExportFormatFromFileName,
  type ManuscriptExportFormat,
} from "@/utils/exportFormats";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { useT } from "@/i18n/runtime";
import { AlertTriangle, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  sourceFileName?: string | null;
  /** Critical HSMS syntax errors — non-blocking pre-export notice (SPEC-STUDIO-IA §3.3). */
  criticalErrorCount?: number;
  onExport: (fileName: string, format: ManuscriptExportFormat) => Promise<void>;
};

const TITLE_ID = "export-sheet-title";

export function ExportManuscriptSheet({
  visible,
  onClose,
  sourceFileName,
  criticalErrorCount = 0,
  onExport,
}: Props) {
  const t = useT();
  const [selectedFormat, setSelectedFormat] = useState<ManuscriptExportFormat>("tei_xml");
  const [fileName, setFileName] = useState(defaultFileNameForFormat(sourceFileName, "tei_xml"));
  const [busy, setBusy] = useState(false);

  useDialogFocusTrap({
    active: visible,
    onClose,
    titleId: TITLE_ID,
    dialogId: "export-sheet-dialog",
  });

  useEffect(() => {
    if (visible) {
      setSelectedFormat("tei_xml");
      setFileName(defaultFileNameForFormat(sourceFileName, "tei_xml"));
    }
  }, [visible, sourceFileName]);

  const activeOption = useMemo(
    () => EXPORT_FORMAT_OPTIONS.find((o) => o.id === selectedFormat),
    [selectedFormat],
  );

  const inferredFromName = useMemo(() => inferExportFormatFromFileName(fileName), [fileName]);

  const handleFormatSelect = (format: ManuscriptExportFormat) => {
    setSelectedFormat(format);
    setFileName(defaultFileNameForFormat(sourceFileName, format));
  };

  const executeExport = async () => {
    const format =
      inferredFromName === "tei_xml" &&
      (selectedFormat === "tei_xml" || selectedFormat === "tei_normalized_xml")
        ? selectedFormat
        : (inferredFromName ?? selectedFormat);
    const resolvedName = ensureFileNameExtension(fileName, format);
    setBusy(true);
    try {
      await onExport(resolvedName, format);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleExportPress = () => {
    if (criticalErrorCount > 0) {
      Alert.alert(
        t("export.warning.title"),
        t("export.warning.body", { count: criticalErrorCount }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("export.action.exportAnyway"),
            style: "destructive",
            onPress: () => {
              void executeExport();
            },
          },
        ],
      );
      return;
    }
    void executeExport();
  };

  const categoryOrder = ["edition", "page", "text", "project"] as const;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal nativeID="export-sheet-dialog">
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
              {t("export.title")}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <X color="#ffd36e" size={20} />
            </Pressable>
          </View>

          {criticalErrorCount > 0 ? (
            <View style={styles.errorAlertBanner} accessibilityRole="alert">
              <AlertTriangle color="#ef9a9a" size={16} />
              <Text style={styles.errorAlertText}>
                {t("export.syntaxErrorNotice", { count: criticalErrorCount })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>{t("export.fileNameLabel")}</Text>
          <TextInput
            value={fileName}
            onChangeText={setFileName}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Nunes_Tratado.xml"
            placeholderTextColor="rgba(255,244,210,0.35)"
            style={styles.input}
          />
          {inferredFromName ? (
            <Text style={styles.inferred}>
              {t("export.detectedFormat", {
                ext:
                  inferredFromName === "jpeg"
                    ? "jpg"
                    : inferredFromName === "tei_xml" || inferredFromName === "tei_normalized_xml"
                      ? "xml"
                      : inferredFromName === "hsms_bundle"
                        ? "hsms"
                        : inferredFromName,
              })}
            </Text>
          ) : (
            <Text style={styles.inferredWarn}>{t("export.addExtension")}</Text>
          )}

          <Text style={styles.label}>{t("export.orChooseFormat")}</Text>
          <ScrollView style={styles.formatList} nestedScrollEnabled>
            {categoryOrder.map((category) => {
              const opts = EXPORT_FORMAT_OPTIONS.filter((o) => o.category === category);
              if (!opts.length) return null;
              return (
                <View key={category} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>{t(`export.category.${category}`)}</Text>
                  {opts.map((opt) => {
                    const active = (inferredFromName === "tei_xml"
                      ? selectedFormat
                      : (inferredFromName ?? selectedFormat)) === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => handleFormatSelect(opt.id)}
                        style={[styles.optionCard, active && styles.optionCardSelected]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={t(opt.labelKey) || opt.label}
                      >
                        <Text style={[styles.optionLabel, active && styles.optionTextSelected]}>
                          {t(opt.labelKey) || opt.label}
                        </Text>
                        <Text style={styles.optionDescription}>
                          {t(opt.descriptionKey) || opt.hint}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          <Text style={styles.hint}>{activeOption ? t(activeOption.descriptionKey) || activeOption.hint : ""}</Text>
          {Platform.OS !== "web" && (selectedFormat === "png" || selectedFormat === "jpeg") ? (
            <Text style={styles.hint}>
              PNG/JPEG raster export works best in the web app; native shares SVG or opens the share sheet.
            </Text>
          ) : null}

          <Pressable
            onPress={handleExportPress}
            disabled={busy}
            style={[styles.exportBtn, busy && styles.exportBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={busy ? t("export.action.exporting") : t("export.action.confirm")}
          >
            <Text style={styles.exportBtnText}>
              {busy ? t("export.action.exporting") : t("export.action.confirm")}
            </Text>
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
    maxHeight: "88%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fffdf4", fontSize: 17, fontWeight: "800" },
  closeBtn: { padding: 4 },
  errorAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(155, 34, 23, 0.3)",
    padding: 10,
    borderRadius: 8,
  },
  errorAlertText: { color: "#ef9a9a", fontSize: 12, flex: 1 },
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
  formatList: { maxHeight: 280 },
  categoryBlock: { marginBottom: 8 },
  categoryLabel: {
    color: "rgba(246,216,144,0.55)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  optionCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,253,244,0.04)",
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.15)",
    marginBottom: 6,
  },
  optionCardSelected: { backgroundColor: "rgba(246,216,144,0.15)", borderColor: "#f6d890" },
  optionLabel: { color: "#fff4d2", fontSize: 13, fontWeight: "700" },
  optionTextSelected: { color: "#f6d890" },
  optionDescription: { color: "rgba(246,216,144,0.6)", fontSize: 11, marginTop: 2 },
  hint: { color: "rgba(255,244,210,0.55)", fontSize: 12, lineHeight: 18 },
  exportBtn: {
    marginTop: 4,
    backgroundColor: "#ffd36e",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { color: "#110504", fontSize: 14, fontWeight: "800" },
});
