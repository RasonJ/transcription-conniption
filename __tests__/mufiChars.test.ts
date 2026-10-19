import {
  getOrnateInitialInventory,
  hsmsHtmlUnicodeTriple,
  listMufiByBaseLetter,
  listMufiChars,
  lookupMufiByCodepoint,
  lookupMufiByHsms,
  MUFI_CHAR_SOURCE,
  ORNATE_STYLE_LABELS,
} from "../utils/mufiChars";
import {
  ANDRON_SCRIPTOR,
  describeMufiFontAttribution,
  mufiSerifStack,
} from "../utils/mufiFonts";

describe("MUFI 3-way char map", () => {
  it("loads a non-empty catalog with attribution", () => {
    expect(listMufiChars().length).toBeGreaterThan(1000);
    expect(MUFI_CHAR_SOURCE.license).toMatch(/CC-BY-SA/i);
    expect(MUFI_CHAR_SOURCE.hsmsMapped).toBeGreaterThan(20);
  });

  it("maps HSMS a~ → &#227; → ã", () => {
    const triple = hsmsHtmlUnicodeTriple("a~");
    expect(triple).toEqual({
      hsms: "a~",
      html: "&#227;",
      unicode: "ã",
      codepoint: "U+00E3",
    });
    expect(lookupMufiByHsms("a@~")?.unicode).toBe("ã");
  });

  it("maps HSMS c' → &#231; → ç", () => {
    const triple = hsmsHtmlUnicodeTriple("c'");
    expect(triple).toEqual({
      hsms: "c'",
      html: "&#231;",
      unicode: "ç",
      codepoint: "U+00E7",
    });
  });

  it("maps HSMS n~ → &#241; → ñ", () => {
    const triple = hsmsHtmlUnicodeTriple("n~");
    expect(triple).toEqual({
      hsms: "n~",
      html: "&#241;",
      unicode: "ñ",
      codepoint: "U+00F1",
    });
  });

  it("looks up by codepoint and groups by base letter", () => {
    expect(lookupMufiByCodepoint("U+00E3")?.unicode).toBe("ã");
    const aForms = listMufiByBaseLetter("a");
    expect(aForms.some((e) => e.unicode === "ã")).toBe(true);
  });
});

describe("ornate initial SVG inventory", () => {
  it("lists four procedural styles for A–Z", () => {
    expect(ORNATE_STYLE_LABELS).toHaveLength(4);
    const all = getOrnateInitialInventory();
    expect(all.length).toBeGreaterThanOrEqual(26);
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const [entry] = getOrnateInitialInventory(letter);
      expect(entry?.letter).toBe(letter);
      expect(entry?.styles).toHaveLength(4);
      expect(entry?.styles.every((s) => s.renderer === "procedural")).toBe(true);
    }
  });

  it("detects a static SVG override for A / historiated_vines", () => {
    const [entry] = getOrnateInitialInventory("A");
    const vines = entry?.styles.find((s) => s.label === "historiated_vines");
    expect(vines?.staticSvgPath).toBe(
      "assets/mufi/ornate-initials/A/historiated_vines.svg",
    );
    const crible = entry?.styles.find((s) => s.label === "geometrical_crible");
    expect(crible?.staticSvgPath).toBeNull();
  });

  it("prefers Andron Scriptor (MUFI font 53) for ornate letters", () => {
    const [entry] = getOrnateInitialInventory("A");
    expect(entry?.preferredFont).toEqual({
      mufiFontId: 53,
      family: "Andron Scriptor Web",
      mufiUrl: "https://mufi.info/q.php?p=mufi/fonts/fonts/53",
    });
    expect(ANDRON_SCRIPTOR.mufiFontId).toBe(53);
    expect(mufiSerifStack()).toContain("Andron Scriptor Web");
    expect(describeMufiFontAttribution()).toMatch(/Stötzner|MUFI/i);
  });
});
