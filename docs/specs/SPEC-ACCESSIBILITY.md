# Spec: Accessible Controls and Keyboard Use

**Status:** Approved · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-I18N.md](SPEC-I18N.md) §6 · [SPEC-COPILOT.md](SPEC-COPILOT.md) §11 · [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §4.2
**Fixes:** Walkthrough finding 10 (controls exposed as generic elements; unlabeled switches and tabs), plus color-only switch state from finding 7
**Target:** WCAG 2.1 AA on web; VoiceOver (iOS) and TalkBack (Android) on native

---

## 1. Goal

Every interaction in the application can be operated seamlessly via keyboard or screen reader. Controls announce their name, role, and current state using unified shared primitives (`ActionButton`, `LabeledSwitch`) that keep accessibility compliance automatic across future features.

---

## 2. Standardized Component Architecture

1. **`ActionButton` (`components/ui/ActionButton.tsx`)**:
   - Replaces bare `Pressable` calls across Studio, Library, and Modal views.
   - Enforces `accessibilityRole="button"` and 44×44 pt minimum touch targets.
   - Renders explicit web focus rings with 3:1 contrast against parchment and dark background themes.

2. **`LabeledSwitch` (`components/ui/LabeledSwitch.tsx`)**:
   - Replaces unlabelled switches in display/editor settings strips.
   - Binds switch state (`accessibilityState={{ checked }}`) directly to the associated text label.
   - Neutral off track (never red) so color alone does not imply error.

3. **Lint Gate Enforcement**:
   - Custom ESLint rule (`a11y/pressable-needs-role` in `eslint-rules/pressable-needs-role.js`) warns (→ error after A11Y-P1) when unannotated interactive elements appear outside approved primitives.

4. **Dialog focus (`hooks/useDialogFocusTrap.ts`)**:
   - Concordance and Export sheets: focus title on open, Esc closes, focus restored to the invoker; `accessibilityViewIsModal` on native.

---

## 3. Screen Reader & Focus Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| A11Y-1 | `ActionButton` primitive | Role + label + focus ring |
| A11Y-2 | Lint `a11y/pressable-needs-role` | CI warn → error after migration |
| A11Y-3 | `LabeledSwitch` on Studio display strip | SR announces name + checked |
| A11Y-6 | Drawers trap focus / Esc | Keyboard script |
| A11Y-7 | Witness `lang` / `accessibilityLanguage` | P2 |
| A11Y-8 | Decorative drop caps hidden | P2 |
| A11Y-10 | Contrast tokens | P3 |

---

## 4. Rollout

| Phase | Scope |
|-------|-------|
| A11Y-P1 | Primitives, LabeledSwitch migration (Studio strip), lint rule (warn), dialog trap on Concordance/Export |
| A11Y-P2 | Remaining `ActionButton` migrations, A11Y-7/8/9, lint → error |
| A11Y-P3 | Contrast audit, shortcuts sheet, axe-core gate |

---

## 5. Open questions

1. Is there an institutional accessibility requirement (e.g. Georgetown policy, Section 508) that sets a deadline or a stricter target?
