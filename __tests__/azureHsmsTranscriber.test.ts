import {
  extractHsmsAsciiPayload,
  formatLintErrorsForRepair,
} from "../services/azureHsmsTranscriber";
import {
  buildAzureAgentQuery,
  resolveAzureAgentRole,
  SYNTAX_REPAIR_INTENT,
} from "../services/azureAgentOrchestrator";
import {
  buildAzureAgentA2AUrl,
  getAzureAgentEndpointForRole,
  getAzureDeploymentForRole,
  getAzureOpenAIEndpoint,
  getAzureTransport,
  getAzureTransportForRole,
  useFoundryAgentResponses,
  stripAgentPath,
} from "../services/azureAgentConfig";
import {
  extractResponsesText,
  normalizeOpenAIBaseUrl,
} from "../services/azureOpenAI";
import {
  AGENT_VISION_SYSTEM_PROMPT,
  HSMS_VISION_INSTRUCTIONS,
  instructionsForAzureRole,
  reanchorSystemPrompt,
} from "../services/hsmsOpenAIInstructions";
import { a2aBaseUrl, extractA2AText, type A2ATask } from "../services/azureA2A";
import { lintHsmsTranscription } from "../utils/hsmsLinter";

describe("azureHsmsTranscriber helpers", () => {
  it("strips markdown fences and preambles", () => {
    const raw = `Sure, here is the transcription:\n\`\`\`hsms\n[fol. 1r]\n{CB1.\nhello\n}\n\`\`\``;
    expect(extractHsmsAsciiPayload(raw)).toBe("[fol. 1r]\n{CB1.\nhello\n}");
  });

  it("starts at the first folio marker when chatter precedes", () => {
    const raw = "Output follows.\n\n[fol. 2v]\n{CB1.\nx\n}";
    expect(extractHsmsAsciiPayload(raw).startsWith("[fol. 2v]")).toBe(true);
  });

  it("dedupes an exact repeated folio block from vision echo", () => {
    const once = "[fol. 1]\n{CB1.\n1 {IN4.} Tratado\n}";
    const raw = `${once}\n${once}`;
    expect(extractHsmsAsciiPayload(raw)).toBe(once);
  });
});

describe("azureAgentOrchestrator session context", () => {
  it("embeds paleographer session header", () => {
    const q = buildAzureAgentQuery({
      query: "transcribe this leaf",
      screen: "Studio",
      persona: "paleographer",
      intent_key: "transcription.vision_ocr",
      folio_id: "1r",
      language_hint: "POR",
    });
    expect(q).toContain("=== Session context ===");
    expect(q).toContain("User persona: paleographer.");
    expect(q).toContain("Intent: transcription.vision_ocr.");
    expect(q).toContain("Folio hint: 1r.");
    expect(q).toContain("User Query: transcribe this leaf");
  });

  it("injects file_search bypass for vision OCR turns", () => {
    const q = buildAzureAgentQuery({
      query: "Transcribe immediately",
      intent_key: "transcription.vision_ocr",
      image_uri: "data:image/jpeg;base64,abc",
      vision: true,
      session_entities: { demo_date: "1537-01-01", locale: "pt" },
      history: [{ role: "user", text: "hello" }],
    });
    expect(q).toContain("bypass file_search");
    expect(q).toContain("execute vision OCR immediately");
    expect(q).toContain("Entity demo_date: 1537-01-01.");
    expect(q).toContain("Entity locale: pt.");
    // History must not dilute a vision turn into a clarification dialog.
    expect(q).not.toContain("RECENT CHAT HISTORY");
  });

  it("re-anchors Agent 1 system prompt at the top of every vision user frame", () => {
    const q = buildAzureAgentQuery({
      query: "TRANSCRIBE PAGE: 1r",
      intent_key: "transcription.vision_ocr",
      vision: true,
      image_uri: "data:image/png;base64,abc",
    });
    expect(q.startsWith("### SYSTEM PROMPT:")).toBe(true);
    expect(q).toContain("Zero Modernization");
    expect(q).toContain("TRANSCRIBE PAGE: 1r");
    expect(q.indexOf("### SYSTEM PROMPT:")).toBeLessThan(q.indexOf("User Query:"));
  });

  it("injects syntax-repair routing without chat history", () => {
    const q = buildAzureAgentQuery({
      query: "Fix braces only",
      intent_key: SYNTAX_REPAIR_INTENT,
      persona: "linter_corrector",
      history: [{ role: "user", text: "prior chat" }],
    });
    expect(q).toContain(`Intent: ${SYNTAX_REPAIR_INTENT}.`);
    expect(q).toContain("repair HSMS structural syntax only");
    expect(q).not.toContain("RECENT CHAT HISTORY");
    expect(q.startsWith("### SYSTEM PROMPT:")).toBe(true);
    expect(q).toContain("Structural Syntax Repair");
  });
});

describe("formatLintErrorsForRepair", () => {
  it("formats line-indexed messages for Pass 2", () => {
    const lines = formatLintErrorsForRepair([
      {
        severity: "error",
        message: "[FOLIO_LEAK] open env",
        lineIndex: 3,
        rawSnippet: "{CB1.",
      },
    ]);
    expect(lines[0]).toBe("L4: [FOLIO_LEAK] open env");
  });
});

