/**
 * Consent gate before the first remote analysis request (SPEC-LIGHTWEIGHT §5).
 * In-memory for the session. The sheet in the app layout writes the choice.
 */

let granted: boolean | null = null;
const listeners = new Set<() => void>();

export function getRemoteConsent(): boolean | null {
  return granted;
}

export function setRemoteConsent(value: boolean): void {
  granted = value;
  for (const listener of listeners) listener();
}

export function remoteCallsAllowed(): boolean {
  return granted === true;
}

export function subscribeRemoteConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper. */
export function resetRemoteConsentForTests(): void {
  granted = null;
}
