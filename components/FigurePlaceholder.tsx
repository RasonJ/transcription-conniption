import type { Token } from "@/constants/manuscript";
import { resolveStoredFileUri } from "@/utils/expoFileSystem";
import { Image as ImageIcon, PlusCircle, Trash2 } from "lucide-react-native";
import React, { useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

export type FigureImageContextValue = {
  uploadedImages: Record<string, string>;
  triggerImagePick: (figureId: string) => Promise<void>;
  removeImage: (figureId: string) => Promise<void>;
};

export const FigureImageContext = React.createContext<FigureImageContextValue>({
  uploadedImages: {},
  triggerImagePick: async () => {},
  removeImage: async () => {},
});

type Props = {
  token: Token;
};

export function FigurePlaceholder({ token }: Props) {
  const { uploadedImages, triggerImagePick, removeImage } = useContext(FigureImageContext);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const figureId = token.figureId;
  if (!figureId) {
    return null;
  }

  const targetImageUri = uploadedImages[figureId]
    ? resolveStoredFileUri(uploadedImages[figureId])
    : undefined;
  const typeLabel = token.figureType ?? "FIG";

  useEffect(() => {
    if (targetImageUri) {
      setIsImageLoading(true);
    } else {
      setIsImageLoading(false);
    }
  }, [targetImageUri]);

  if (targetImageUri) {
    return (
      <View style={styles.activeImageWrapper}>
        <View style={styles.imageCanvasEnvelope}>
          {isImageLoading ? (
            <View style={styles.loadingSkeleton}>
              <ActivityIndicator size="small" color="#9b2217" />
              <Text style={styles.loadingLabel}>Loading facsimile…</Text>
            </View>
          ) : null}
          <Image
            source={{ uri: targetImageUri }}
            style={[styles.embeddedGraphic, isImageLoading && styles.hiddenWhileLoading]}
            resizeMode="contain"
            onLoadStart={() => setIsImageLoading(true)}
            onLoadEnd={() => setIsImageLoading(false)}
            onError={() => setIsImageLoading(false)}
          />
        </View>
        <View style={styles.canvasControlOverlay}>
          <Pressable
            onPress={() => triggerImagePick(figureId)}
            style={({ pressed }) => [styles.controlBadge, pressed && styles.controlPressed]}
          >
            <Text style={styles.controlBadgeText}>Replace</Text>
          </Pressable>
          <Pressable
            onPress={() => removeImage(figureId)}
            style={({ pressed }) => [styles.controlBadge, styles.dangerBadge, pressed && styles.controlPressed]}
          >
            <Trash2 color="#fff4d2" size={12} />
            <Text style={styles.controlBadgeText}>Remove</Text>
          </Pressable>
        </View>
        <Text style={styles.activeCaption}>
          <Text style={styles.captionPrefix}>[{typeLabel}]</Text> {token.value}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => triggerImagePick(figureId)}
      style={({ pressed }) => [styles.placeholderBox, pressed && styles.placeholderPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Upload image for ${typeLabel}: ${token.value}`}
    >
      <View style={styles.placeholderAccentBar} />
      <View style={styles.placeholderContent}>
        <PlusCircle color="#9b2217" size={28} />
        <Text style={styles.placeholderTitle}>Insert {typeLabel} facsimile</Text>
        <Text style={styles.placeholderMeta}>{figureId}</Text>
        <Text style={styles.placeholderCaption} numberOfLines={3}>
          {token.value}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholderBox: {
    width: "100%",
    marginVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(209,190,147,0.22)",
    borderWidth: 1,
    borderColor: "rgba(155,34,23,0.25)",
    borderStyle: "dashed",
    overflow: "hidden",
    flexDirection: "row",
  },
  placeholderPressed: { opacity: 0.85, backgroundColor: "rgba(209,190,147,0.35)" },
  placeholderAccentBar: { width: 6, backgroundColor: "#9b2217" },
  placeholderContent: { flex: 1, padding: 16, gap: 4, alignItems: "center" },
  placeholderTitle: { fontSize: 14, fontWeight: "800", color: "#3c1510", textAlign: "center" },
  placeholderMeta: { fontSize: 11, fontFamily: "monospace", color: "#6d5339" },
  placeholderCaption: { fontSize: 13, fontStyle: "italic", color: "#555", textAlign: "center", marginTop: 2 },
  activeImageWrapper: { width: "100%", marginVertical: 14, alignItems: "center", gap: 8 },
  imageCanvasEnvelope: {
    width: "100%",
    minHeight: 200,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingSkeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(235,220,185,0.85)",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    zIndex: 2,
  },
  loadingLabel: { fontSize: 11, color: "#6d5339", fontWeight: "600" },
  hiddenWhileLoading: { opacity: 0 },
  embeddedGraphic: {
    width: "100%",
    height: 260,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dfcba5",
  },
  canvasControlOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  controlBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(43,17,11,0.88)",
  },
  dangerBadge: {
    backgroundColor: "rgba(155,34,23,0.92)",
  },
  controlPressed: { opacity: 0.8 },
  controlBadgeText: { color: "#f6d890", fontSize: 11, fontWeight: "800" },
  activeCaption: { fontSize: 13, fontStyle: "italic", color: "#4a3b2c", paddingHorizontal: 12, textAlign: "center" },
  captionPrefix: { fontWeight: "bold", color: "#9b2217" },
});
