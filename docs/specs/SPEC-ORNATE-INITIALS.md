# Spec: Authentic Decorated Initials

**Status:** Approved (scene graph + RMK tradition) · **Owner:** Lead Engineer · **Last updated:** 2026-10-20
**Related:** [USABILITY-REMEDIATION.md](USABILITY-REMEDIATION.md) · [SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md) · [SPEC-VALIDATION.md](SPEC-VALIDATION.md) §4.2 (mnemonic registry) · [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) A11Y-8 · [SPEC-LIGHTWEIGHT.md](SPEC-LIGHTWEIGHT.md) · [../HSMS-TYPOGRAPHY.md](../HSMS-TYPOGRAPHY.md) §6 · [../HSMS-LAYOUT.md](../HSMS-LAYOUT.md) §2.3
**Authority:** HSMS manual §3.232 (Initials), §3.233 (Illumination), §3.234 (Miniature)

---

## 1. Goal

A drop initial in the page view should look like it belongs to the witness. A 1537 Lisbon printed book gets a woodcut initial. A fifteenth-century Castilian manuscript gets a red or blue Lombard with penwork, or burnished gold when the transcription says it is illuminated. The letter is a period letterform, not a modern font, and the decoration follows what the HSMS markup records (`{INn.}`, `{IN n. {ILL.}}`, `{IN n. {MIN.}}`, supplied letters, blanks). The result is the same on native, on web and in every export, and it is reproducible for the same witness.

### Non-goals

- Reproducing a specific manuscript's real initial. Facsimile accuracy comes from an uploaded scan or IIIF crop (the existing `uploadedUri` path; SPEC-PDF-INGEST §6.3). The generated initial is a *plausible type*, and the UI must never suggest it is a picture of the original.
- Figurative scenes. Historiated initials (`{MIN.}` inside `{IN.}`) never get invented figures (§5.5).
- Raster textures or photographic materials. Output stays vector and light.

---

## 2. Findings (code at `41b6637d`, observed 2026-10-20)

| # | Finding | Where |
|---|---------|-------|
| I1 | **Three renderers, three answers.** Native uses `renderOrnateInitialSvg()` (4 styles: vines, criblé, ribbon, damask, random positions from `seededRng`). Web and SVG export use `buildOrnateInitialGeometry()` (6 matrices: romanesque, gothic_textura, lombardic, renaissance_foliated, pen_flourish, diaper_ground). Legacy HTML export uses a plain bordered `<span>` (`renderDropInitial()` in `utils/htmlExport.ts`). The same `{IN4.} S` looks different on phone, web and in each export. | `renderOrnateInitial.tsx`, `dropInitialLetterform.ts`, `HtmlOrnateDropCap.tsx`, `svgDocumentExport.ts`, `htmlExport.ts` |
| I2 | **Style is random per letter, not per witness.** `pickLetterform(folioId|letter|blockIndex)` picks a matrix and theme per initial, so one page of a single book can mix Romanesque arches, Gothic tracery and Renaissance egg-and-dart. Real books keep one decorative system with a hierarchy. | `pickLetterform()`, `MATRIX_THEME_POOLS` |
| I3 | **The markup is ignored.** `{ILL.}` and `{MIN.}` inside `{IN.}` (manual §3.232a, f), editorial supply `[E]`, and blank spaces left for an initial (§3.232e(2)) don't change the rendering. Depth `n` changes only size. | `buildOrnateInitialGeometry()` reads only letter, size and seed |
| I4 | **The letter is typed in a modern face.** It is SVG `<text>` in a font stack. Andron Scriptor (MUFI 53) is the intended face, but it is not in the repo (license; `assets/mufi/fonts/README.md`), so letters fall back to Junicode or to system faces. Some stacks include `'Courier New'`, `Impact` and `Arial Black` (`MATRIX_FONTS.gothic_textura`). The bold, synthesized weight (`fontWeight: 900`) distorts the forms. | `MATRIX_FONTS`, `matrixGeometry()` |
| I5 | **Digital, not medieval, treatment.** Rounded corners (`rx` up to 8), drop shadows (`rgba(26,10,5,0.18)`), a blurred-looking letter underlay, and ornament at 10–60% opacity. Medieval pigment and ink are opaque, boxes are square, and nothing casts a shadow. | `shadow`, `outerRadius`, `opacity` values |
| I6 | **Gold is flat yellow.** `#d4af37` at partial opacity reads as mustard. Burnished gold leaf reads through a dark contour, a two-tone body and small highlights. | `GOLD_LEAF` |
| I7 | **The palette is invented.** Themes named "Pompeian red", "Byzantine teal", "Tuscan ochre", "Minstrel damask" don't correspond to Iberian practice. The real pigment set is small: vermilion, red lead, azurite or ultramarine, lead white, verdigris, gold, iron-gall ink. | `ILLUMINATED_THEMES` |
| I8 | **Penwork is trapped in the box.** Pen-flourished initials sprawl into the margin as long vertical tails, and that is their defining feature. Here all ornament is clipped to an inner panel. | `innerPanel()` 8% pad, `matrixOrnaments()` |
| I9 | **Box geometry ignores the letter.** Width is a fixed `0.52 × height` (`DROP_CAP_WIDTH_RATIO`), so I, M and W get the same box. Manual §3.232a counts box lines *excluding* ascenders and descenders, and §3.232b puts I and J in the margin. Neither is modeled. | `dropCapBoxWidth()` |
| I10 | **Font size rules disagree.** `dropCapFontSize()` = `clamp(12n, 24, 60)`, the HTML export uses `max(15n, 32)`, and native uses `min(capFS, 0.74 × capH)`. | `utils/dropInitial.ts`, `htmlExport.ts`, `renderOrnateInitial.tsx` |
| I11 | **The static override set is a placeholder.** `assets/mufi/ornate-initials/A/historiated_vines.svg` is a red square with a Georgia "A". The generated inventory still lists the 4 native styles. | `utils/generated/ornateInitialInventory.ts` |

