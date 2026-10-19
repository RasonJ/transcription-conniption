/**
 * Emit MUFI 3-way map + ornate-initial SVG inventory.
 *
 *   assets/mufi/mufi-chars.json
 *   assets/legacy_hsms_settings.ini [RegexReplaces]
 *   assets/mufi/hsms-overlays.json
 *   assets/mufi/ornate-initials/{LETTER}/{style}.svg
 *     → utils/generated/mufiCharMap.ts
 *     → utils/generated/ornateInitialInventory.ts
 *
 *   npm run generate:mufi
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const MUFI_JSON = path.join(root, "assets", "mufi", "mufi-chars.json");
const SETTINGS_INI = path.join(root, "assets", "legacy_hsms_settings.ini");
const OVERLAYS = path.join(root, "assets", "mufi", "hsms-overlays.json");
const ORNATE_DIR = path.join(root, "assets", "mufi", "ornate-initials");
const OUT_MAP = path.join(root, "utils", "generated", "mufiCharMap.ts");
const OUT_ORNATE = path.join(root, "utils", "generated", "ornateInitialInventory.ts");

const PRIME_CHARS = ["'", "\u2018", "\u2019", "\u0060"];

export const ORNATE_STYLE_LABELS = [
  "historiated_vines",
  "geometrical_crible",
  "renaissance_ribbon",
  "minstrel_damask",
];

function decodeHtmlEntity(value) {
  const trimmed = value.trim();
  const named = { amp: "&", para: "¶", hellip: "…" };
  const namedMatch = trimmed.match(/^&([a-zA-Z]+);?$/);
  if (namedMatch && named[namedMatch[1]]) return named[namedMatch[1]];

  const dec = trimmed.match(/^&#(\d+);?$/);
  if (dec) return String.fromCodePoint(Number(dec[1]));

  const hex = trimmed.match(/^&#x([0-9a-fA-F]+);?$/);
  if (hex) return String.fromCodePoint(Number.parseInt(hex[1], 16));

  return trimmed;
}

function toHtmlEntity(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("&")) {
    return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
  }
  return null;
}

function codepointOfChar(ch) {
  if (!ch) return null;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function parseRegexReplaces(iniText) {
  const section = iniText.match(/\[RegexReplaces\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? "";
  const pairs = [];
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    pairs.push({
      pattern: trimmed.slice(0, eq).trim(),
      replacementRaw: trimmed.slice(eq + 1).trim(),
    });
  }
  return pairs;
}

function expandPatternToKeys(pattern) {
  if (pattern === "&[‘'’]?" || pattern.startsWith("&")) return [];
  if (pattern === "%") return [];

  const keys = new Set();

  if (/^[Cc]\[/.test(pattern) && pattern.endsWith("]")) {
    const letter = pattern[0];
    for (const p of PRIME_CHARS) keys.add(`${letter}${p}`);
    keys.add(`${letter}'`);
    return [...keys];
  }

  const accentMatch = pattern.match(/^([aeijouynAEIJOUYN])@\?(.+)$/);
  if (accentMatch) {
    const [, letter, markPart] = accentMatch;
    const marks = [];
    if (markPart === "`") marks.push("`");
    else if (markPart === "\\^" || markPart === "^") marks.push("^");
    else if (markPart === "~") marks.push("~");
    else if (markPart === "[‘'’]") {
      for (const p of PRIME_CHARS) marks.push(p);
    }

    for (const mark of marks) {
      keys.add(`${letter}${mark}`);
      keys.add(`${letter}@${mark}`);
    }
    return [...keys];
  }

  return [];
}

/**
 * Build codepoint → { html, hsms[] } from INI RegexReplaces.
 */
function buildHsmsBindingsFromIni(iniText) {
  const byCp = new Map();
  for (const { pattern, replacementRaw } of parseRegexReplaces(iniText)) {
    const html = toHtmlEntity(replacementRaw) ?? (replacementRaw.startsWith("&") ? replacementRaw : null);
    const unicode = decodeHtmlEntity(replacementRaw);
    if (!unicode || unicode.startsWith("&")) continue;
    const cp = codepointOfChar(unicode);
    if (!cp) continue;

    const keys = expandPatternToKeys(pattern);
    // Special-case & and % handled via overlays / explicit patterns
    if (pattern === "&[‘'’]?") {
      keys.push("&");
    }
    if (pattern === "%") {
      keys.push("%");
    }

    const cur = byCp.get(cp) ?? { html: null, hsms: new Set() };
    if (html) cur.html = html;
    for (const k of keys) cur.hsms.add(k);
    byCp.set(cp, cur);
  }
  return byCp;
}

function applyOverlays(byCp, overlays) {
  for (const row of overlays) {
    const cp = String(row.codepoint ?? "").toUpperCase().replace(/^U\+/, "U+");
    if (!cp.startsWith("U+")) continue;
    const cur = byCp.get(cp) ?? { html: null, hsms: new Set() };
    if (row.html) cur.html = row.html;
    for (const h of row.hsms ?? []) cur.hsms.add(h);
    byCp.set(cp, cur);
  }
}

