/**
 * Asks before the first remote analysis call (SPEC-LIGHTWEIGHT §5).
 */
import { ActionButton } from "@/components/ui/ActionButton";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { useT } from "@/i18n/runtime";
import {
  getRemoteConsent,
  setRemoteConsent,
  subscribeRemoteConsent,
} from "@/utils/analysis/remoteConsent";
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

const TITLE_ID = "remote-consent-title";

export function RemoteConsentSheet({ backendEnabled }: { backendEnabled: boolean }) {
  const t = useT();
  const [consent, setConsent] = useState(getRemoteConsent);
  useEffect(() => subscribeRemoteConsent(() => setConsent(getRemoteConsent())), []);
  const visible = backendEnabled && consent === null;

  useDialogFocusTrap({
    active: visible,
    onClose: () => setRemoteConsent(false),
    titleId: TITLE_ID,
    dialogId: "remote-consent-dialog",
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setRemoteConsent(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal nativeID="remote-consent-dialog">
          <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
            {t("consent.remoteTitle")}
          </Text>
          <Text style={styles.body}>{t("consent.remoteBody")}</Text>
          <View style={styles.actions}>
            <ActionButton label={t("consent.deny")} variant="ghost" onPress={() => setRemoteConsent(false)} />
            <ActionButton label={t("consent.allow")} onPress={() => setRemoteConsent(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#2a120c",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.35)",
  },
  title: { color: "#f6d890", fontSize: 18, fontWeight: "700" },
  body: { color: "#fff4d2", fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