---

## 3. Model: what decides how an initial looks

An initial's appearance is a function of five inputs. Only the last two are random, and even those are fixed per witness.

```text
InitialSpec = f(
  grade,        // from depth n and inner mnemonics           (§3.1)
  tradition,    // from witness medium + date (+ override)    (§3.2)
  sequence,     // ordinal of this initial in the witness     (§3.3)
  letter,       // the capital, incl. editorial supply state  (§3.4)
  seed          // witnessHash + sequence → motif choices only
)
```

### 3.1 Grade (from the markup)

| Markup | Grade | Treatment |
|--------|-------|-----------|
| `{IN1.}`–`{IN2.}` | **Minor** | Plain coloured letter (red or blue), at most a few pen strokes |
| `{IN3.}`–`{IN5.}` | **Major** | Pen-flourished: coloured letter, contrasting penwork in the counters, tails in the margin |
| `{IN6.}`+ | **Principal** | Pen-flourished with split (two-colour) letter and long tails; or illuminated when the tradition allows |
| `{IN n. {ILL.}}` | **Illuminated** | Gold and painted (§5.3), whatever the depth |
| `{IN n. {MIN.}}` | **Historiated** | Illuminated frame with a reserved interior for a picture (§5.5) |
| `{IN n. {BLNK.}}`, or a space left with no letter | **Unexecuted** | Empty box with a guide letter (§5.6) |
| `[X]` editorial supply inside `{IN.}` (§3.232e) | **Supplied** | Letter in the editorial colour, no decoration (§5.6) |

The depth thresholds are defaults, overridable per workspace (§7), because some books use deep penwork Lombards throughout.

### 3.2 Tradition (from the witness)

One tradition per witness. It is chosen in this order: workspace override → library catalog `medium` + `year` ([SPEC-LIBRARY.md](SPEC-LIBRARY.md) LIB-1) → `{RMK:}` identification heuristic (§3.2.1) → default.

