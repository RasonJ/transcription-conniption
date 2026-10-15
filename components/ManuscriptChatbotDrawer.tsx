import { MANUSCRIPT_INTENT_PROTOTYPES } from "@/constants/manuscriptIntents";
import { useScrollAnchor } from "@/context/ScrollAnchorContext";
import { useScriptorium } from "@/context/ScriptoriumContext";
import { buildProtoVectors } from "@/utils/embeddings/intentClassifier";
import { askManuscript, type SearchHit } from "@/utils/manuscriptSearch";
import { buildManuscriptVectorIndex } from "@/utils/manuscriptVectorIndex";
import { ArrowRight, BookOpen, Search, Sparkles, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
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
};

export function ManuscriptChatbotDrawer({ visible, onClose }: Props) {
  const { parsedManuscript } = useScriptorium();
  const { navigateToAnchor } = useScrollAnchor();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [searchTimeMs, setSearchTimeMs] = useState<number | null>(null);

  const vectorIndex = useMemo(
    () => buildManuscriptVectorIndex(parsedManuscript),
    [parsedManuscript],
  );

  const intentProtos = useMemo(
    () => buildProtoVectors({ ...MANUSCRIPT_INTENT_PROTOTYPES }),
    [],
  );

  const handleAsk = useCallback(() => {
    if (!query.trim()) return;

    const result = askManuscript(query, parsedManuscript, vectorIndex, {
      protoVecs: intentProtos,
    });

    setSearchTimeMs(result.elapsedMs);

    if (result.mode === "folio" && result.folioJump) {
      navigateToAnchor(result.folioJump);
      setHits([]);
      setStatusLine(`Jumped to [fol. ${result.folioJump.folioId}]`);
      onClose();
      return;
    }

    setHits(result.hits);
    const intentLabel = result.intent
      ? `${result.intent.intent} (${(result.intent.score * 100).toFixed(0)}%)`
      : "search";
    setStatusLine(
      result.hits.length > 0
        ? `${result.hits.length} passage${result.hits.length === 1 ? "" : "s"} · ${intentLabel}`
        : `No passages above threshold · ${intentLabel}`,
    );
  }, [query, parsedManuscript, vectorIndex, intentProtos, navigateToAnchor, onClose]);

  const handleJumpToHit = useCallback(
    (hit: SearchHit) => {
      navigateToAnchor({
        folioId: hit.chunk.folioId,
        lineNumber: hit.chunk.lineNumber,
      });
      onClose();
    },
    [navigateToAnchor, onClose],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Sparkles color="#f6d890" size={18} />
              <Text style={styles.title}>Manuscript Assistant</Text>
            </View>
            {searchTimeMs !== null ? (
              <Text style={styles.speedBadge}>{searchTimeMs.toFixed(2)} ms</Text>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close manuscript assistant"
            >
              <X color="#f6d890" size={22} />
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Local hash-embed search — folio jumps, rubrics, glosses, and passage matches. No
            network.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleAsk}
              placeholder='Ask or search (e.g. "go to fol. 2r", "rubrics about gold")…'
              placeholderTextColor="#99836a"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable
              onPress={handleAsk}
              style={styles.sendButton}
              accessibilityRole="button"
              accessibilityLabel="Search manuscript"
            >
              <Search color="#1a0a05" size={16} />
            </Pressable>
          </View>

          {statusLine ? <Text style={styles.status}>{statusLine}</Text> : null}

          <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
            {hits.map((hit) => (
              <Pressable
                key={hit.chunk.id}
                onPress={() => handleJumpToHit(hit)}
                style={styles.hitCard}
                accessibilityRole="button"
              >
                <View style={styles.hitHeader}>
                  <View style={styles.hitMetaRow}>
                    <BookOpen color="#f6d890" size={12} />
                    <Text style={styles.hitFolio}>
                      [fol. {hit.chunk.folioId}]
                      {hit.chunk.lineNumber ? ` · line ${hit.chunk.lineNumber}` : ""}
                      {hit.chunk.type !== "prose" ? ` · ${hit.chunk.type}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.hitScore}>{(hit.score * 100).toFixed(0)}%</Text>
                </View>
                <Text style={styles.hitText} numberOfLines={2}>
                  {hit.chunk.text}
                </Text>
                <View style={styles.jumpHint}>
                  <Text style={styles.jumpHintText}>Jump to leaf</Text>
                  <ArrowRight color="#f6d890" size={12} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  panel: {
    maxHeight: "82%",
    minHeight: "45%",
    backgroundColor: "#2a100b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { color: "#f6d890", fontSize: 18, fontWeight: "900" },
  speedBadge: {
    color: "#8fbf6a",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  hint: { color: "rgba(246,216,144,0.65)", fontSize: 12, marginBottom: 4 },
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
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: "#f6d890",
    borderRadius: 12,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  status: { color: "rgba(246,216,144,0.75)", fontSize: 12, fontWeight: "600" },
  resultsList: { flexGrow: 0, maxHeight: 360, marginTop: 4 },
  hitCard: {
    backgroundColor: "rgba(255,253,244,0.05)",
    borderColor: "rgba(246,216,144,0.15)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  hitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hitMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  hitFolio: { color: "#f6d890", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  hitScore: { color: "rgba(255,244,210,0.5)", fontSize: 11, fontFamily: "monospace" },
  hitText: { color: "#fff4d2", fontSize: 13, lineHeight: 18 },
  jumpHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  jumpHintText: { color: "rgba(246,216,144,0.55)", fontSize: 11, fontWeight: "600" },
});