function buildEntries(catalog, bindings) {
  const entries = [];
  const seen = new Set();

  for (const ch of catalog.chars ?? []) {
    const cp = ch.codepoint;
    seen.add(cp);
    const bind = bindings.get(cp);
    entries.push({
      ...(ch.mufiId ? { mufiId: ch.mufiId } : {}),
      codepoint: cp,
      unicode: ch.unicode ?? "",
      // Plan 1C: html/hsms only when we have an HSMS convention
      html: bind?.html ?? null,
      hsms: bind && bind.hsms.size ? [...bind.hsms].sort() : null,
      category: ch.category ?? "Other",
      baseLetter: ch.baseLetter ?? null,
    });
  }

  for (const [cp, bind] of bindings) {
    if (seen.has(cp)) continue;
    let unicode = "";
    try {
      unicode = String.fromCodePoint(Number.parseInt(cp.slice(2), 16));
    } catch {
      unicode = "";
    }
    entries.push({
      codepoint: cp,
      unicode,
      html: bind.html,
      hsms: [...bind.hsms].sort(),
      category: "HSMS overlay",
      baseLetter: null,
      note: "overlay-only (not in MUFI snapshot)",
    });
  }

  entries.sort(
    (a, b) =>
      Number.parseInt(a.codepoint.slice(2), 16) - Number.parseInt(b.codepoint.slice(2), 16),
  );
  return entries;
}

function listStaticSvg(letter, label) {
  const rel = path.join("assets", "mufi", "ornate-initials", letter, `${label}.svg`);
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? rel.replace(/\\/g, "/") : null;
}

function buildOrnateInventory(entries) {
  const letters = [];
  for (let i = 0; i < 26; i++) letters.push(String.fromCharCode(65 + i));
  // Iberian drop-cap extras that may appear after peel
  for (const extra of ["Ñ", "Ç"]) {
    if (!letters.includes(extra)) letters.push(extra);
  }

  const byCp = new Map(entries.map((e) => [e.codepoint, e]));
  return letters.map((letter) => {
    const cp = codepointOfChar(letter);
    const mufi = cp ? byCp.get(cp) : null;
    return {
      letter,
      unicode: letter,
      mufiCodepoint: mufi?.codepoint ?? cp,
      preferredFont: {
        mufiFontId: 53,
        family: "Andron Scriptor Web",
        mufiUrl: "https://mufi.info/q.php?p=mufi/fonts/fonts/53",
      },
      styles: ORNATE_STYLE_LABELS.map((label, style) => ({
        style,
        label,
        renderer: "procedural",
        staticSvgPath: listStaticSvg(letter, label),
      })),
    };
  });
}

function emitTs(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

function main() {
  if (!fs.existsSync(MUFI_JSON)) {
    console.error(`Missing ${MUFI_JSON}. Run: npm run fetch:mufi`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(MUFI_JSON, "utf8"));
  const bindings = fs.existsSync(SETTINGS_INI)
    ? buildHsmsBindingsFromIni(fs.readFileSync(SETTINGS_INI, "utf8"))
    : new Map();

  const overlays = fs.existsSync(OVERLAYS)
    ? JSON.parse(fs.readFileSync(OVERLAYS, "utf8"))
    : [];
  applyOverlays(bindings, overlays);

  const entries = buildEntries(catalog, bindings);
  const mapped = entries.filter((e) => e.hsms && e.hsms.length).length;

  // Emit the char list once; runtime builds indexes (avoids 3× JSON bloat).
  const mapTs = `/* eslint-disable */
// AUTO-GENERATED by scripts/generate-mufi-char-map.mjs — do not edit manually.
// MUFI catalog: assets/mufi/mufi-chars.json (CC BY-SA 4.0)
// HSMS/HTML overlays: assets/legacy_hsms_settings.ini + assets/mufi/hsms-overlays.json

export type MufiCharEntry = {
  mufiId?: string;
  codepoint: string;
  unicode: string;
  html: string | null;
  hsms: string[] | null;
  category: string;
  baseLetter: string | null;
  note?: string;
};

export const MUFI_CHAR_SOURCE = ${JSON.stringify({
    format: catalog.format,
    source: catalog.source,
    license: catalog.license,
    attribution: catalog.attribution,
    count: entries.length,
    hsmsMapped: mapped,
  })} as const;

export const MUFI_CHARS: MufiCharEntry[] = ${JSON.stringify(entries)};
`;

  const ornate = buildOrnateInventory(entries);
  const ornateTs = `/* eslint-disable */
// AUTO-GENERATED by scripts/generate-mufi-char-map.mjs — do not edit manually.
// Procedural styles match components/svgFacsimile/renderOrnateInitial.tsx
// Optional static overrides: assets/mufi/ornate-initials/{LETTER}/{styleLabel}.svg

export type OrnateInitialStyleLabel =
  | "historiated_vines"
  | "geometrical_crible"
  | "renaissance_ribbon"
  | "minstrel_damask";

export type OrnateInitialStyleEntry = {
  style: 0 | 1 | 2 | 3;
  label: OrnateInitialStyleLabel;
  renderer: "procedural";
  staticSvgPath: string | null;
};

export type OrnateInitialInventoryEntry = {
  letter: string;
  unicode: string;
  mufiCodepoint: string | null;
  preferredFont: {
    mufiFontId: 53;
    family: string;
    mufiUrl: string;
  };
  styles: OrnateInitialStyleEntry[];
};

export const ORNATE_STYLE_LABELS: readonly OrnateInitialStyleLabel[] = ${JSON.stringify(ORNATE_STYLE_LABELS)} as const;

export const ORNATE_INITIAL_INVENTORY: OrnateInitialInventoryEntry[] = ${JSON.stringify(ornate, null, 2)};
`;

  emitTs(OUT_MAP, mapTs);
  emitTs(OUT_ORNATE, ornateTs);
  console.log(
    `Wrote ${entries.length} MUFI entries (${mapped} with HSMS) → ${path.relative(root, OUT_MAP)}`,
  );
  console.log(
    `Wrote ${ornate.length} ornate inventory letters → ${path.relative(root, OUT_ORNATE)}`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
