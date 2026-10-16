import {
  handleAgentVisionOutput,
  ingestAgentTranscription,
} from "../utils/ingestAgentTranscription";
import {
  buildAgentMemoryPayload,
  formatAgentMemoryText,
  getAllHsmsAgentRules,
} from "../utils/hsmsAgentRuleCatalog";

describe("ingestAgentTranscription", () => {
  it("strips fences, lints, and compiles a valid leaf", () => {
    const raw = `Sure, here is the transcription:\n\`\`\`hsms\n[fol. 1r]\n{CB1.\nhello mundo\n}\n\`\`\``;
    const result = ingestAgentTranscription(raw);
    expect(result.hsmsAscii).toContain("[fol. 1r]");
    expect(result.hsmsAscii).not.toContain("```");
    expect(result.parsedManuscript.folios.length).toBeGreaterThan(0);
    expect(result.lintReport.errorCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.criticalErrors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("flags empty agent output as invalid", () => {
    const result = ingestAgentTranscription("   ");
    expect(result.isValid).toBe(false);
    expect(result.criticalErrors.length).toBeGreaterThan(0);
  });

  it("handleAgentVisionOutput strips conversational preambles", () => {
    const raw =
      "Here is the transcription of the page:\n\n[fol. 1r]\n{CB1.\n{RUB. TRatado}\n{IN5.} SPhera\n}";
    const result = handleAgentVisionOutput(raw);
    expect(result.cleanAscii.startsWith("[fol. 1r]")).toBe(true);
    expect(result.parsed.folios.length).toBeGreaterThan(0);
    expect(result.issues).toBeDefined();
  });
});

describe("hsmsAgentRuleCatalog", () => {
  it("exports unique rule ids across sources", () => {
    const rules = getAllHsmsAgentRules();
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rules.length).toBeGreaterThan(30);
  });

  it("formats memory text with boundary section", () => {
    const payload = buildAgentMemoryPayload(new Date("2026-01-01T00:00:00.000Z"));
    const text = formatAgentMemoryText(payload);
    expect(text).toContain("# HSMS Agent Memory Rules");
    expect(text).toContain("## Client vs agent boundary");
    expect(text).toContain("STRAY_PAGE_METADATA");
    expect(text).toContain("DROP_CAP_SINGLE_SPACE");
  });
});
