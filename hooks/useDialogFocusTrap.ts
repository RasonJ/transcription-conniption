import { useEffect, useRef } from "react";
import { Platform } from "react-native";

type Options = {
  /** When true, trap focus inside the dialog and listen for Esc. */
  active: boolean;
  onClose: () => void;
  /** DOM id of the title element to focus on open (web). */
  titleId?: string;
  /** DOM id of the dialog panel that contains focusable controls. */
  dialogId?: string;
};

/**
 * Web dialog focus behavior (SPEC-ACCESSIBILITY A11Y-6):
 * focus title on open, Esc closes, restore focus to the previously focused element.
 * Native platforms rely on `accessibilityViewIsModal` on the panel.
 */
export function useDialogFocusTrap({ active, onClose, titleId, dialogId }: Options) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const titleEl = titleId ? document.getElementById(titleId) : null;
    if (titleEl && !titleEl.getAttribute("tabindex")) {
      titleEl.setAttribute("tabindex", "-1");
    }
    const focusTimer = window.setTimeout(() => {
      titleEl?.focus?.();
    }, 0);

    const resolveDialog = (): HTMLElement | null => {
      if (dialogId) return document.getElementById(dialogId);
      if (titleEl) return titleEl.closest("[data-a11y-dialog]") as HTMLElement | null;
      return document.querySelector("[data-a11y-dialog]") as HTMLElement | null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = resolveDialog();
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [active, onClose, titleId, dialogId]);
}
