import type { ValidationError } from "../constants/manuscript";
import { hasMessage, type MessageKey, type TFunction } from "../i18n/core";

/**
 * UI text for a validation issue (SPEC-I18N §4.3): `validation.<code>` in the active locale
 * when the code has a catalog entry, otherwise the English `message` without its `[CODE]`
 * prefix. CLI tools and issue logs keep using `message` directly so they stay stable.
 */
export function localizeValidationMessage(t: TFunction, error: ValidationError): string {
  if (error.code) {
    const key = `validation.${error.code}`;
    if (hasMessage(key)) {
      return t(key as MessageKey, error.params);
    }
  }
  return error.message.replace(/^\[[A-Za-z0-9_-]+\]\s*/, "");
}
