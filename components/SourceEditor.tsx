/**
 * Source editor with gutter, spellcheck off, brace pairing, and mnemonic completion
 * (SPEC-EDITOR ED-1…5, ED-20, ED-21).
 */
import type { ValidationError } from "@/constants/manuscript";
import { useT } from "@/i18n/runtime";
import { pairBraces } from "@/utils/editorTransforms";
import {
  applyMnemonicCompletion,
  completionToken,
  getMnemonicCompletions,
} from "@/utils/mnemonicCompletions";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type Selection = { start: number; end: number };

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  diagnostics?: ValidationError[];
  selection?: Selection;
  onSelectionChange?: (selection: Selection) => void;
};

const LINE_HEIGHT = 23;

export function SourceEditor({
  value,
  onChangeText,
  onBlur,
  placeholder,
  diagnostics = [],
  selection,
  onSelectionChange,
}: Props) {
  const t = useT();
  const { height } = useWindowDimensions();
  const [cursor, setCursor] = useState(selection?.start ?? value.length);
  const minHeight = Math.max(360, Math.round(height * 0.6));

  const lines = value.split(/\r?\n/);
  const byLine = useMemo(() => {
    const map = new Map<number, ValidationError["severity"]>();
    for (const issue of diagnostics) {
      const prev = map.get(issue.lineIndex);
      if (prev === "error") continue;
      if (issue.severity === "error" || !prev) map.set(issue.lineIndex, issue.severity);
    }
    return map;
  }, [diagnostics]);

  const prefix = completionToken(value, cursor);
  const lineBefore = value.slice(0, cursor);
  const completions = prefix === null ? [] : getMnemonicCompletions(prefix, lineBefore);

  const handleChange = (next: string) => {
    const paired = pairBraces(value, next);
    if (paired) {
      onChangeText(paired.text);
      setCursor(paired.cursor);
      onSelectionChange?.({ start: paired.cursor, end: paired.cursor });
      return;
    }
    onChangeText(next);
  };

  const webInputProps =
    Platform.OS === "web"
      ? ({
          spellCheck: false,
          autoComplete: "off",
          translate: "no",
          "data-gramm": "false",
        } as object)
      : { spellCheck: false, autoComplete: "off" as const };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { minHeight }]}>
        <ScrollView style={styles.gutter} contentContainerStyle={styles.gutterContent} scrollEnabled={false}>
          {lines.map((_, index) => {
            const severity = byLine.get(index);
            const mark = severity === "error" ? "✕" : severity === "warning" ? "⚠" : severity === "info" ? "ℹ" : "";
            return (
              <Text
                key={index}
                style={styles.gutterLine}
                accessibilityLabel={t("editor.lineLabel", { line: index + 1 })}
              >
                {mark ? `${mark} ` : ""}
                {index + 1}
              </Text>
            );
          })}
        </ScrollView>
        <TextInput
          multiline
          value={value}
          onChangeText={handleChange}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor="rgba(246,216,144,0.45)"
          style={[styles.input, { minHeight, lineHeight: LINE_HEIGHT }]}
          textAlignVertical="top"
          autoCorrect={false}
          autoCapitalize="none"
          selection={selection}
          onSelectionChange={(event) => {
            const next = event.nativeEvent.selection;
            setCursor(next.start);
            onSelectionChange?.(next);
          }}
          {...webInputProps}
        />
      </View>
      {completions.length > 0 ? (
        <View style={styles.completions}>
          {completions.map((spec) => (
            <Pressable
              key={spec.code}
              accessibilityRole="button"
              accessibilityLabel={spec.name}
              onPress={() => {
                const applied = applyMnemonicCompletion(value, cursor, spec);
                onChangeText(applied.text);
                setCursor(applied.cursor);
                onSelectionChange?.({ start: applied.cursor, end: applied.cursor });
              }}
              style={styles.completionRow}
            >
              <Text style={styles.completionCode}>{spec.code}</Text>
              <Text style={styles.completionName}>{spec.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  row: { flexDirection: "row", alignItems: "stretch" },
  gutter: { width: 56, maxHeight: 640 },
  gutterContent: { paddingTop: 8 },
  gutterLine: {
    height: LINE_HEIGHT,
    lineHeight: LINE_HEIGHT,
    color: "rgba(246,216,144,0.55)",
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    textAlign: "right",
    paddingRight: 6,
  },
  input: {
    flex: 1,
    color: "#fff4d2",
    fontSize: 15,
    fontFamily: Platform.select({
      web: 'ui-monospace, "Junicode", monospace',
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  completions: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.35)",
    borderRadius: 8,
    backgroundColor: "#2a120c",
  },
  completionRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  completionCode: { color: "#f6d890", fontFamily: "monospace", width: 48 },
  completionName: { color: "#fff4d2", flex: 1 },
});