| Tradition id | Witness | Period cue | Defining features |
|--------------|---------|-----------|-------------------|
| `ms.penwork` | Manuscript | 13th–15th c. (default for manuscripts) | Red/blue Lombards; filigree penwork in the other colour; marginal tails |
| `ms.illuminated` | Manuscript | Any; used for `{ILL.}` / `{MIN.}` grades | Gold leaf, painted letter with white highlights, ivy or acanthus sprays |
| `ms.romanesque` | Manuscript | ≤ c. 1200 | Interlace and foliate scroll inside the letter; no gold ground (phase OI-P5) |
| `ms.humanist` | Manuscript | Late 15th c., humanist hands | White-vine (*bianchi girari*) on coloured ground, Roman capital (phase OI-P5) |
| `print.woodcut` | Printed | 1500–1600 (default for prints) | Black ink; white Roman capital on black ground with foliage, or black letter on criblé; square block with a ruled border |
| `print.incunable` | Printed | ≤ 1500 | Gothic or Lombardic capital; criblé (dotted) ground or open outline for hand colouring; sometimes red-printed |

#### 3.2.1 Medium heuristic (when no metadata says)

- Treat the witness as a **print** when the third identification line (manual §0.1: place | printer | date) has three fields and the date is ≥ 1450, or when any `{SG.}` (signature, a print feature per §4.4–4.5) appears.
- Otherwise treat it as a **manuscript**.
- Show the result on the witness card as "Initials: printed (woodcut) ▾" so the user can correct it with one tap. The Pedro Nunes sample resolves to `print.woodcut` (Lisboa | Germão Galharde | 1537).

### 3.3 Sequence and alternation

`sequence` is the 0-based index of the initial within the witness, in reading order. In penwork traditions, letter and penwork colours **alternate**: red letter with blue penwork, then blue letter with red penwork. Two initials on the same opening never share all colours. Alternation counts only initials of the same grade.

### 3.4 Letter

The letter is the single grapheme from `parseDropInitialPrefix()` (`utils/dropInitial.ts`), uppercased. Supplied letters (`[L]`) and corrected letters (`(l)[L]`, §3.232e(3)) render the **editor's** letter in the Supplied style, never decorated as if the scribe had painted it.

---

## 4. Letterforms

### 4.1 Sources, in order of preference

| # | Source | Used for | Licence notes |
|---|--------|----------|---------------|
| 1 | **MUFI fonts already on hand** (Andron Scriptor family and any other MUFI-recommended faces the project holds) | Every tradition whose model is a book-hand or type capital: `ms.romanesque`, `print.incunable` Gothic capitals, fallback for all | Render glyphs as text **unmodified**. Andron's licence forbids altering glyphs or redistributing modified copies, so do not convert its outlines to paths or re-draw over them. Credit Andreas Stötzner and MUFI on the About page when used. |
| 2 | **Junicode** (OFL, bundled) | Fallback text face; the Roman capitals for `print.woodcut` and `ms.humanist` when no better face is present | OFL allows embedding and subsetting. Check whether the font declares Reserved Font Names before shipping any modified or derived outlines. |
| 3 | **Project-drawn versal set** (new, §4.2) | Lombardic capitals for `ms.penwork` / `ms.illuminated`, and woodcut Roman capitals. These need the letter's real structure (bowls, stems, hairline spurs) as paths, so penwork can attach to them | Original drawings by the project, referenced from public-domain period sources. Never traced from a modern font. Owned by the project. |

**Action OI-0 (first task):** inventory the MUFI fonts the project actually has (family, version, file, licence, which capitals and stylistic sets they contain), record them in `assets/mufi/fonts/mufi-font-registry.json`, and decide per tradition which source supplies the letter. If a MUFI face already has suitable Lombardic or versal capitals (for example in its Private Use Area or stylistic sets), prefer it over drawing new ones for those traditions.

**Remove** every system-font fallback from initial stacks (`Courier New`, `Impact`, `Arial Black`, `Times New Roman`, `Didot`, `Bodoni`, `Baskerville`, `Bookman`), and never synthesize weight (`fontWeight: 900` on a face without a heavy cut). If no period face is available, render the drawn set (§4.2). If that is missing too, use Junicode Regular.

### 4.2 Drawn versal set

