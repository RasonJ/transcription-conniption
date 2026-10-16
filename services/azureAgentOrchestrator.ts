/**
 * Azure AI Foundry Agent Orchestrator — A2A Protocol (HSMS paleography domain)
 *
 * Mirrors XEN dental-rcm `azureAgentOrchestrator.ts`, specialized for Transcription Conniption:
 * paleographer persona, Studio screen context, vision OCR intent keys.
 *
 * Auth  : "api-key" header (EXPO_PUBLIC_AZURE_AGENT_API_KEY)
 * Default transport: hybrid
 *   vision → OpenAI Responses gpt-4o
 *   syntax → Foundry Agent A2A hsms-agent-607kfp6kw1-gpt5-mini
 * Override with EXPO_PUBLIC_AZURE_TRANSPORT=openai|a2a|hybrid.
 *
 * See docs/AZURE_HSMS_AGENT_ORCHESTRATION.md and docs/prompt-hsms-transcriber.md.
 */

import {
  a2aBaseUrl,
  a2aTaskState,
  A2A_VISION_SEND_TIMEOUT_MS,
  detectA2ATool,
  extractA2AText,
  getA2AAgentCard,
  pollA2ATask,
  sendA2AMessage,
  type A2AConfig,
  type A2APart,
  type A2ATask,
} from "@/services/azureA2A";
import {
  getAzureAgentApiKey,
  getAzureAgentEndpointForRole,
  getAzureDeploymentForRole,
  getAzureOpenAIEndpoint,
  getAzureAgentResponsesUrlForRole,
  getAzureSyntaxAgentName,
  getAzureTransport,
  getAzureTransportForRole,
  isAzureAgentConfigured as configReady,
  isAzureDemoMode,
  useFoundryAgentResponses,
  type AzureAgentRole,
} from "@/services/azureAgentConfig";
import {
  instructionsForAzureRole,
  reanchorSystemPrompt,
} from "@/services/hsmsOpenAIInstructions";
import {
  buildVisionResponsesInput,
  createOpenAIResponse,
} from "@/services/azureOpenAI";

export { isAzureAgentConfigured } from "@/services/azureAgentConfig";
export {
  getAzureAgentEndpointForRole,
  getAzureDeploymentForRole,
  getAzureOpenAIEndpoint,
  getAzureProjectEndpoint,
  getAzureTransport,
  getAzureTransportForRole,
  getAzureVisionAgentName,
  getAzureSyntaxAgentName,
  getAzureVisionDeployment,
  getAzureSyntaxDeployment,
  useFoundryAgentResponses,
  describeAzureAgentRouting,
} from "@/services/azureAgentConfig";

function a2aConfig(overrides?: Partial<A2AConfig>): A2AConfig {
  return {
    endpoint: getAzureAgentEndpointForRole("vision"),
    apiKey: getAzureAgentApiKey(),
    demoMode: isAzureDemoMode(),
    ...overrides,
  };
}

