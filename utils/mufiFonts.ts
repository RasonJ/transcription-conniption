/**
 * MUFI font registry — prefers Andron Scriptor (MUFI font id 53).
 * Source of truth for metadata: assets/mufi/fonts/mufi-font-registry.json
 * @see https://mufi.info/q.php?p=mufi/fonts/fonts/53
 */
import { Platform } from "react-native";
import { mufiSerifStack } from "@/utils/mufiFontStack";

export { mufiSerifStack } from "@/utils/mufiFontStack";

export type MufiFontRecord = {
  mufiFontId: number | null;
  mufiUrl?: string;
  family: string;
  cssFamily: string;
  aliases: string[];
  designer: string;
  version?: string;
  mufiRecommendation?: string;
  license: string;
  attribution?: string;
  downloadPage: string;
  localFiles?: string[];
  role: string;
  notes?: string;
};

/** Andron Scriptor — MUFI font record 53 (recommendation chart face). */
export const ANDRON_SCRIPTOR: MufiFontRecord = {
  mufiFontId: 53,
  mufiUrl: "https://mufi.info/q.php?p=mufi/fonts/fonts/53",
  family: "Andron Scriptor",
  cssFamily: "Andron Scriptor Web",
  aliases: ["Andron Scriptor", "AndronScriptorWeb", "Andron Scriptor Web"],
  designer: "Andreas Stötzner",
  version: "4.2.3",
  mufiRecommendation: "4.1",
  license:
    "Free for scholarly editing; credit Andreas Stötzner and MUFI in colophons; do not alter glyphs or redistribute modified copies.",
  attribution:
    "Andron Scriptor by Andreas Stötzner; issued via the Medieval Unicode Font Initiative (NFR / University of Bergen).",
  downloadPage: "https://mufi.info/q.php?p=mufi/fonts/fontfamily/1",
  localFiles: [
    "assets/mufi/fonts/AndronScriptorWeb.ttf",
    "assets/mufi/fonts/AndronScriptorWeb.otf",
    "assets/mufi/fonts/AndronScriptorWeb.woff2",
  ],
  role: "primary-mufi",
  notes:
    "Canonical glyph source for the MUFI v4 recommendation charts; preferred face for ornate initials and MUFI Unicode display.",
};

export const JUNICODE_FALLBACK: MufiFontRecord = {
  mufiFontId: null,
  family: "Junicode",
  cssFamily: "Junicode",
  aliases: ["Junicode Two", "Junicode VF"],
  designer: "Peter S. Baker",
  license: "SIL Open Font License 1.1",
  downloadPage: "https://github.com/psb1558/Junicode-font/releases",
  localFiles: [
    "assets/mufi/fonts/Junicode-Regular.ttf",
    "assets/mufi/fonts/Junicode-Italic.ttf",
  ],
  role: "fallback-mufi",
  notes: "OFL MUFI-tracking face bundled for Expo; used when Andron Scriptor is not installed.",
};

export const MUFI_FONT_REGISTRY = {
  format: "mufi-font-registry/v1",
  preferredFontId: 53 as const,
  fonts: [ANDRON_SCRIPTOR, JUNICODE_FALLBACK],
};

/** Stacks used by ornate drop-cap style matrices (Andron-led). */
export const MUFI_ORNATE_FONT_STACKS = {
  historiated_vines: [
    mufiSerifStack(["Palatino Linotype", "Palatino", "Bookman Old Style"]),
    mufiSerifStack(["Palatino Linotype", "Palatino"]),
    mufiSerifStack(["Bookman Old Style", "Bookman"]),
    mufiSerifStack(["Baskerville"]),
  ],
  geometrical_crible: [
    mufiSerifStack(["Times New Roman"]),
    mufiSerifStack(["Impact", "Arial Black"]),
    mufiSerifStack([]),
    mufiSerifStack(["Trajan Pro", "Trajan"]),
  ],
  renaissance_ribbon: [
    mufiSerifStack(["Palatino Linotype", "Palatino"]),
    mufiSerifStack(["Garamond", "EB Garamond"]),
    mufiSerifStack([]),
    mufiSerifStack(["Baskerville"]),
  ],
  minstrel_damask: [
    mufiSerifStack([]),
    mufiSerifStack(["Garamond", "EB Garamond"]),
    mufiSerifStack(["Palatino Linotype", "Palatino"]),
    mufiSerifStack(["Book Antiqua", "Palatino"]),
  ],
} as const;

export function getPreferredMufiFont(): MufiFontRecord {
  return ANDRON_SCRIPTOR;
}

export function andronLocalCandidatePaths(): string[] {
  return ANDRON_SCRIPTOR.localFiles ?? [];
}

export function describeMufiFontAttribution(): string {
  return ANDRON_SCRIPTOR.attribution ?? ANDRON_SCRIPTOR.family;
}

export function mufiFontPlatformNote(): string {
  if (Platform.OS === "web") {
    return "Web: load AndronScriptorWeb.woff2/ttf via @font-face or expo-font when present under assets/mufi/fonts/.";
  }
  return "Native: install Andron Scriptor on the device or bundle AndronScriptorWeb.ttf under assets/mufi/fonts/.";
}
