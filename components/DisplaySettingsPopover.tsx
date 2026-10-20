/**
 * Grouped display toggles (SPEC-STUDIO-IA §4) — Text / Layout / Compare.
 * Neutral-off switch tracks via LabeledSwitch (no red-for-off).
 */
import { LabeledSwitch } from "@/components/ui/LabeledSwitch";
import { useT } from "@/i18n/runtime";
import { X } from "lucide-react-native";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

export type DisplaySettingsValues = {
  showExpanded: boolean;
  showDeletions: boolean;
  showNormalizedDiacritics: boolean;
  useMufiGraphemes: boolean;
  usePuaFont: boolean;
  suppressOtioseMarks: boolean;
  showLineNumbers: boolean;
  showReadingFlow: boolean;
  facsimileCanvasEnabled: boolean;
  placementMode: boolean;
  svgModeEnabled: boolean;
  showSynoptic: boolean;
  showModernSynoptic: boolean;
};

export type DisplaySettingsHandlers = {
  setShowExpanded: (v: boolean) => void;
  setShowDeletions: (v: boolean) => void;
  setShowNormalizedDiacritics: (v: boolean) => void;
  setUseMufiGraphemes: (v: boolean) => void;
  setUsePuaFont: (v: boolean) => void;
  setSuppressOtioseMarks: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setShowReadingFlow: (v: boolean) => void;
  setFacsimileCanvasEnabled: (v: boolean) => void;
  setPlacementMode: (v: boolean) => void;
  setSvgModeEnabled: (v: boolean) => void;
  onToggleSynoptic: (v: boolean) => void;
  onToggleModernSynoptic: (v: boolean) => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  values: DisplaySettingsValues;
  handlers: DisplaySettingsHandlers;
};

const TITLE_ID = "display-settings-title";

export function DisplaySettingsPopover({ visible, onClose, values, handlers }: Props) {
  const t = useT();

  useDialogFocusTrap({
    active: visible,
    onClose,
    titleId: TITLE_ID,
    dialogId: "display-settings-dialog",
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal nativeID="display-settings-dialog">
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
              {t("display.sheet.title")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              style={styles.closeBtn}
            >
              <X color="#ffd36e" size={20} />
            </Pressable>
          </View>

          <ScrollView style={styles.body}>
            <Text style={styles.groupLabel}>{t("display.group.text")}</Text>
            <LabeledSwitch
              label={t("studio.toggle.expansions")}
              helperText={t("display.help.expansions")}
              value={values.showExpanded}
              onValueChange={handlers.setShowExpanded}
            />
            <LabeledSwitch
              label={t("studio.toggle.deletions")}
              helperText={t("display.help.deletions")}
              value={values.showDeletions}
              onValueChange={handlers.setShowDeletions}
            />
            <LabeledSwitch
              label={t("editor.toggle.diacritics")}
              helperText={t("display.help.diacritics")}
              value={values.showNormalizedDiacritics}
              onValueChange={handlers.setShowNormalizedDiacritics}
            />
            <LabeledSwitch
              label={t("editor.toggle.mufiGraphemes")}
              helperText={t("display.help.mufiGraphemes")}
              value={values.useMufiGraphemes}
              onValueChange={handlers.setUseMufiGraphemes}
            />
            <LabeledSwitch
              label={t("editor.toggle.mufiPua")}
              helperText={t("display.help.mufiPua")}
              value={values.usePuaFont}
              onValueChange={handlers.setUsePuaFont}
            />
            <LabeledSwitch
              label={t("studio.toggle.otiose")}
              helperText={t("display.help.otiose")}
              value={values.suppressOtioseMarks}
              onValueChange={handlers.setSuppressOtioseMarks}
            />

            <Text style={styles.groupLabel}>{t("display.group.layout")}</Text>
            <LabeledSwitch
              label={t("editor.toggle.lineNumbers")}
              value={values.showLineNumbers}
              onValueChange={handlers.setShowLineNumbers}
            />
            <LabeledSwitch
              label={t("editor.toggle.readingFlow")}
              helperText={t("display.help.readingFlow")}
              value={values.showReadingFlow}
              onValueChange={handlers.setShowReadingFlow}
            />
            <LabeledSwitch
              label={t("editor.toggle.facsimile")}
              helperText={t("display.help.facsimile")}
              value={values.facsimileCanvasEnabled}
              onValueChange={handlers.setFacsimileCanvasEnabled}
            />
            <LabeledSwitch
              label={t("studio.toggle.placeFigure")}
              value={values.placementMode}
              onValueChange={handlers.setPlacementMode}
            />
            <LabeledSwitch
              label={t("editor.toggle.svg")}
              value={values.svgModeEnabled}
              onValueChange={handlers.setSvgModeEnabled}
            />

            <Text style={styles.groupLabel}>{t("display.group.compare")}</Text>
            <LabeledSwitch
              label={t("editor.toggle.synoptic")}
              helperText={t("display.help.synoptic")}
              value={values.showSynoptic}
              onValueChange={handlers.onToggleSynoptic}
            />
            <LabeledSwitch
              label={t("editor.toggle.modernText")}
              helperText={t("display.help.modernText")}
              value={values.showModernSynoptic}
              onValueChange={handlers.onToggleModernSynoptic}
            />
          </ScrollView>
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
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.15)",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { color: "#fffdf4", fontSize: 17, fontWeight: "800" },
  closeBtn: { padding: 4 },
  body: { flexGrow: 1 },
  groupLabel: {
    color: "#f6d890",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 4,
  },
});
