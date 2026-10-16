import { convertHtrToHsms, HTR_SUBSTITUTION_RULES, HTR_SPACE_RULES } from "../utils/htrConverter";
import { auditHsmsProoferIncidents } from "../utils/prooferIncidents";

describe("convertHtrToHsms", () => {
  it("exports the ordered HTR rule tables from HSMS-tools", () => {
    expect(HTR_SUBSTITUTION_RULES.length).toBeGreaterThanOrEqual(70);
    expect(HTR_SPACE_RULES.length).toBe(6);
  });

  it("converts fullwidth / subset brackets and grave superscripts", () => {
    const { hsmsText } = convertHtrToHsms("q＜ue＞ ⊂per⊃ a`");
    expect(hsmsText).toContain("q<ue>");
    expect(hsmsText).toContain("<per>");
    expect(hsmsText).toContain("<<a>>");
    expect(hsmsText).not.toMatch(/[＜＞⊂⊃`]/);
  });

  it("normalizes CB / folio layout and c'/n~", () => {
    const { hsmsText } = convertHtrToHsms("{CB1. c'asa n~o [fol. 1r] texto");
    expect(hsmsText).toContain("{CB1.");
    expect(hsmsText).toContain("çasa");
    expect(hsmsText).toContain("ño");
    expect(hsmsText).toMatch(/\[fol\. 1r\]/);
  });

  it("expands common abbreviated glyphs before general marks", () => {
    const { hsmsText } = convertHtrToHsms("q̃r q̃ ꝑa");
    expect(hsmsText).toContain("q<u><<a>>r");
    expect(hsmsText).toContain("q<ue>");
    expect(hsmsText).toContain("p<ar>a");
  });
});

describe("proofer HTR leftover checks", () => {
  it("flags unconverted HTR markers", () => {
    const incidents = auditHsmsProoferIncidents("{CB1.\nq＜ue＞\n}");
    expect(incidents.some((i) => i.code === "UNCONVERTED_HTR_MARKER")).toBe(true);
  });

  it("flags invalid AD/GL payload format", () => {
    const incidents = auditHsmsProoferIncidents("{AD. texto sin marca}");
    expect(incidents.some((i) => i.code === "INVALID_AD_GL_FORMAT")).toBe(true);
    const ok = auditHsmsProoferIncidents("{AD. [^texto]}");
    expect(ok.some((i) => i.code === "INVALID_AD_GL_FORMAT")).toBe(false);
  });
});
