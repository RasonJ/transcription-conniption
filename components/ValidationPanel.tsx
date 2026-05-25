import type { ValidationError } from "@/constants/manuscript";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  errors: ValidationError[];
  onJumpToLine?: (lineIndex: number) => void;
};

const ValidationErrorRow = React.memo(function ValidationErrorRow({
  err,
  onJumpToLine,
}: {
  err: ValidationError;
  onJumpToLine?: (lineIndex: number) => void;
}) {
  const handlePress = useCallback(() => {
    if (typeof err.lineIndex !== "number" || err.lineIndex < 0) return;
    onJumpToLine?.(err.lineIndex);
  }, [err.lineIndex, onJumpToLine]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={!onJumpToLine}
      style={({ pressed }) => [styles.row, pressed && onJumpToLine && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Line ${err.lineIndex + 1}: ${err.message}`}
    >
      {err.severity === "error" ? (
        <AlertTriangle color="#c44" size={16} />
      ) : (
        <AlertTriangle color="#b8860b" size={16} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.message}>
          L{err.lineIndex + 1}: {err.message}
        </Text>
        <Text style={styles.snippet} numberOfLines={2}>
          {err.rawSnippet}
        </Text>
        {onJumpToLine ? <Text style={styles.jump}>Jump to line on canvas →</Text> : null}
      </View>
    </Pressable>
  );
});

export function ValidationPanel({ errors, onJumpToLine }: Props) {
  const { errorCount, warnCount, visibleErrors, overflowCount } = useMemo(() => {
    let errorsN = 0;
    let warningsN = 0;
    for (let i = 0; i < errors.length; i++) {
      if (errors[i].severity === "error") errorsN++;
      else if (errors[i].severity === "warning") warningsN++;
    }
    return {
      errorCount: errorsN,
      warnCount: warningsN,
      visibleErrors: errors.slice(0, 24),
      overflowCount: Math.max(0, errors.length - 24),
    };
  }, [errors]);

  if (errors.length === 0) {
    return (
      <View style={styles.okBanner}>
        <CheckCircle2 color="#446622" size={18} />
        <Text style={styles.okText}>Transcription structure looks consistent.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>
        Validation · {errorCount} error{errorCount !== 1 ? "s" : ""}
        {warnCount > 0 ? ` · ${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""}
      </Text>
      {visibleErrors.map((err) => (
        <ValidationErrorRow
          key={`${err.lineIndex}|${err.severity}|${err.message}|${err.rawSnippet}`}
          err={err}
          onJumpToLine={onJumpToLine}
        />
      ))}
      {overflowCount > 0 ? (
        <Text style={styles.more}>+{overflowCount} more issues</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(35,12,9,0.92)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.2)",
  },
  title: { color: "#f6d890", fontWeight: "800", fontSize: 12, marginBottom: 8, textTransform: "uppercase" },
  row: { flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "flex-start", borderRadius: 8, padding: 4 },
  rowPressed: { backgroundColor: "rgba(246,216,144,0.1)" },
  rowBody: { flex: 1 },
  message: { color: "#fff4d2", fontSize: 13, fontWeight: "600" },
  snippet: { color: "rgba(246,216,144,0.55)", fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  jump: { color: "#7ba4cc", fontSize: 11, marginTop: 4, fontWeight: "700" },
  more: { color: "#99836a", fontSize: 11, fontStyle: "italic" },
  okBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(68,102,34,0.2)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  okText: { color: "#a8d4a0", fontSize: 13, fontWeight: "600" },
});
