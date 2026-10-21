# Spec: Accessible Controls and Keyboard Use

**Status:** Approved, partly implemented · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-I18N.md](SPEC-I18N.md) §6 · [SPEC-COPILOT.md](SPEC-COPILOT.md) §11 · [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §4.2
**Fixes:** walkthrough finding 10 (controls exposed as generic elements; unlabeled switches and tabs), plus color-only switch state from finding 7
**Target:** WCAG 2.1 AA on web; platform screen readers (VoiceOver, TalkBack) on native

---

## 1. Goal

Every action in the app can be reached and operated with a keyboard and a screen reader, and every control announces its name, role and state. This is done once, in shared primitives, so new UI is accessible by default.

---

## 2. Findings (accessibility tree, web, 2026-10-20)

| # | Observation | WCAG |
|---|-------------|------|
| A1 | Most actions are exposed as `generic`, not `button`: Advanced editor, header Export, editor tools (New blank scriptorium, Batch folder, Export/Import .hsms, Nunes demo, Simple, LAT span, Graphics), toolbar Concordance, Ask, TEI export, Export, Errors, the Source/Page segmented control, and every Library "Open in Studio →". Only Upload, header Ask and the language button are real buttons. | 4.1.2 Name, Role, Value; 2.1.1 Keyboard |
| A2 | All 13 display switches are announced as `switch "on"` with no name. | 4.1.2; 1.3.1 |
| A3 | Bottom tabs (Studio, Library, Sources) are `tab` elements with no accessible name. | 4.1.2 |
| A4 | Switch state is conveyed by color (red/teal) plus thumb position; red implies error. | 1.4.1 Use of Color |
| A5 | Not verified (needs audit): visible focus, drawer focus trapping and Esc, contrast of small muted text on the dark brown theme, decorative drop-cap image exposure, `accessibilityLanguage` on witness text. | 2.4.7, 2.4.3, 1.4.3, 1.1.1, 3.1.2 |

---

## 3. Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| A11Y-1 | **`ActionButton` primitive** (`components/ui/ActionButton.tsx`) wraps `Pressable` with `accessibilityRole="button"`, required `accessibilityLabel` (defaults to visible text), `accessibilityState` (`disabled`, `selected`, `expanded`, `busy`), optional `accessibilityHint`, focus ring on web (`:focus-visible`, 2 px, accent token, 3:1 contrast against both surfaces). Variants: primary, secondary, ghost, chip. | Replaces every action listed in A1 |
| A11Y-2 | **Lint gate:** custom ESLint rule `a11y/pressable-needs-role` fails on `Pressable`, `TouchableOpacity`, `TouchableHighlight` in `app/` and `components/` without `accessibilityRole` (allow-list for `ActionButton` internals). | CI |
| A11Y-3 | **`LabeledSwitch` primitive**: label text is the accessible name; `accessibilityRole="switch"`, `accessibilityState={{ checked }}`; helper text as `accessibilityHint`; tap target ≥ 44×44 including label; neutral off / accent on (no red); "On"/"Off" text on phones. | Screen reader announces "Show deletions, switch, on" |
| A11Y-4 | **Segmented control** (Source/Page, Layout: Tabs/Side by side, Group by Lemma/Word form): `role="tablist"` / `tab` with `selected`, arrow-key navigation on web. | Keyboard test |
| A11Y-5 | **Tab bar**: `tabBarAccessibilityLabel` per tab from i18n keys. | Names announced |
| A11Y-6 | **Drawers and sheets** (Concordance, Assistant, Export, Issues, Display popover): `accessibilityViewIsModal` / `role="dialog"` with `aria-labelledby` the title; focus moves to the title on open, is trapped inside, `Esc` closes, focus returns to the invoking control. | Keyboard script passes |
| A11Y-7 | **Witness text language**: set `accessibilityLanguage` / `lang` on page text from the witness language and language spans (SPEC-I18N §6 mapping), so screen readers pronounce Portuguese text as Portuguese. | DOM: `lang="pt"` on Nunes body text, `lang="la"` inside `{LAT.}` spans |
| A11Y-8 | **Decorative graphics**: ornate drop caps are hidden from the tree (`accessibilityElementsHidden` / `aria-hidden`), and the initial letter remains in the text stream (today the page text yields "S S Phera", see walkthrough `get_page_text`). | Screen-reader text reads "SPhera segundo Euclides" once |
| A11Y-9 | **Line numbers** in the page gutter are not read as part of the text (hidden) but each line row has an accessible label "Line 8" available on focus in edit mode. | Manual |
| A11Y-10 | **Contrast**: all text ≥ 4.5:1 (≥ 3:1 for ≥ 18.66 px bold), all UI component boundaries ≥ 3:1, in both theme surfaces (dark chrome, parchment page). Tokenize colors that fail. | axe-core + manual spot check of muted captions, chip counts, "Catchword" label on parchment |
| A11Y-11 | **Keyboard shortcuts** (web) are listed in a "Keyboard shortcuts" sheet (`?`), never required for any action, and don't override browser/AT shortcuts. | Manual |
| A11Y-12 | **Touch targets** ≥ 44×44 pt for all controls on native and phone web. | Layout test on chips and toolbar buttons |

---

## 4. Tests

| Test | Gate |
|------|------|
| `@testing-library/react-native` role queries: every Studio, Library and About action found by `getByRole("button", { name })` | Pass |
| Playwright + `@axe-core/playwright` on `/`, `/library`, `/about`, and with each drawer open | 0 critical, 0 serious violations |
| Keyboard-only script: open a sample, switch to Source, apply a quick fix, open Concordance, export TEI, change language — without a pointer | Pass |
| VoiceOver (iOS) and TalkBack (Android) manual pass on the same script | Release checklist |
| Lint rule A11Y-2 | CI |

`@axe-core/playwright` is a dev dependency only; no bundle impact.

## 5. Rollout

| Phase | Scope |
|-------|-------|
| A11Y-P1 | Primitives (A11Y-1, 3, 4, 5) and lint rule; migrate all controls. Do this **before** SPEC-STUDIO-IA P1, which rebuilds the same controls. |
| A11Y-P2 | Dialog behavior (A11Y-6), language and decorative graphics (A11Y-7, 8, 9) |
| A11Y-P3 | Contrast audit and fixes (A11Y-10), shortcuts sheet, touch targets; axe in CI as a gate |

## 6. Open questions

1. Is there an institutional accessibility requirement (e.g. Georgetown policy, Section 508) that sets a deadline or a stricter target?

---

## 7. Implementation status (2026-10-20, from the repo)

What the repo copy of this spec reports as done. Not yet checked against the code.

| Item | Status |
|------|--------|
| A11Y-1 `ActionButton` (`components/ui/ActionButton.tsx`) | Shipped: role, label, 44×44 target, web focus ring |
| A11Y-2 lint `a11y/pressable-needs-role` (`eslint-rules/pressable-needs-role.js`) | Shipped as **warn**; switch to error after the migration |
| A11Y-3 `LabeledSwitch` (`components/ui/LabeledSwitch.tsx`) | Shipped on the Studio display strip; neutral off track |
| A11Y-6 dialog focus (`hooks/useDialogFocusTrap.ts`) | Shipped on Concordance and Export sheets; Assistant, Issues and Display popover still to do |
| A11Y-4, 5, 7–12 | Not started |
