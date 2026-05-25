import { scriptoriumTheme as t } from "@/constants/scriptoriumTheme";
import type { ValidationError } from "@/constants/manuscript";
import { lintHsmsTranscription } from "@/utils/hsmsLinter";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  transcriptionText: string;
  onJumpToLine?: (lineIndex: number) => void;
};

const MAX_VISIBLE = 12;

export function EditorLinterBanner({ transcriptionText, onJumpToLine }: Props) {
  const report = useMemo(() => lintHsmsTranscription(transcriptionText), [transcriptionText]);
  const ordered = [...report.criticalErrors, ...report.structuralWarnings];

  if (report.issues.length === 0) {
    return (
      <View style={styles.okBanner}>
        <CheckCircle2 color="#a8d4a0" size={16} />
        <Text style={styles.okText}>Markup verified — ready for parchment / SVG render</Text>
      </View>
    );
  }
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  return (
    <View style={styles.container}>
      <View style={[styles.banner, report.isValid ? styles.warnBanner : styles.errBanner]}>
        {report.isValid ? (
          <AlertTriangle color="#f6d890" size={16} />
        ) : (
          <XCircle color="#ef9a9a" size={16} />
        )}
        <Text style={report.isValid ? styles.warnTitle : styles.errTitle}>
          {report.errorCount} error{report.errorCount !== 1 ? "s" : ""}
          {report.warningCount > 0
            ? ` · ${report.warningCount} warning${report.warningCount !== 1 ? "s" : ""}`
            : ""}
        </Text>
      </View>

      <ScrollView style={styles.issueList} nestedScrollEnabled>
        {visible.map((issue, idx) => (
          <IssueRow key={`${issue.lineIndex}|${issue.message}|${idx}`} issue={issue} onJumpToLine={onJumpToLine} />
        ))}
        {overflow > 0 ? <Text style={styles.more}>+{overflow} more — open validation sheet</Text> : null}
      </ScrollView>
    </View>
  );
}

function IssueRow({
  issue,
  onJumpToLine,
}: {
  issue: ValidationError;
  onJumpToLine?: (lineIndex: number) => void;
}) {
  const isError = issue.severity === "error";
  return (
    <Pressable
      onPress={() => onJumpToLine?.(issue.lineIndex)}
      disabled={!onJumpToLine}
      style={({ pressed }) => [styles.issueRow, pressed && onJumpToLine && styles.issueRowPressed]}
    >
      <Text style={[styles.lineMeta, isError ? styles.errMeta : styles.warnMeta]}>
        L{issue.lineIndex + 1}
      </Text>
      <View style={styles.issueBody}>
        <Text style={styles.issueMessage}>{issue.message}</Text>
        {issue.rawSnippet ? (
          <Text style={styles.issueSnippet} numberOfLines={1}>
            {issue.rawSnippet.trim()}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: t.goldBorder,
    backgroundColor: t.frostEditor,
  },
  okBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(68,102,34,0.25)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(168,212,160,0.35)",
  },
  okText: { color: "#a8d4a0", fontSize: 12, fontWeight: "700", flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errBanner: { backgroundColor: "rgba(198, 40, 40, 0.18)" },
  warnBanner: { backgroundColor: "rgba(181, 124, 0, 0.18)" },
  errTitle: { color: "#ef9a9a", fontSize: 12, fontWeight: "800", flex: 1 },
  warnTitle: { color: t.goldMuted, fontSize: 12, fontWeight: "800", flex: 1 },
  issueList: { maxHeight: 140, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: t.goldBorder },
  issueRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(246,216,144,0.08)",
    alignItems: "flex-start",
  },
  issueRowPressed: { backgroundColor: "rgba(246,216,144,0.08)", borderRadius: 6 },
  lineMeta: { fontSize: 11, fontWeight: "800", fontFamily: "monospace", width: 40, paddingTop: 2 },
  errMeta: { color: "#ef9a9a" },
  warnMeta: { color: t.goldMuted },
  issueBody: { flex: 1, gap: 2 },
  issueMessage: { color: t.textCream, fontSize: 12, lineHeight: 17 },
  issueSnippet: { color: t.textCreamSoft, fontSize: 10, fontFamily: "monospace" },
  more: { color: t.textCreamSoft, fontSize: 11, fontStyle: "italic", padding: 8 },
});
