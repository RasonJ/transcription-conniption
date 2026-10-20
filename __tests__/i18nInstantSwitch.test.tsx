import React from "react";
// @ts-expect-error -- react-test-renderer ships no type declarations here
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { I18nProvider, useLocale, useT, type Locale } from "../i18n/runtime";

let switchTo: (l: Locale) => void = () => undefined;

function Probe() {
  const t = useT();
  const { setLocale } = useLocale();
  switchTo = setLocale;
  return <Text>{t("common.close")}</Text>;
}

describe("instant locale switch (SPEC-I18N I18N-1)", () => {
  it("re-renders every Tier 1 locale synchronously once catalogs are in memory", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <I18nProvider initialLocale="en">
          <Probe />
        </I18nProvider>,
      );
    });
    const text = () => renderer.root.findByType(Text).props.children;
    expect(text()).toBe("Close");

    const expected: Array<[Locale, string]> = [
      ["es-ES", "Cerrar"],
      ["pt-BR", "Fechar"],
      ["ca", "Tancar"],
      ["gl", "Pechar"],
      ["eu", "Itxi"],
      ["en", "Close"],
    ];
    for (const [locale, label] of expected) {
      // No await: the new language must be on screen within the same synchronous act().
      act(() => switchTo(locale));
      expect(text()).toBe(label);
    }
    act(() => {
      renderer.unmount();
    });
  });
});
