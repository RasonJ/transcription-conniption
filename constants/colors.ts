import { scriptoriumTheme } from "./scriptoriumTheme";

/** App tint colors. The sienna/gold palette in `scriptoriumTheme` is the source of truth. */
const colors = {
  light: {
    text: scriptoriumTheme.inkDark,
    background: scriptoriumTheme.parchment,
    tint: scriptoriumTheme.gold,
    tabIconDefault: "rgba(255, 244, 210, 0.55)",
    tabIconSelected: scriptoriumTheme.gold,
  },
  dark: {
    text: scriptoriumTheme.textCream,
    background: scriptoriumTheme.inkDark,
    tint: scriptoriumTheme.gold,
    tabIconDefault: "rgba(255, 244, 210, 0.55)",
    tabIconSelected: scriptoriumTheme.gold,
  },
} as const;

export default colors;