- **Alphabets (phase order):** Lombardic versals A–Z plus Ç, then woodcut Roman capitals A–Z, then Gothic textura capitals A–Z. Include I/J and U/V as separate forms.
- **Format:** one SVG per glyph on a 1000-unit em, with metadata: advance width, cap height, overshoot, and **anchor points** for decoration: counter centres (`counter.0`, `counter.1`), stem tops and feet, bowl extremes, terminal points. Penwork and highlights attach to anchors, not to fixed box fractions.
- **Build:** `scripts/build-initial-glyphs.mjs` compiles the SVGs into `utils/generated/initialGlyphs.ts` (paths + metrics + anchors). Lazy Tier 1 module, loaded with the facsimile chunk. Budget ≤ 35 KB gzip per alphabet.
- **Review:** a paleographer signs off each alphabet against period exemplars before it ships (§9).

---

## 5. Treatments

All treatments share these material rules:

- **Opaque.** Pigment and ink at opacity 1. No partial-opacity ornament except a deliberate wash (§5.3), and never below 0.85.
- **Square.** No `rx` on boxes or frames. No drop shadows and no letter underlay.
- **Hand irregularity, deterministic.** Stroke paths get a seeded perturbation of ±0.2–0.4 % of the box size on control points, so penwork isn't geometrically perfect. Woodcut borders get slight ink spread. The same seed gives the same result.
- **Pigment palette** (§6) only. No new colours per initial.

### 5.1 Minor (plain Lombard)

The letter is filled in vermilion or azurite (by alternation), directly on the parchment, with no box. A Major-style penwork accent (a short hairline tail or 2–3 pearls) is optional, decided by seed.

### 5.2 Pen-flourished (Major, Principal) — `ms.penwork`

- **Letter:** filled in the alternation colour. At Principal grade, split vertically or along the main stem into red and blue, with a thin reserved (parchment-coloured) gap between the halves.
- **Infill:** counters filled with penwork in the contrast colour, as fine hairlines: concentric eyelets, spirals with pearls, or a fishbone fill. Motif chosen by seed from the tradition's set.
- **Surround:** a hairline contour following the letter's outline at 1–2 units distance, with sprigs.
- **Tails:** vertical penwork running up and down the margin from the letter's left edge, `1.0–2.5 ×` the box height in total, ending in a spiral or a pearl cluster. Tails extend into the left margin (or the intercolumn for a right-hand column) and must not cross body text (§8).
- **Stroke weights** at 100% zoom: penwork 0.35–0.7 px, contour 0.5 px. They scale with FolioViewport.

### 5.3 Illuminated — `ms.illuminated`

- **Ground:** a square of burnished gold with a thin black contour. Gold body is a two-stop linear fill (light `gold.leaf.hi` to `gold.leaf.lo`, diagonal), with 2–4 small lead-white specular dots, all deterministic.
- **Letter:** azurite or rose (brazilwood lake) with **white highlights**: lead-white hairlines along the inner edge of each stroke, plus 3-dot clusters. Alternatively a gold letter on a blue/rose ground with white filigree; the seed picks per witness, not per initial.
- **Counter:** filled with the opposite colour from the ground, with ivy-leaf or trefoil sprays in gold.
- **Extension:** at Principal grade, a gold-and-colour bar runs from the box along the margin with ivy-leaf sprays (black-outlined gold leaves on hairline stems). It obeys the same no-overlap rule as tails.
- **Optional wash:** a 0.85-opacity wash may be used for the letter's shading only.

### 5.4 Woodcut — `print.woodcut`, `print.incunable`

- **Block:** a square with a single or double black rule border, slightly irregular (§5 rules).
- **Woodcut (default):** black ground with a white Roman capital and white foliate scrolls or arabesques cut around it. Variant: black capital on a criblé ground (a grid of small white dots on black), chosen per witness.
- **Incunable:** Gothic or Lombardic capital in black on criblé, or an open-outline capital (black contour, parchment fill) left for hand colouring. A witness-level option "hand-coloured" fills the outline with a translucent red or yellow wash, as rubricators did.
- **Ink:** `ink.carbon` only, or `ink.red` for red-printed initials when the transcription wraps the initial in `{RUB.}`.

