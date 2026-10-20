# Spec: Folio Viewport (fit, zoom, and pan for the parchment page)

**Status:** Approved (P1 scaffold) · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-VALIDATION.md](SPEC-VALIDATION.md) (line highlight) · [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md)
**Fixes:** walkthrough finding 1 (parchment cut off below about 740 px; unreadable on phones)

---

## 0. Implementation (P1)

- `components/svgFacsimile/FolioViewport.tsx` — measures container width, clamps fit scale, warns when `FS * scale < 11px`, optional Reading View CTA.
- Wire into `SvgFacsimilePage` / parchment host in FV-P2.

## 1. Goal

Every part of a folio is visible and reachable at every supported viewport width, from a 320 px phone to a 2560 px desktop. That includes body text, glosses in both margins, catchword, signature, leaf label, running heading, and figures. The faithful layout (fixed proportions, justified lines, drop initials) is kept. The page is scaled, never reflowed, unless the reader asks for a reflowed reading view.

### Non-goals

- Changing the layout engine (`pageLayout.ts`, `layoutForFolio()`, justification in `glyphMetrics.ts`). They define the page and stay as they are.
- Changing exports. `svgDocumentExport.ts` and `htmlExport.ts` keep rendering at `CANVAS_W`.

---

## 2. Findings (observed 2026-10-20, web build, commit `41b6637d`)

| # | Observation | Evidence |
|---|-------------|----------|
| F1 | At a 705 px viewport the folio container is 667 px wide, but its content is 734 px, with `overflow-x: hidden`. The leaf label `[fol. 3r]`, the right-margin gloss on line 13, and the catchword are cut off and can't be scrolled to. | `scrollWidth` 734 vs `clientWidth` 667 on the folio wrapper (DOM probe). Screenshot: walkthrough finding 1. |
| F2 | At 375 px (mobile preset) the text is clipped on **both** sides. Only about 10 lines show, followed by blank parchment. | Walkthrough screenshot "mobile". This suggests the page is centered in a box narrower than `CANVAS_W` and its height is computed separately from what is visible. |
| F3 | Reader mode and editor mode clip differently: editor mode shows a vertical scrollbar and the leaf label, but still cuts the right margin (line 10 "das estre-" lost, gloss lost). | Walkthrough screenshots `reader`, `toggles`. |
| F4 | Page width is a constant. `CANVAS_W` (in `components/svgFacsimile/pageLayout.ts`) feeds `innerCanvasWidth()` / `columnWidth()` in both `SvgFacsimilePage.tsx` (native, react-native-svg) and `SvgFacsimilePage.web.tsx` (HTML `Div` layout). Neither file shows a measured-width input. | Code graph at `41b6637d`. Confirm in source. |

Root cause, to confirm in source: the page is drawn at a fixed logical width (`CANVAS_W` plus margins), and its parent clips the overflow. Nothing scales the page to the space available.

---

## 3. Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| FV-1 | The folio is rendered inside a `FolioViewport` that measures its own width (`onLayout`) and scales the page to fit by default. | At container widths 320, 375, 480, 705, 768, 1024, 1440, 2560 px, the bounding box of every printable block (`getPrintableBlocks()`), the leaf label, gloss blocks, catchword, and signature lies inside the viewport's scrollable area (Playwright test, §7). |
| FV-2 | The page height in layout matches the scaled height, so there is no blank band and no hidden lines. | Wrapper height = `pageHeight × scale` ± 1 px; the last line of the longest golden folio is visible after scrolling to the end. |
| FV-3 | Zoom modes: **Fit width** (default), **Actual size** (scale 1), and free zoom from 0.5× to 3×. | Controls in the folio toolbar: `−`, a zoom level button that cycles Fit/100%, and `+`. Web keyboard shortcuts: `Ctrl/Cmd +`, `Ctrl/Cmd −`, `Ctrl/Cmd 0` (when focus is inside the viewport). Pinch on touch. `Ctrl`+wheel on web. |
| FV-4 | When the scaled page is wider than the viewport, the viewport pans in both directions with visible affordances. | `overflow: auto` on the viewport (never `hidden`). An edge shadow appears on any side with more content. A horizontal scrollbar is visible on desktop web. |
| FV-5 | Below a legibility floor, the reader is offered the reflowed reading view. | If fit scale × base font size (`FS` in `tokenRendering.ts`) < 11 px, show a one-line bar: "Text is small at this width. **Switch to reading view** · Zoom in". "Reading view" turns on the existing **Reading flow** display setting. It is dismissible and remembered per session. |
| FV-6 | Scroll anchors and highlights work at any scale. | `ScrollAnchorProvider` offsets are multiplied by the current scale. "Jump to line" lands the target line within the top third of the viewport at scales 0.5, 1, and 2 (unit test on the offset math plus one Playwright test). |
| FV-7 | Zoom state is per workspace and per session, kept in memory. It is not persisted. | Opening another witness resets to Fit width. |
| FV-8 | No new dependency. | The bundle-size check (`size:check`) stays within the +5% budget. The viewport is built from React Native primitives plus CSS transforms on web. |
| FV-9 | Native parity. | On iOS and Android the SVG renderer takes `width = containerWidth` and `viewBox = "0 0 pageW pageH"`, so react-native-svg scales it natively. Pinch zoom uses `react-native-gesture-handler` only if it is already installed. Otherwise use `ScrollView` `maximumZoomScale` (iOS) and zoom buttons (Android). |

