/**
 * Azure OpenAI Responses API client (`/openai/v1`).
 *
 * Mirrors the Foundry sample:
 *   endpoint = "https://…services.ai.azure.com/openai/v1"
 *   client.responses.create(model=deployment_name, input=…)
 *
 * No `openai` npm dependency — plain fetch for Expo/web.
 */

export type AzureOpenAIConfig = {
  /** e.g. https://jason-hsms-1907-resource.services.ai.azure.com/openai/v1 */
  baseUrl: string;
  apiKey: string;
  /** Deployment / model name (e.g. gpt-4o). */
  deployment: string;
  timeoutMs?: number;
  /**
   * Absolute POST URL for Foundry agent Responses
   * (`…/agents/{name}/endpoint/protocols/openai/responses?api-version=v1`).
   * When set, `baseUrl` is ignored for the request path.
   */
  responsesUrl?: string;
  /** Foundry agents reject `instructions` when the agent is bound. */
  omitInstructions?: boolean;
};

export type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "auto" | "low" | "high" }
  | { type: "text"; text: string }
  | { type: "output_text"; text: string };

export type ResponsesInputMessage = {
  role: "user" | "assistant" | "system" | "developer";
  content: string | ResponsesContentPart[];
};

export type CreateResponsesParams = {
  /** Plain string or multimodal message list. */
  input: string | ResponsesInputMessage[];
  /** Optional system-style instructions prepended by the API. */
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
/**
 * Vision fail-fast: runaway repetition loops must not burn the old 180s ceiling.
 * A clean folio usually finishes well under this; aborted turns retry as transient.
 */
export const VISION_TIMEOUT_MS = 45_000;
/** Cap Pass 1 completion length so autoregressive loops cannot emit 4k+ garbage tokens. */
export const VISION_MAX_OUTPUT_TOKENS = 1_500;
/** Retries for transient Azure rate-limits / gateway blips in multi-page queues. */
const MAX_TRANSIENT_RETRIES = 3;
const TRANSIENT_RETRY_BASE_MS = 1_200;

export function normalizeOpenAIBaseUrl(endpoint: string): string {
  let url = (endpoint ?? "").trim().replace(/\/+$/, "");
  if (!url) return "";
  // Accept resource root or /openai without /v1.
  if (/\/openai\/v1$/i.test(url)) return url;
  if (/\/openai$/i.test(url)) return `${url}/v1`;
  if (/services\.ai\.azure\.com$/i.test(url) || /openai\.azure\.com$/i.test(url)) {
    return `${url}/openai/v1`;
  }
  // Resource host from project URL: https://{resource}.services.ai.azure.com/api/projects/...
  const m = url.match(/^(https:\/\/[^/]+\.services\.ai\.azure\.com)/i);
  if (m) return `${m[1]}/openai/v1`;
  return url;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Azure OpenAI request timed out after ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull assistant text from a Responses API JSON body. */
export function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as Record<string, unknown>;

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const chunks: string[] = [];
  const output = body.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.text === "string") chunks.push(row.text);
      const content = row.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== "object") continue;
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") chunks.push(p.text);
          if (p.type === "output_text" && typeof p.text === "string") chunks.push(p.text);
        }
      }
    }
  }

  // Chat-completions-shaped fallback
  const choices = body.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: { content?: unknown } }).message;
    if (typeof msg?.content === "string") chunks.push(msg.content);
  }

  return chunks.join("\n").trim();
}

function extractAzureErrorMessage(json: unknown, fallbackText: string): string {
  if (typeof json === "object" && json && "error" in json) {
    const err = (json as { error?: { message?: unknown; code?: unknown } }).error;
    if (typeof err?.message === "string" && err.message.trim()) {
      return typeof err.code === "string" && err.code
        ? `${err.code}: ${err.message}`
        : err.message;
    }
  }
  return fallbackText.slice(0, 400);
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  const base = TRANSIENT_RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

/**
 * POST /openai/v1/responses — Azure OpenAI Responses API.
 * Retries transient 429/5xx so multi-page vision queues do not reject on one blip.
 */
export async function createOpenAIResponse(
  cfg: AzureOpenAIConfig,
  params: CreateResponsesParams,
): Promise<{ answer: string; raw: unknown }> {
  if (!cfg.apiKey?.trim()) throw new Error("Azure OpenAI api-key is empty");
  if (!cfg.deployment?.trim()) throw new Error("Azure OpenAI deployment name is empty");

  const url =
    (cfg.responsesUrl ?? "").trim() ||
    (() => {
      const base = normalizeOpenAIBaseUrl(cfg.baseUrl);
      if (!base) throw new Error("Azure OpenAI base URL is empty");
      return `${base}/responses`;
    })();

  const timeout =
    cfg.timeoutMs ??
    (typeof params.input !== "string" ? VISION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    model: cfg.deployment,
    input: params.input,
  };
  if (params.instructions && !cfg.omitInstructions) {
    body.instructions = params.instructions;
  }
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  if (typeof params.max_output_tokens === "number") {
    body.max_output_tokens = params.max_output_tokens;
  }

  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey.trim(),
      Authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, requestInit, timeout);
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Azure OpenAI responses: non-JSON (${res.status}) ${text.slice(0, 300)}`,
        );
      }

      if (!res.ok) {
        const errMsg = extractAzureErrorMessage(json, text);
        const error = new Error(`Azure OpenAI responses failed: ${res.status} ${errMsg}`);
        if (isTransientHttpStatus(res.status) && attempt < MAX_TRANSIENT_RETRIES - 1) {
          lastError = error;
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw error;
      }

      const answer = extractResponsesText(json);
      if (!answer) {
        throw new Error("Azure OpenAI responses completed without text output");
      }
      return { answer, raw: json };
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      const timedOut = /timed out/i.test(asError.message);
      const networkish =
        timedOut ||
        asError.name === "TypeError" ||
        /network|fetch failed|Failed to fetch/i.test(asError.message);
      if (networkish && attempt < MAX_TRANSIENT_RETRIES - 1) {
        lastError = asError;
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw asError;
    }
  }

  throw lastError ?? new Error("Azure OpenAI responses failed after retries");
}

/** Build multimodal user input for vision transcription. */
export function buildVisionResponsesInput(params: {
  prompt: string;
  imageDataUri: string;
}): ResponsesInputMessage[] {
  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: params.prompt },
        {
          type: "input_image",
          image_url: params.imageDataUri,
          detail: "high",
        },
      ],
    },
  ];
}
