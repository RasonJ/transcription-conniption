# MUFI fonts

Primary face: **[Andron Scriptor](https://mufi.info/q.php?p=mufi/fonts/fonts/53)** (MUFI font id **53**), Andreas Stötzner — the glyph set used in the MUFI character recommendation charts.

| File | Role |
| --- | --- |
| `mufi-font-registry.json` | Registry of preferred MUFI fonts (Andron first, Junicode fallback) |
| `Junicode-Regular.ttf` / `Junicode-Italic.ttf` | Vendored OFL faces (Peter Baker) — loaded in `app/_layout.tsx` |
| `AndronScriptorWeb.ttf` / `.otf` / `.woff2` | Optional local install (not committed — download from MUFI font 53) |

## Install Andron Scriptor locally

1. Open the MUFI font page: [Andron Scriptor family](https://mufi.info/q.php?p=mufi/fonts/fontfamily/1) or [font 53](https://mufi.info/q.php?p=mufi/fonts/fonts/53).
2. Download **Andron Scriptor v. 4.2.3** (free for scholarly use).
3. Place the unmodified font file in this directory as `AndronScriptorWeb.ttf` (or `.otf` / `.woff2`).
4. Restart Expo / rebuild web so `expo-font` can load it when present.

## Attribution (required by license)

Credit **Andreas Stötzner** and the **Medieval Unicode Font Initiative** in colophons / about text when the font is used. Do not alter glyph shapes or redistribute modified copies.

Registry is consumed by `utils/mufiFonts.ts` and the ornate-initial font stacks.