---

## 4. Design

### 4.1 Component

```text
components/svgFacsimile/FolioViewport.tsx      (Tier 0: it is on the reader path)
  props: { pageWidth, pageHeight, children, onScaleChange?, initialMode?: "fit" | "actual" }
  state: { mode: "fit" | "actual" | "custom", scale: number, containerWidth: number }
  computeFitScale(containerWidth, pageWidth, padding) = clamp((containerWidth - 2*padding) / pageWidth, 0.25, 1)
```

- `pageWidth` and `pageHeight` come from `layoutForFolio()`. They include both margins and the gutter, so marginalia fall inside the page box by construction.
- **Web** (`SvgFacsimilePage.web.tsx`): wrap the existing page `Div` in an inner element with `transform: scale(s)` and `transform-origin: 0 0`. Its outer element has the explicit size `pageWidth*s × pageHeight*s` and `overflow: visible`. The viewport element around it has `overflow: auto`. Remove the `overflow-x: hidden` ancestor, and add a regression assertion for it (§7).
- **Native** (`SvgFacsimilePage.tsx`): render `<Svg width={pageWidth*s} height={pageHeight*s} viewBox={…}>` inside a two-axis `ScrollView`.
- The toolbar zoom controls live in the folio toolbar row (see [SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §4.1). They use the shared `ActionButton` primitive ([SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md)).

### 4.2 Text crispness

CSS-scaled HTML text stays vector on web, so it is not blurry. Do not use `zoom:`, which Firefox handles inconsistently. On native, SVG text scales with the viewBox.

### 4.3 Reading view hand-off (FV-5)

The **Reading flow** toggle already exists ([SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) renames it to "Reading view (reflowed)"). The bar only flips that setting. It adds no new rendering path.

### 4.4 Highlight hook (shared with SPEC-VALIDATION)

`ScrollAnchorProvider` gains `highlight(anchor: { folioId, line }, ms = 2000)`. The renderer applies a highlight background (token `--highlight`) to that line's row, using a non-color cue too: a 2 px outline. FolioViewport supplies the scale for the offset math.

---

## 5. Edge cases

| Case | Behavior |
|------|----------|
| Container resizes (rotation, split view, side panel) | Recompute the fit scale in `onLayout`. In `custom` mode keep the scale, but clamp the scroll position. |
| Two-column folios (`CB2.`) and drop caps that span columns | No special case. Scaling is uniform. |
| Folio taller than 10,000 px at 3× | Allowed. The viewport scrolls. |
| Print and export | Not affected. Exports render at native size. |
| Synoptic pane on (side-by-side modern text) | Each pane gets its own FolioViewport width. The fit computation uses the pane width, not the window width. |

---

## 6. Telemetry (local only, dev builds)

`__DEV__` logs of fit-scale computations and the time to first paint after a resize, used to check that the scale change does not re-run layout (it must not call `layoutForFolio()` again).

---

## 7. Tests

| Test | Type | Gate |
|------|------|------|
| `computeFitScale` table (widths × page widths) | Jest unit | Exact values |
| Every printable block inside the viewport at 8 widths, for Pedro Nunes fol. 3r, one OSTA two-column folio, and one with a left gloss | Playwright (web) | Zero out-of-bounds boxes |
| No ancestor of the folio has `overflow-x: hidden` | Playwright DOM assertion | Pass |
| Jump-to-line at scales 0.5 / 1 / 2 | Playwright | Target row's top within 0–33% of the viewport height |
| Pinch / zoom buttons change scale and keep the focal point | Detox or manual on native | Release checklist |
| Visual snapshot at 375, 705, 1440 | Playwright screenshot diff | Reviewed on change |

---

## 8. Rollout

| Phase | Scope | Exit |
|-------|-------|------|
| FV-P1 | Web: FolioViewport with Fit width, remove the overflow clip, FV-1/2/4/6 | Playwright bounds test passes at all widths |
| FV-P2 | Zoom controls and shortcuts, FV-3/5/7 | Manual check on tablet and phone sizes |
| FV-P3 | Native parity, FV-9 | Release checklist on iOS and Android reference devices |

## 9. Open questions

1. Should Fit width ignore margins when the witness has no marginalia, to gain about 10% text size on phones? Recommended: no in P1. Consistent framing matters more than size.
2. On phones, should the default be the reading view instead of a scaled page? Decide after testing with 3–5 users on phones.
