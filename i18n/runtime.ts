import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  detectDeviceLocale,
  ensureLocaleLoaded,
  isLocaleLoaded,
  loadStoredLocale,
  persistLocale,
  prefetchTier1Locales,
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

function scheduleIdle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (typeof ric === "function") ric(fn);
  else setTimeout(fn, 1500);
}

/**
 * UI locale provider (SPEC-I18N §3–4). Only `en` and the active locale's chain are loaded
 * before first render; all other Tier 1 catalogs are prefetched at idle so later switches
 * re-render synchronously from memory.
 */
export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectDeviceLocale());
  const [ready, setReady] = useState(() => isLocaleLoaded(locale));

  // Load the initial chain (instant for en; one small chunk otherwise).
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void ensureLocaleLoaded(locale).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, ready]);

  useEffect(() => {
    // Keep imperative `t()` on a loaded catalog. Until the chunk arrives, `translate`
    // still resolves through the statically bundled English catalog.
    if (!isLocaleLoaded(locale)) return;
    setActiveLocale(locale);
  }, [locale, ready]);

  // A stored choice overrides device detection.
  useEffect(() => {
    if (initialLocale) return;
    let cancelled = false;
    void loadStoredLocale().then(async (stored) => {
      if (!stored || cancelled) return;
      await ensureLocaleLoaded(stored);
      if (cancelled) return;
      setActiveLocale(stored);
      setLocaleState(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialLocale]);

  useEffect(() => {
    if (ready) scheduleIdle(() => void prefetchTier1Locales());
  }, [ready]);

  const setLocale = useCallback((next: Locale) => {
    void persistLocale(next);
    if (isLocaleLoaded(next)) {
      setActiveLocale(next);
      setLocaleState(next);
      return;
    }
    // Not prefetched yet: keep the current language on screen until the chunk arrives.
    void ensureLocaleLoaded(next).then(() => {
      setActiveLocale(next);
      setLocaleState(next);
    });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  // Hold the first render until the active chain is in memory (never for en; no English flash).
  if (!ready) return null;
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useContext(I18nContext);
  return { locale, setLocale };
}