describe("azureAgentConfig two-agent routing", () => {
  const project =
    "https://jason-hsms-1907-resource.services.ai.azure.com/api/projects/jason-hsms-1907";

  it("builds per-agent A2A URLs under the project", () => {
    expect(
      buildAzureAgentA2AUrl(project, "hsms-agent-q0rwhx433x-gpt-4o"),
    ).toBe(
      `${project}/agents/hsms-agent-q0rwhx433x-gpt-4o/endpoint/protocols/a2a`,
    );
    expect(
      buildAzureAgentA2AUrl(project, "hsms-agent-607kfp6kw1-gpt5-mini"),
    ).toContain("hsms-agent-607kfp6kw1-gpt5-mini");
  });

  it("strips agent path back to project root", () => {
    expect(
      stripAgentPath(
        `${project}/agents/hsms-agent-q0rwhx433x-gpt-4o/endpoint/protocols/a2a`,
      ),
    ).toBe(project);
  });

  it("maps intents to vision vs syntax roles", () => {
    expect(resolveAzureAgentRole({ intent_key: "transcription.vision_ocr", vision: true })).toBe(
      "vision",
    );
    expect(resolveAzureAgentRole({ intent_key: SYNTAX_REPAIR_INTENT })).toBe("syntax");
    expect(resolveAzureAgentRole({ persona: "linter_corrector" })).toBe("syntax");
  });

  it("defaults role endpoints to jason-hsms-1907 agents", () => {
    expect(getAzureAgentEndpointForRole("vision")).toContain("hsms-agent-q0rwhx433x-gpt-4o");
    expect(getAzureAgentEndpointForRole("syntax")).toContain("hsms-agent-607kfp6kw1-gpt5-mini");
  });

  it("defaults hybrid: vision gpt-4o, syntax via Foundry gpt5-mini agent Responses", () => {
    expect(getAzureOpenAIEndpoint()).toMatch(/\/openai\/v1$/);
    expect(getAzureDeploymentForRole("vision")).toBe("gpt-4o");
    expect(getAzureDeploymentForRole("syntax")).toBe("gpt-5.4-mini");
    expect(getAzureTransport()).toBe("hybrid");
    expect(getAzureTransportForRole("vision")).toBe("openai");
    expect(getAzureTransportForRole("syntax")).toBe("openai");
    expect(useFoundryAgentResponses("syntax")).toBe(true);
    expect(useFoundryAgentResponses("vision")).toBe(false);
    expect(getAzureAgentEndpointForRole("syntax")).toContain(
      "hsms-agent-607kfp6kw1-gpt5-mini",
    );
  });
});

describe("OpenAI Responses instructions", () => {
  it("ships multiline CB envelope guidance for vision", () => {
    expect(HSMS_VISION_INSTRUCTIONS).toContain("{CB1.");
    expect(AGENT_VISION_SYSTEM_PROMPT).toBe(HSMS_VISION_INSTRUCTIONS);
    expect(HSMS_VISION_INSTRUCTIONS).toMatch(/Never emit an empty/i);
    expect(instructionsForAzureRole("syntax")).toMatch(/EMPTY_COLUMN|empty \{CB/i);
    expect(reanchorSystemPrompt("vision", "TRANSCRIBE PAGE: 1")).toMatch(
      /^### SYSTEM PROMPT:[\s\S]*TRANSCRIBE PAGE: 1$/,
    );
  });

  it("flags empty {CB1.} + loose text as critical", () => {
    const report = lintHsmsTranscription(`{CB1.}
[fol. 1]
Tratado da sphera
`);
    expect(report.isValid).toBe(false);
    expect(report.criticalErrors.some((e) => e.code === "EMPTY_COLUMN_ENVELOPE")).toBe(true);
    expect(report.criticalErrors.some((e) => e.code === "TEXT_OUTSIDE_COLUMN")).toBe(true);
  });
});

describe("azureOpenAI Responses helpers", () => {
  it("normalizes resource host to /openai/v1", () => {
    expect(
      normalizeOpenAIBaseUrl("https://jason-hsms-1907-resource.services.ai.azure.com"),
    ).toBe("https://jason-hsms-1907-resource.services.ai.azure.com/openai/v1");
    expect(
      normalizeOpenAIBaseUrl(
        "https://jason-hsms-1907-resource.services.ai.azure.com/api/projects/jason-hsms-1907",
      ),
    ).toMatch(/\/openai\/v1$/);
  });

  it("extracts output_text from Responses payload", () => {
    expect(extractResponsesText({ output_text: "[fol. 1r]\nok" })).toContain("[fol. 1r]");
    expect(
      extractResponsesText({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "{CB1.\nx\n}" }],
          },
        ],
      }),
    ).toContain("{CB1.");
  });
});

describe("azureA2A helpers", () => {
  it("normalizes endpoint to /protocols/a2a", () => {
    expect(
      a2aBaseUrl(
        "https://ex.services.ai.azure.com/api/projects/p/agents/a/endpoint/protocols/openai/responses",
      ),
    ).toMatch(/\/protocols\/a2a$/);
  });

  it("extracts artifact text", () => {
    const task: A2ATask = {
      id: "t1",
      status: "completed",
      artifacts: [
        {
          artifactId: "a1",
          parts: [{ kind: "text", text: "[fol. 1r]\n{CB1.\nok\n}" }],
        },
      ],
    };
    expect(extractA2AText(task)).toContain("[fol. 1r]");
  });
});
