/**
 * Registers `public/sw.js` in production web builds (offline shell + lazy dictionary cache).
 * Skipped in development so Metro's live reload is never served from cache.
 * Set EXPO_PUBLIC_DISABLE_SW=1 to turn it off.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.EXPO_PUBLIC_DISABLE_SW === "1") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
