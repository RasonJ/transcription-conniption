import { SUPPORTED_LOCALES, useLocale, type Locale } from "@/i18n/runtime";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  "es-ES": "Español (España)",
  "es-419": "Español (Latinoamérica)",
  pt: "Português",
  "pt-PT": "Português (Portugal)",
  "pt-BR": "Português (Brasil)",
  ca: "Català",
  gl: "Galego",
  eu: "Euskara",
};

export function LocalePicker() {
  const { locale, setLocale } = useLocale();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Language / Idioma</Text>
      <View style={styles.row}>
        {SUPPORTED_LOCALES.filter((l) => !["es", "pt"].includes(l)).map((code) => {
          const active = locale === code;
          return (
            <Pressable
              key={code}
              onPress={() => setLocale(code)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {LOCALE_NATIVE_NAMES[code]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 12 },
  label: { color: "#f6d890", fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.25)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,253,244,0.04)",
  },
  chipActive: {
    backgroundColor: "#f6d890",
    borderColor: "#f6d890",
  },
  chipText: { color: "#fff4d2", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#1a0a05" },
});
