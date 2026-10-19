import {
  END_FOLIO_SENTINEL,
  handleAgentVisionOutput,
  ingestAgentTranscription,
  sanitizeVisionOutput,
} from "../utils/ingestAgentTranscription";
import {
  buildAgentMemoryPayload,
  formatAgentMemoryText,
  getAllHsmsAgentRules,
} from "../utils/hsmsAgentRuleCatalog";

describe("sanitizeVisionOutput", () => {
  it("truncates at === END FOLIO === and drops post-sentinel garbage", () => {
    const raw = `[fol. 1r]
{CB1.
1 hello
}
${END_FOLIO_SENTINEL}
que seia por demostrac'a~o: & poys se alguas vezes se achã
que seia por demostrac'a~o: & poys se alguas vezes se achã`;
    const cleaned = sanitizeVisionOutput(raw);
    expect(cleaned).toContain("[fol. 1r]");
    expect(cleaned).toContain("hello");
    expect(cleaned).not.toContain(END_FOLIO_SENTINEL);
    expect(cleaned).not.toContain("demostrac");
  });

  it("prunes consecutive duplicate lines even when line numbers differ", () => {
    const loop = "que seia por demostrac'a~o: & poys se alguas vezes se achã";
    const raw = `[fol. 1r]
{CB1.
1 AO SERENISSIMO
2 LENTISSIMO PRINCIPE
3 {IN4.} Dzbo bem auenturado
14 ${loop}
15 ${loop}
16 ${loop}
17 ${loop}
18 ${loop}
}`;
    const cleaned = sanitizeVisionOutput(raw);
    const hits = cleaned.split("\n").filter((l) => l.includes("demostrac"));
    // Keep at most two identical content lines; drop the rest of the loop.
    expect(hits.length).toBe(2);
    expect(cleaned.trim().endsWith("}")).toBe(true);
  });

  it("closes a truncated column envelope after pruning a runaway loop", () => {
    const loop = "que seia por demostrac'a~o: & poys se alguas vezes se achã";
    const raw = `[fol. 1r]
{CB1.
1 first line
2 ${loop}
3 ${loop}
4 ${loop}
5 ${loop}`;
    const cleaned = sanitizeVisionOutput(raw);
    expect(cleaned).toMatch(/\{CB1\./);
    expect(cleaned.trim().endsWith("}")).toBe(true);
    expect(cleaned.split("\n").filter((l) => l.includes("demostrac")).length).toBe(2);
  });
});

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

  it("ingest pipeline applies sanitize before lint/compile", () => {
    const loop = "que seia por demostrac'a~o: & poys se alguas vezes se achã";
    const raw = `[fol. 1r]
{CB1.
1 {RUB. AO SERENISSIMO}
2 body line
14 ${loop}
15 ${loop}
16 ${loop}
17 ${loop}
}
${END_FOLIO_SENTINEL}
extra garbage that must vanish`;
    const result = ingestAgentTranscription(raw);
    expect(result.hsmsAscii).not.toContain("extra garbage");
    expect(result.hsmsAscii).not.toContain(END_FOLIO_SENTINEL);
    expect(result.hsmsAscii.split("\n").filter((l) => l.includes("demostrac")).length).toBeLessThanOrEqual(2);
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
