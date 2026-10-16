import { useScriptorium } from "@/context/ScriptoriumContext";
import { useT } from "@/i18n/runtime";
import {
  fetchIiifManifest,
  type IiifWitnessDraft,
} from "@/utils/ingest/iiifManifest";
import { skeletonFromIiifDraft } from "@/utils/ingest/iiifWorkspace";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export const ANALYSIS_BACKEND_ENABLED = process.env.EXPO_PUBLIC_ANALYSIS_BACKEND === "1";

type Props = {
  onDraftLoaded?: (draft: IiifWitnessDraft) => void;
};

const PREVIEW_CANVASES = 5;

function IngestPanelImpl({ onDraftLoaded }: Props) {
  const t = useT();
  const { applyTranscription } = useScriptorium();
  const [created, setCreated] = useState<{ count: number; sequential: boolean } | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<IiifWitnessDraft | null>(null);

  const handleLoad = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setCreated(null);
    try {
      const loaded = await fetchIiifManifest(trimmed);
      setDraft(loaded);
      onDraftLoaded?.(loaded);
    } catch (e) {
      setDraft(null);
      setError(e instanceof Error && e.message ? `${t("ingest.iiif.loadError")} ${e.message}` : t("ingest.iiif.loadError"));
    } finally {
      setLoading(false);
    }
  }, [url, onDraftLoaded, t]);

  // Folio skeleton + IIIF page images as folio backgrounds (no backend needed).
  const handleCreate = useCallback(() => {
    if (!draft) return;
    const sk = skeletonFromIiifDraft(draft);
    applyTranscription(sk.transcriptionText, {
      sourceFileName: sk.sourceFileName,
      manuscriptTitle: sk.manuscriptTitle,
      folioBackgrounds: sk.folioBackgrounds,
    });
    setCreated({ count: draft.canvases.length, sequential: sk.sequentialIds });
  }, [draft, applyTranscription]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t("ingest.iiif.title")}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={handleLoad}
          placeholder="https://library.example/iiif/manifest.json"
          placeholderTextColor="#99836a"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <Pressable
          onPress={handleLoad}
          disabled={loading}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t("ingest.iiif.loadLabel")}
        >
          {loading ? (
            <ActivityIndicator color="#1a0a05" size="small" />
          ) : (
            <Text style={styles.buttonText}>{t("ingest.iiif.load")}</Text>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {draft ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{draft.label || t("ingest.iiif.untitled")}</Text>
          <Text style={styles.summaryMeta}>
            {t("ingest.iiif.canvases", { count: draft.canvases.length })}
            {draft.rights ? ` · ${draft.rights}` : ""}
          </Text>
          {draft.canvases.slice(0, PREVIEW_CANVASES).map((c) => (
            <Text key={c.canvasId || c.index} style={styles.canvasRow} numberOfLines={1}>
              {c.index + 1}. {c.label}
            </Text>
          ))}
          {draft.canvases.length > PREVIEW_CANVASES ? (
            <Text style={styles.summaryMeta}>
              {t("ingest.iiif.more", { count: draft.canvases.length - PREVIEW_CANVASES })}
            </Text>
          ) : null}
          {draft.canvases.length > 0 ? (
            <Pressable onPress={handleCreate} style={[styles.button, styles.createButton]} accessibilityRole="button">
              <Text style={styles.buttonText}>{t("ingest.iiif.create")}</Text>
            </Pressable>
          ) : null}
          {created ? (
            <Text style={styles.summaryMeta}>
              {t("ingest.iiif.created", { count: created.count })}
              {created.sequential ? ` ${t("ingest.iiif.sequential")}` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Tier 2 UI: renders nothing unless `EXPO_PUBLIC_ANALYSIS_BACKEND=1`. */
export const IngestPanel: React.ComponentType<Props> = ANALYSIS_BACKEND_ENABLED
  ? IngestPanelImpl
  : () => null;

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#2a100b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    padding: 14,
    gap: 8,
  },
  title: { color: "#f6d890", fontSize: 16, fontWeight: "900" },
  inputRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: "rgba(244,235,208,0.12)",
    borderColor: "rgba(246,216,144,0.2)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff4d2",
    fontSize: 13,
  },
  button: {
    backgroundColor: "#f6d890",
    borderRadius: 12,
    minWidth: 56,
    height: 42,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#1a0a05", fontWeight: "800", fontSize: 13 },
  createButton: { alignSelf: "flex-start", marginTop: 6 },
  error: { color: "#e8836f", fontSize: 12, fontWeight: "600" },
  summary: { gap: 2 },
  summaryTitle: { color: "#fff4d2", fontSize: 14, fontWeight: "700" },
  summaryMeta: { color: "rgba(246,216,144,0.65)", fontSize: 12 },
  canvasRow: { color: "#fff4d2", fontSize: 12 },
});