### 5.5 Historiated — `{IN n. {MIN.}}`

Render the Illuminated treatment, but reserve the letter's main counter (or the whole box interior for letters without a counter) as a **picture panel**:

- If the workspace has an image for this initial (`uploadedUri`, IIIF crop), clip it to the panel.
- Otherwise fill the panel with the counter colour and a plain diaper pattern, and show a small "Add image" affordance in edit mode only (tap target per [SPEC-ACCESSIBILITY.md](SPEC-ACCESSIBILITY.md) A11Y-12). Never draw figures.
- If the `{MIN.}` carries text (§3.234c), show it in the panel's tooltip, not in the picture.

### 5.6 Unexecuted and Supplied

| State | Rendering |
|-------|-----------|
| **Unexecuted** (blank space; `{BLNK.}` inside `{IN.}`) | The box outline as a faint dotted rule in `ink.irongall` at 0.4 opacity (the one exception to §5's opacity rule, because it marks an absence), and a small guide letter (*lettre d'attente*) at top left in iron-gall ink, 20% of the box height, if a letter is known |
| **Supplied** (`[E]`, `(l)[L]`) | The letter in `EDITORIAL_FILL` (existing token colour for editorial insertions), in Junicode at box size, no decoration, with the brackets shown when the "Editorial marks" display setting is on |

### 5.7 Uploaded scan

Unchanged behaviour (`uploadedUri`), with I5's shadows and rounded corners removed. A scan always wins over generated decoration.

---

## 6. Palette

Define these in `components/svgFacsimile/initialPalette.ts` as named tokens. They replace `ILLUMINATED_THEMES`. The starting values are approximations, to be calibrated against reference photographs during the paleographer review (§9).

| Token | Material | Start value |
|-------|----------|-------------|
| `pig.vermilion` | Vermilion (mercuric sulfide) | `#c23b22` |
| `pig.redlead` | Red lead (minium) | `#d2602b` |
| `pig.azurite` | Azurite | `#2e5c9a` |
| `pig.ultramarine` | Ultramarine (principal grades only) | `#24408e` |
| `pig.rose` | Brazilwood lake | `#a8445f` |
| `pig.verdigris` | Verdigris | `#2f7a64` |
| `pig.leadwhite` | Lead white (highlights) | `#f3ede0` |
| `gold.leaf.hi` / `gold.leaf.lo` | Burnished gold leaf | `#e2c06a` / `#9a7424` |
| `gold.shell` | Shell gold (penwork accents in illuminated work) | `#b8933c` |
| `ink.irongall` | Iron-gall ink | `#3a2a1d` |
| `ink.carbon` | Printer's black | `#1c1916` |
| `ink.red` | Red printing ink | `#b2341f` |
| `contour` | Black outline around gold and painted forms | `#1a1410` |

**Dark mode:** the parchment page keeps its own light palette in both themes (the page is a depiction of a physical object). Don't invert initials.

---

## 7. Settings

| Setting | Where | Values (default first) |
|---------|-------|------------------------|
| **Initials** | Display ▾ → Text group ([SPEC-STUDIO-IA.md](SPEC-STUDIO-IA.md) §4.1) | Decorated · Plain (letter in red only) · Images only (uploaded scans; otherwise plain) |
| **Decoration style** | Witness card, "Initials: … ▾" | Automatic (from witness) · Manuscript — penwork · Manuscript — illuminated · Printed — woodcut · Printed — incunable |
| **Grade thresholds** | Witness settings (advanced) | Minor ≤ 2, Major 3–5, Principal ≥ 6 |
| **Hand-coloured woodcuts** | Witness settings (prints only) | Off · On |

Settings live in the workspace record and are included in `.hsms` bundles. The seed is `witnessHash` + `sequence`, so two researchers opening the same witness see the same initials.

---

## 8. Layout

