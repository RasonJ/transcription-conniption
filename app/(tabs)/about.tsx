import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ExternalLink,
  ScrollText,
  Github,
  BookOpen,
  Compass,
  Award,
} from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";

const references = [
  {
    title: "Hispanic Seminary of Medieval Studies",
    url: "https://hispanicseminary.org/index.htm",
    desc: "Primary portal for research on medieval Spanish linguistics, paleography, and lexicography.",
    icon: BookOpen,
  },
  {
    title: "HSMS Transcription Manual",
    url: "https://hispanicseminary.org/manual-en.htm",
    desc: "The authoritative structural syntax rules governing legacy machine-readable text representation.",
    icon: Compass,
  },
  {
    title: "OSTA Transcription Guide",
    url: "https://hispanicseminary.org/osta-en.htm",
    desc: "Extended paleographic standards applied to the Old Spanish Textual Archive corpora.",
    icon: Award,
  },
  {
    title: "OSTA Corpus on GitHub",
    url: "https://github.com/hispanicseminary/OSTA",
    desc: "Open source version-controlled repository containing thousands of raw diplomatic transcriptions.",
    icon: Github,
  },
];

export default function AboutScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 840;

  const handleOpenLink = async (url: string) => {
    if (Platform.OS === "web") {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
  };

  return (
    <LinearGradient colors={["#0c0301", "#1e0905", "#331109"]} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.desktopScrollPadding,
          ]}
          showsVerticalScrollIndicator
        >
          <View
            style={[styles.mainLayoutWrapper, isDesktop && styles.desktopRowDirection]}
          >
            <View
              style={[styles.summaryPanelCard, isDesktop && styles.desktopSplitPanel]}
            >
              <View style={styles.brandBadgeRow}>
                <View style={styles.monasteryIconBox}>
                  <ScrollText color="#ffd36e" size={26} />
                </View>
                <Text style={styles.kickerText}>Platform Documentation</Text>
              </View>

              <Text style={styles.mainTitleText}>Transcription Conniption</Text>
              <Text style={styles.narrativeParagraphText}>
                This workstation serves as a real-time vector rendering engine for
                line-based diplomatic transcriptions adhering to the strict format
                guidelines established by the Hispanic Seminary of Medieval Studies
                (HSMS).
              </Text>
              <Text style={styles.narrativeParagraphText}>
                By mapping raw inline diacritic strings, environment codes, and
                spatial annotations to precise coordinate vector metrics, it
                replicates the physical nature of historical manuscript layout
                architectures.
              </Text>
            </View>

            <View
              style={[styles.bibliographySection, isDesktop && styles.desktopSplitPanel]}
            >
              <Text style={styles.sectionTitleLabel}>
                Authoritative Resources & Corpora
              </Text>
              <View
                style={[
                  styles.referencesGrid,
                  isDesktop && styles.desktopGridTwoColumns,
                ]}
              >
                {references.map((item, idx) => {
                  const CustomIcon = item.icon;
                  return (
                    <Pressable
                      key={`ref-${idx}`}
                      onPress={() => handleOpenLink(item.url)}
                      style={({ pressed }) => [
                        styles.referenceCardItem,
                        pressed && styles.cardItemPressed,
                        isDesktop && styles.desktopCardFixedSize,
                      ]}
                    >
                      <View style={styles.cardItemTopLine}>
                        <View style={styles.microIconContainer}>
                          <CustomIcon color="#ffd36e" size={16} />
                        </View>
                        <ExternalLink color="rgba(255, 211, 110, 0.4)" size={14} />
                      </View>

                      <View style={styles.cardItemBody}>
                        <Text style={styles.referenceItemTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={styles.referenceItemDesc} numberOfLines={3}>
                          {item.desc}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 16, alignItems: "center" },
  desktopScrollPadding: { paddingVertical: 40, paddingHorizontal: 30 },
  mainLayoutWrapper: { width: "100%", maxWidth: 1100, gap: 20 },
  desktopRowDirection: { flexDirection: "row", alignItems: "stretch" },
  desktopSplitPanel: { flex: 1 },

  summaryPanelCard: {
    backgroundColor: "rgba(20, 5, 3, 0.5)",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(246, 216, 144, 0.12)",
    gap: 14,
    justifyContent: "center",
  },
  brandBadgeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  monasteryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(138, 28, 20, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.25)",
  },
  kickerText: {
    color: "#ffd36e",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  mainTitleText: {
    color: "#fffdf5",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
    fontFamily: "serif",
  },
  narrativeParagraphText: {
    color: "rgba(255,253,245,0.74)",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "justify",
    fontFamily: "serif",
  },

  bibliographySection: { gap: 14, justifyContent: "center" },
  sectionTitleLabel: {
    color: "#ffd36e",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  referencesGrid: { gap: 10 },
  desktopGridTwoColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  referenceCardItem: {
    backgroundColor: "rgba(255, 211, 110, 0.03)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 211, 110, 0.12)",
    padding: 16,
    gap: 12,
  },
  desktopCardFixedSize: { width: "49%", minHeight: 145 },
  cardItemPressed: {
    backgroundColor: "rgba(255, 211, 110, 0.08)",
    borderColor: "rgba(255, 211, 110, 0.25)",
  },
  cardItemTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  microIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 211, 110, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardItemBody: { gap: 4 },
  referenceItemTitle: { color: "#fffbf0", fontSize: 14, fontWeight: "700" },
  referenceItemDesc: {
    color: "rgba(255,251,240,0.55)",
    fontSize: 12,
    lineHeight: 17,
  },
});
