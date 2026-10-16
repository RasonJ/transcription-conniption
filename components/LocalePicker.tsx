import {
  PSEUDO_LOCALE,
  TIER1_LOCALES,
  TIER2_LOCALES,
  isCommunityLocale,
  useLocale,
  useT,
  type Locale,
} from "@/i18n/runtime";
import { Globe } from "lucide-react-native";
import React, { useCallback } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

/** Each language in its own name (SPEC-I18N §2); these are never translated. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  "es-ES": "Español (España)",
  "es-419": "Español (Latinoamérica)",
  "es-MX": "Español (México)",
  "es-AR": "Español (Argentina)",
  pt: "Português",
  "pt-PT": "Português (Portugal)",
  "pt-BR": "Português (Brasil)",
  ca: "Català",
  "ca-ES-valencia": "Valencià",
  gl: "Galego",
  eu: "Euskara",
  ast: "Asturianu",
  an: "Aragonés",
  "oc-aranes": "Aranés",
  qu: "Runa Simi",
  gn: "Avañe'ẽ",
  ay: "Aymar aru",
  "en-XA": "[Ëñglîsh ~~~]",
};

/** Built once — base catalogs (`es`, `pt`) are shared layers, not picker choices. */
const CACHED_LOCALES: Locale[] = (() => {
  const tier1 = TIER1_LOCALES.filter((l) => l !== "es" && l !== "pt");
  const list: Locale[] = [...tier1, ...TIER2_LOCALES];
  if (typeof __DEV__ !== "undefined" && __DEV__) list.push(PSEUDO_LOCALE);
  return list;
})();

function LocaleOption({ code, active, onPress }: { code: Locale; active: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLanguage={code === PSEUDO_LOCALE ? "en" : code}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{LOCALE_NATIVE_NAMES[code]}</Text>
      {isCommunityLocale(code) ? (
        <Text style={[styles.community, active && styles.chipTextActive]}>{t("common.communityTranslation")}</Text>
      ) : null}
    </Pressable>
  );
}

/** Full chip list (Sources tab). */
export function LocalePicker() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t("common.language")}</Text>
      <View style={styles.row}>
        {CACHED_LOCALES.map((code) => (
          <LocaleOption key={code} code={code} active={locale === code} onPress={() => setLocale(code)} />
        ))}
      </View>
    </View>
  );
}

/** One-tap header control (Studio): shows the current language, opens the list in a sheet. */
export function LocalePickerCompact() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const [open, setOpen] = React.useState(false);

  const renderItem = useCallback(
    ({ item: code }: { item: Locale }) => (
      <LocaleOption
        code={code}
        active={locale === code}
        onPress={() => {
          setLocale(code);
          setOpen(false);
        }}
      />
    ),
    [locale, setLocale],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.compact}
        accessibilityRole="button"
        accessibilityLabel={t("studio.languagePicker")}
        hitSlop={8}
      >
        <Globe color="#f6d890" size={14} />
        <Text style={styles.compactText}>{LOCALE_NATIVE_NAMES[locale]}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.label}>{t("studio.languagePicker")}</Text>
            <FlatList
              data={CACHED_LOCALES}
              keyExtractor={(code) => code}
              renderItem={renderItem}
              contentContainerStyle={styles.row}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  community: { color: "rgba(246,216,144,0.7)", fontSize: 10, fontWeight: "600" },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  compactText: { color: "#f6d890", fontSize: 12, fontWeight: "700" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,4,2,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: "#2a100b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(246,216,144,0.3)",
    padding: 16,
    gap: 12,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
    maxHeight: "80%",
  },
});