/** Map intent / vision flag → Foundry agent role (Pass 1 vision vs Pass 2 syntax). */
export function resolveAzureAgentRole(params: {
  intent_key?: string;
  vision?: boolean;
  image_uri?: string;
  persona?: string;
  agent_role?: AzureAgentRole;
}): AzureAgentRole {
  if (params.agent_role) return params.agent_role;
  if (
    params.intent_key === SYNTAX_REPAIR_INTENT ||
    params.persona === "linter_corrector"
  ) {
    return "syntax";
  }
  if (
    params.intent_key === VISION_OCR_INTENT ||
    params.vision === true ||
    Boolean(params.image_uri)
  ) {
    return "vision";
  }
  return "vision";
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/** Vision OCR intent — bypasses file_search and forces immediate transcription. */
export const VISION_OCR_INTENT = "transcription.vision_ocr" as const;

/** Pass 2 structural syntax repair — no vision, no orthographic rewrite. */
export const SYNTAX_REPAIR_INTENT = "transcription.syntax_repair" as const;

export interface AzureAgentChatParams {
  query: string;
  screen?: string;
  persona?: string;
  locale?: string;
  intent_key?: string;
  folio_id?: string;
  language_hint?: string;
  image_uri?: string;
  history?: ConversationTurn[];
  /** Use the longer vision send timeout. */
  vision?: boolean;
  /**
   * Force which Foundry agent to call (vision gpt-4o vs syntax gpt-5.4-mini).
   * Defaults from intent_key / vision / persona.
   */
  agent_role?: AzureAgentRole;
  /**
   * Optional session entities (e.g. demo_date, locale) echoed into context
   * so Foundry routing can skip retrieval when vision is active.
   */
  session_entities?: Record<string, string>;
  /** Extra A2A parts (e.g. binary metadata). */
  extraParts?: A2APart[];
}

function isVisionOcrIntent(params: AzureAgentChatParams): boolean {
  return (
    params.intent_key === VISION_OCR_INTENT ||
    params.vision === true ||
    Boolean(params.image_uri)
  );
}

function isSyntaxRepairIntent(params: AzureAgentChatParams): boolean {
  return params.intent_key === SYNTAX_REPAIR_INTENT;
}

/**
 * Build a single A2A user message with Studio / paleography session context
 * (same shape as XEN RCM's === Session context === header).
 *
 * - `transcription.vision_ocr` (+ image): bypass file_search; immediate vision.
 * - `transcription.syntax_repair`: bypass file_search; fix braces only.
 */
export function buildAzureAgentQuery(params: AzureAgentChatParams): string {
  const visionTurn = isVisionOcrIntent(params);
  const repairTurn = isSyntaxRepairIntent(params);
  const ctx: string[] = [];
  if (params.screen) ctx.push(`Current screen: ${params.screen}.`);
  if (params.persona) ctx.push(`User persona: ${params.persona}.`);
  if (params.locale) ctx.push(`Active locale: ${params.locale}.`);
  if (params.intent_key) ctx.push(`Intent: ${params.intent_key}.`);
  else if (visionTurn) ctx.push(`Intent: ${VISION_OCR_INTENT}.`);

  if (visionTurn) {
    ctx.push(
      "Tool routing: bypass file_search; execute vision OCR immediately — no confirmation, no questions, no preamble.",
    );
    ctx.push(
      "Execution: WHEN an image or image data-URI is present, output ONLY raw HSMS ASCII on this turn.",
    );
  } else if (repairTurn) {
    ctx.push(
      "Tool routing: bypass file_search; repair HSMS structural syntax only — do not modernize spelling.",
    );
    ctx.push(
      "Execution: Output ONLY the repaired HSMS ASCII — no Markdown fences, no preamble.",
    );
  }

  if (params.folio_id) ctx.push(`Folio hint: ${params.folio_id}.`);
  if (params.language_hint) ctx.push(`Language hint: ${params.language_hint}.`);
  if (params.session_entities) {
    for (const [key, value] of Object.entries(params.session_entities)) {
      if (value) ctx.push(`Entity ${key}: ${value}.`);
    }
  }
  if (params.image_uri) {
    const uri = params.image_uri;
    const preview =
      uri.length > 160 && uri.startsWith("data:")
        ? `${uri.slice(0, 48)}…(${uri.length} chars data URI)`
        : uri.length > 240
          ? `${uri.slice(0, 240)}…`
          : uri;
    ctx.push(`Image source: ${preview}.`);
  }
  if (repairTurn) {
    ctx.push(
      "Domain: HSMS syntax repair. Fix unclosed braces / unbalanced brackets / {CB.} envelopes only.",
    );
  } else {
    ctx.push(
      "Domain: HSMS paleographic transcription. Return raw ASCII HSMS markup only when Intent is transcription.vision_ocr.",
    );
    ctx.push(
      "Continuity: Resolve \"this leaf\", \"this folio\", or \"the scan\" against Folio hint / Image source above.",
    );
  }

  const contextHeader =
    ctx.length > 0 ? "=== Session context ===\n" + ctx.join("\n") + "\n=== End context ===\n\n" : "";

  // Vision / repair turns must not carry chat history that could trigger clarification.
  let historyHeader = "";
  if (!visionTurn && !repairTurn && params.history && params.history.length > 0) {
    const recent = params.history.slice(-6);
    historyHeader =
      "=== RECENT CHAT HISTORY ===\n" +
      recent
        .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text.slice(0, 300)}`)
        .join("\n") +
      "\n===========================\n\n";
  }

  // Re-anchor Agent 1/2 rules at the TOP of this user frame (pixel-layer /
  // Assistant-thread drift). Callers that already prefixed ### SYSTEM PROMPT
  // are left unchanged by reanchorSystemPrompt.
  const roleHint: "vision" | "syntax" | null = repairTurn
    ? "syntax"
    : visionTurn
      ? "vision"
      : null;
  const framed = `${contextHeader}${historyHeader}User Query: ${params.query}`;
  return roleHint != null ? reanchorSystemPrompt(roleHint, framed) : framed;
}

export interface AzureAgentResult {
  answer: string;
  tool_executed?: string;
}

/** True when the URI can be attached as Responses `input_image` / A2A image part. */
function isVisionAttachableUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return (
    uri.startsWith("data:image/") ||
    /^https?:\/\//i.test(uri)
  );
}

export async function chatWithAzureAgent(params: AzureAgentChatParams): Promise<AzureAgentResult> {
  if (!configReady()) {
    throw new Error(
      "Azure is not configured. Set EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT (or PROJECT_ENDPOINT), deployment names, and EXPO_PUBLIC_AZURE_AGENT_API_KEY.",
    );
  }

  const role = resolveAzureAgentRole(params);
  const fullQuery = buildAzureAgentQuery(params);
  const transport = getAzureTransportForRole(role);
  const hasVisionUri = isVisionAttachableUri(params.image_uri);

  if (transport === "openai") {
    return chatWithAzureOpenAI(params, role, fullQuery);
  }

  try {
    return await chatWithAzureA2A(params, role, fullQuery);
  } catch (err) {
    // Hybrid / A2A path: if vision data-URI (or https image) fails on A2A,
    // fall back to OpenAI Responses multimodal so multi-page queues recover.
    if (hasVisionUri && (getAzureTransport() === "hybrid" || role === "vision")) {
      console.warn(
        "A2A vision turn failed; falling back to OpenAI Responses multimodal",
        err,
      );
      return chatWithAzureOpenAI(params, role, fullQuery);
    }
    throw err;
  }
}

/** Foundry sample / agent Responses path. */
async function chatWithAzureOpenAI(
  params: AzureAgentChatParams,
  role: AzureAgentRole,
  fullQuery: string,
): Promise<AzureAgentResult> {
  const deployment = getAzureDeploymentForRole(role);
  const hasImage = isVisionAttachableUri(params.image_uri);
  const input =
    hasImage && params.image_uri
      ? buildVisionResponsesInput({ prompt: fullQuery, imageDataUri: params.image_uri })
      : fullQuery;

  const viaAgent = useFoundryAgentResponses(role);
  const agentResponsesUrl = viaAgent ? getAzureAgentResponsesUrlForRole(role) : undefined;

  const { answer } = await createOpenAIResponse(
    {
      baseUrl: getAzureOpenAIEndpoint(),
      apiKey: getAzureAgentApiKey(),
      deployment,
      timeoutMs:
        hasImage || role === "vision" ? A2A_VISION_SEND_TIMEOUT_MS : undefined,
      ...(agentResponsesUrl
        ? { responsesUrl: agentResponsesUrl, omitInstructions: true }
        : {}),
    },
    viaAgent
      ? // Agent-bound Responses: only model + input (portal owns instructions/temp).
        { input }
      : {
          input,
          instructions: instructionsForAzureRole(role),
          temperature: role === "syntax" ? 0 : 0.2,
        },
  );

  return {
    answer,
    tool_executed: viaAgent
      ? `openai.agent.responses:${getAzureSyntaxAgentName()}:${deployment}`
      : `openai.responses:${deployment}`,
  };
}

/** Legacy Foundry Agents A2A path. */
async function chatWithAzureA2A(
  params: AzureAgentChatParams,
  role: AzureAgentRole,
  fullQuery: string,
): Promise<AzureAgentResult> {
  const endpoint = getAzureAgentEndpointForRole(role);
  const cfg = a2aConfig({
    endpoint,
    ...(params.vision || role === "vision" ? { sendTimeoutMs: A2A_VISION_SEND_TIMEOUT_MS } : {}),
  });
  const baseUrl = a2aBaseUrl(cfg.endpoint);
  const agentCard = await getA2AAgentCard(cfg, baseUrl);
  const agentUrl = agentCard.url ?? baseUrl;

  const extraParts: A2APart[] = [...(params.extraParts ?? [])];
  if (isVisionAttachableUri(params.image_uri) && params.image_uri) {
    extraParts.push({
      kind: "data",
      mimeType: guessMimeFromDataUri(params.image_uri),
      data: {
        type: params.image_uri.startsWith("data:") ? "image_data_uri" : "image_url",
        image_uri: params.image_uri,
        folio_id: params.folio_id,
        language_hint: params.language_hint,
      },
    });
  }

  let task: A2ATask = await sendA2AMessage(cfg, agentUrl, fullQuery, extraParts);
  if (a2aTaskState(task) !== "completed") {
    task = await pollA2ATask(cfg, agentUrl, task.id);
  }

  const answer = extractA2AText(task).trim();
  if (!answer) {
    throw new Error("A2A task completed without any text response");
  }
  return { answer, tool_executed: detectA2ATool(task) };
}

function guessMimeFromDataUri(uri: string): string {
  const m = /^data:([^;,]+)/i.exec(uri);
  return m?.[1] ?? "application/octet-stream";
}