| ID | Requirement | Acceptance |
|----|-------------|------------|
| OI-L1 | Box width comes from the letter's advance width (glyph metrics, §4.2) plus treatment padding, not `0.52 × height`. Keep `dropCapBoxWidth()` as the fallback for text-face letters. | I, M and W get visibly different widths; body indent follows the actual width |
| OI-L2 | The box spans `n` body lines (manual §3.232a). Ascenders may rise up to `0.6 × LH` above the box, and descenders (Q, J) may drop up to `0.6 × LH` below, into the inter-block gap, without moving body lines. | Golden layout test for Q, J, I at depths 2 and 5 |
| OI-L3 | **I and J** in the margin (§3.232b): when the letter is I or J and the tradition is penwork or illuminated, place it in the left margin running the full depth, with no body indent. | Matches manual example 7/98 layout |
| OI-L4 | Marginal decoration (tails, bars, sprays) may occupy the left margin and, for right-hand columns, up to half the intercolumn gutter. It is clipped to the page edge and must not intersect any text line box. | Automated bbox test across golden folios: zero intersections with line rects or gloss blocks |
| OI-L5 | One font-size rule for the letter everywhere: derived from box height and glyph cap height. `dropCapFontSize()` and the HTML export's `max(15n, 32)` are replaced by it. | Native, web, SVG export and HTML export render the same letter size (± 1 px) |
| OI-L6 | Works with FolioViewport scaling ([SPEC-FOLIO-VIEWPORT.md](SPEC-FOLIO-VIEWPORT.md)): all sizes are in page units, never device pixels. | Snapshot at scale 0.5 / 1 / 2 identical after normalization |

---

## 9. Architecture

### 9.1 One scene builder, four adapters

**Shipped:** `utils/initials/scene.ts` (`buildInitialScene`, `serializeInitialScene`, `PIGMENT_PALETTE`), `utils/initials/tradition.ts` (`deriveTraditionFromRmk`), `utils/initials/spec.ts` (`gradeFromDepth`). Native `renderOrnateInitialSvg`, web `HtmlOrnateDropCap`, SVG document export, and legacy HTML export all draw that scene. Studio sets `InitialTraditionContext` from the open transcription's `{RMK:}` imprint (Cromberger 1525 and Galharde 1537 → `print.woodcut`; year ≤ 1500 → `print.incunable`; MSS shelfmark or no printer date → `ms.penwork`).

### 9.1a Adapter map (target)

```text
utils/initials/                         (Tier 1, lazy with the facsimile)
  spec.ts           resolveInitialSpec(token, witnessCtx, sequence) → InitialSpec   (§3)
  tradition.ts      tradition resolution + medium heuristic                         (§3.2)
  palette.ts        tokens                                                          (§6)
  glyphs.ts         letter source selection; loads utils/generated/initialGlyphs    (§4)
  treatments/       minor.ts penwork.ts illuminated.ts woodcut.ts historiated.ts unexecuted.ts supplied.ts
  scene.ts          buildInitialScene(spec, box) → InitialScene
  layout.ts         box metrics, margin allowance, overlap check                     (§8)

InitialScene = {
  box: Rect; overflow: Rect;              // box + marginal extent
  items: Array<
    | { kind: "path"; d: string; fill?: Token; stroke?: Token; width?: number; opacity?: number }
    | { kind: "glyph"; source: "drawn"; d: string; fill: Token }      // outline from §4.2
    | { kind: "text"; text: string; fontFamily: string; size: number; fill: Token }  // MUFI / Junicode
    | { kind: "image"; href: string; clip?: string }
    | { kind: "gradient"; id: string; stops: [Token, Token]; angle: number }
  >;
  a11yText: string;                       // the letter, once (A11Y-8)
}
```

| Adapter | Replaces |
|---------|----------|
| Native: `components/svgFacsimile/InitialSvg.tsx` (react-native-svg) | `renderOrnateInitialSvg()` |
| Web: `HtmlOrnateDropCap` renders the scene as inline SVG | its call to `buildOrnateInitialGeometry()` |
| SVG export: `serializeInitialScene()` | `serializeOrnateInitial()` |
| HTML export: inline `<svg>` from the same serializer | the bordered `<span>` in `renderDropInitial()` |

