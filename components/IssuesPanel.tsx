/**
 * One issues list, two variants (SPEC-VALIDATION VAL-21, VAL-25).
 * Strip collapses when there are no errors. Sheet is the full list (modal).
 */
import type { ValidationError } from "@/constants/manuscript";
import { useT } from "@/i18n/runtime";
import { localizeValidationMessage } from "@/utils/validationMessage";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  errors: ValidationError[];
  onJumpToLine?: (lineIndex: number) => void;
  variant?: "strip" | "sheet";
  stale?: boolean;
};

function severityWord(
  t: ReturnType<typeof useT>,
  severity: ValidationError["severity"],
): string {
  if (severity === "error") return t("validation.severity.error");
  if (severity === "info") return t("validation.severity.info");
  return t("validation.severity.warning");
}

function IssueRow({
  err,
  onJumpToLine,
}: {
  err: ValidationError;
  onJumpToLine?: (lineIndex: number) => void;
}) {
  const t = useT();
  const message = localizeValidationMessage(t, err);
  const icon = err.severity === "error" ? "✕" : err.severity === "info" ? "ℹ" : "⚠";
  const location = t("validation.sourceLocation", { line: err.lineIndex + 1 });
  return (
    <Pressable
      onPress={() => onJumpToLine?.(err.lineIndex)}
      disabled={!onJumpToLine}
      accessibilityRole="button"
      accessibilityLabel={`${severityWord(t, err.severity)}. ${location}. ${message}`}
      style={styles.row}
    >
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        {icon}
      </Text>
      <View style={styles.body} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.meta}>
          {severityWord(t, err.severity)} · {location}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Pressable>
  );
}

export function IssuesPanel({ errors, onJumpToLine, variant = "sheet", stale = false }: Props) {
  const t = useT();
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const [open, setOpen] = useState(errorCount > 0);
  const collapsed = variant === "strip" && !open;

  return (
    <View
      style={[styles.panel, stale && styles.stale]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      {variant === "strip" ? (
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.stripHeader}
        >
          <Text style={styles.stripTitle}>
            {t("studio.tool.issues", {
              errors: errorCount,
              warnings: errors.filter((e) => e.severity === "warning").length,
              notes: errors.filter((e) => e.severity === "info").length,
            })}
          </Text>
          {stale ? <Text style={styles.checking}>{t("studio.editor.parsing")}</Text> : null}
        </Pressable>
      ) : null}
      {collapsed ? null : (
        <View>
          {errors.length === 0 ? (
            <Text style={styles.empty}>{t("validation.okLinter")}</Text>
          ) : (
            errors.map((err, index) => (
              <IssueRow key={`${err.lineIndex}|${err.code ?? ""}|${index}`} err={err} onJumpToLine={onJumpToLine} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 8 },
  stale: { opacity: 0.5 },
  stripHeader: { minHeight: 44, justifyContent: "center" },
  stripTitle: { color: "#f6d890", fontWeight: "700" },
  checking: { color: "rgba(255,244,210,0.7)", fontSize: 12 },
  row: { flexDirection: "row", gap: 8, paddingVertical: 6, minHeight: 44 },
  icon: { color: "#f6d890", width: 16 },
  body: { flex: 1 },
  meta: { color: "rgba(255,244,210,0.65)", fontSize: 12 },
  message: { color: "#fff4d2", fontSize: 14 },
  empty: { color: "#a8d4a0", paddingVertical: 6 },
});
