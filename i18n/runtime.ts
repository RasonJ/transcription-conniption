import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  detectDeviceLocale,
  loadStoredLocale,
  persistLocale,
  setActiveLocale,
  translate,
  type Locale,
  type TFunction,
} from "./core";

export * from "./core";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
};

const defaultT: TFunction = (key, params) => translate("en", key, params);

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => undefined,
  t: defaultT,
});

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectDeviceLocale());

  useEffect(() => {
    setActiveLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (initialLocale) return;
    let cancelled = false;
    loadStoredLocale().then((stored) => {
      if (!cancelled && stored) setLocaleState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
    void persistLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useContext(I18nContext);
  return { locale, setLocale };
}