Delete `renderOrnateInitial.tsx`'s generator and the `matrixOrnaments()` / `pickLetterform()` code once the adapters ship. Regenerate `ornateInitialInventory.ts` from the new tradition list, or drop it if nothing reads it.

### 9.2 Text glyphs in exports

When the letter comes from a font (MUFI or Junicode), the SVG and HTML exports reference the font family and carry the attribution comment. They do **not** embed converted outlines of Andron Scriptor (licence, §4.1). Whether Junicode outlines or a font subset may be embedded is a licence check in OI-0. Until it is resolved, exports fall back to the drawn set when one exists for that letter.

### 9.3 Performance

- At most 150 drawable items per initial; Principal penwork is the worst case.
- Scene build ≤ 2 ms per initial on the reference device. Scenes are cached by `(spec hash, box size)`.
- Glyph pack ≤ 35 KB gzip per alphabet, loaded lazily. Until it loads, render the Minor treatment with the text face, then swap without layout shift (box width reserved from metrics shipped in the Tier 0 layout table, ≤ 2 KB).

---

## 10. Tests and review

| Test | Gate |
|------|------|
| Snapshot `InitialScene` JSON for letters A, E, I, O, Q, S × each tradition × each grade | Reviewed on change |
| Determinism: same witness hash + sequence → byte-identical scene; different witnesses differ | Pass |
| Renderer parity: native, web and SVG export produce the same scene for the same input (compare the scene, not pixels) | Pass |
| Markup mapping: `{IN6. {ILL.}}`, `{IN10. {MIN.}}`, `{IN3.} (l)[L]`, `{RUB. {IN1.} [E]…}` pick Illuminated, Historiated, Supplied, Supplied | Pass |
| Alternation: consecutive Major initials alternate letter colour | Pass |
| No system fonts or synthesized weights in any initial font stack (grep test) | Pass |
| No `rx`, no shadow, no opacity < 0.85 in scenes except the Unexecuted outline | Pass |
| Overlap test (OI-L4) on golden folios: Pedro Nunes, one two-column OSTA witness, one witness with left glosses | Zero intersections |
| Performance budget (§9.3) on the reference device | Recorded |
| **Paleographer review:** for each tradition, a sheet of 26 letters × grades is compared with period exemplars from openly licensed collections; the reviewer signs off or files corrections | Required before each tradition ships |

---

## 11. Rollout

| Phase | Scope | Exit |
|-------|-------|------|
| **OI-0** | MUFI font inventory and licence check (§4.1); choose the letter source per tradition | Registry updated; decision recorded in this spec |
| **OI-P1** | One scene builder + 4 adapters; remove shadows, rounded corners, system fonts; palette tokens; grade mapping from markup; Supplied and Unexecuted states; layout rule OI-L5 | Renderer parity test green; I1, I3–I7, I10 closed |
| **OI-P2** | `ms.penwork`: Lombardic drawn set (or MUFI capitals if OI-0 finds them), penwork infill, marginal tails with overlap check, alternation; OI-L1–L4 | Paleographer sign-off for penwork |
| **OI-P3** | `print.woodcut` and `print.incunable` + medium heuristic; Pedro Nunes renders as a woodcut | Sign-off for print traditions |
| **OI-P4** | `ms.illuminated` (gold, white highlights, ivy sprays) and Historiated panel | Sign-off for illuminated |
| **OI-P5** | `ms.romanesque`, `ms.humanist`; settings polish; inventory regeneration | Sign-off |

## 12. Open questions

1. Which MUFI fonts does the project hold, and do any include decorative or Lombardic capitals (PUA or stylistic sets) that would replace the drawn set for some traditions? (OI-0)
2. Can exported SVG/HTML embed a Junicode subset, or must exports reference the font by name? (licence check, OI-0)
3. Should the tradition be inferable per *section* (a manuscript with a later illuminated opening), or is one per witness enough for v1? Recommended: one per witness, with the `{ILL.}` grade covering exceptions.
4. Who draws the versal set: a contracted type designer, or the project with paleographer review? It affects OI-P2 timing.
