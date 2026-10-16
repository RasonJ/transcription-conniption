/**
 * Azure AI Foundry A2A wire client (ported from XEN shared azureA2A).
 *
 * Wire flow (non-streaming, A2A v0.3):
 *   1. GET  {base}/agentCard/v0.3
 *   2. POST {agentCard.url}  → JSON-RPC message/send → Task
 *   3. Poll tasks/get until completed (demo ≤6 × 1.5 s / prod ≤30 × 1.5 s)
 *   4. Extract text from artifacts → status.message → history
 */

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "unknown";

export interface A2ATextPart {
  kind: "text";
  text: string;
}

export interface A2ADataPart {
  kind: "data";
  data: Record<string, unknown>;
  mimeType?: string;
}

export type A2APart = A2ATextPart | A2ADataPart;

export interface A2AMessage {
  kind: "message";
  messageId: string;
  role: "user" | "agent";
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  parts: A2APart[];
}

export interface A2ATask {
  id: string;
  status: { state: A2ATaskState; message?: A2AMessage } | A2ATaskState;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
}

export interface A2AAgentCard {
  url: string;
  name?: string;
  description?: string;
  capabilities?: Record<string, unknown>;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  result?: T;
  error?: { code: number; message: string; data?: unknown };
  id: string | number;
}

export type A2AConfig = {
  endpoint: string;
  apiKey: string;
  /** Demo airlock: shorter poll budget. */
  demoMode?: boolean;
  /** Override message/send timeout (vision jobs need longer). */
  sendTimeoutMs?: number;
};

export const A2A_CARD_TIMEOUT_MS = 8_000;
export const A2A_SEND_TIMEOUT_MS = 45_000;
export const A2A_VISION_SEND_TIMEOUT_MS = 180_000;
export const A2A_POLL_TIMEOUT_MS = 10_000;

export function isA2AConfigured(cfg: Partial<A2AConfig>): boolean {
  return Boolean(cfg.endpoint?.trim()) && Boolean(cfg.apiKey?.trim());
}

export function a2aTaskState(task: A2ATask): A2ATaskState {
  return typeof task.status === "object" ? task.status.state : task.status;
}

function statusMessageParts(task: A2ATask): A2APart[] {
  if (typeof task.status !== "object" || !task.status.message?.parts) return [];
  return task.status.message.parts;
}

/** Accepts the A2A base, the agent root, or the old openai/responses URL. */
export function a2aBaseUrl(endpoint: string): string {
  let url = (endpoint ?? "").trim().replace(/\/+$/, "");
  url = url.replace(/\/protocols\/openai\/responses$/, "/protocols/a2a");
  if (!url.endsWith("/protocols/a2a")) url = `${url}/protocols/a2a`;
  return url;
}

function headers(cfg: A2AConfig): Record<string, string> {
  return { "Content-Type": "application/json", "api-key": (cfg.apiKey ?? "").trim() };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Azure A2A request timed out after ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const cardCache = new Map<string, A2AAgentCard>();

export async function getA2AAgentCard(
  cfg: A2AConfig,
  baseUrl: string = a2aBaseUrl(cfg.endpoint),
): Promise<A2AAgentCard> {
  const hit = cardCache.get(baseUrl);
  if (hit) return hit;
  const res = await fetchWithTimeout(
    `${baseUrl}/agentCard/v0.3`,
    { method: "GET", headers: { "api-key": (cfg.apiKey ?? "").trim() } },
    A2A_CARD_TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Agent card fetch failed: ${res.status} ${body.slice(0, 400) || res.statusText}`);
  }
  const card = (await res.json()) as A2AAgentCard;
  cardCache.set(baseUrl, card);
  return card;
}

export function resetA2ACardCache(): void {
  cardCache.clear();
}

export async function sendA2AMessage(
  cfg: A2AConfig,
  agentUrl: string,
  text: string,
  extraParts: A2APart[] = [],
): Promise<A2ATask> {
  const parts: A2APart[] = [{ kind: "text", text }, ...extraParts];
  const body = {
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        kind: "message",
        messageId: makeId(),
        role: "user",
        parts,
      } as A2AMessage,
    },
    id: makeId(),
  };
  const timeout = cfg.sendTimeoutMs ?? A2A_SEND_TIMEOUT_MS;
  const res = await fetchWithTimeout(
    agentUrl,
    { method: "POST", headers: headers(cfg), body: JSON.stringify(body) },
    timeout,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`A2A message/send failed: ${res.status} ${errText.slice(0, 400)}`);
  }
  const rpc = (await res.json()) as JsonRpcResponse<A2ATask>;
  if (rpc.error) throw new Error(`A2A RPC error ${rpc.error.code}: ${rpc.error.message}`);
  if (!rpc.result) throw new Error("A2A message/send: response has no result");
  return rpc.result;
}

export async function pollA2ATask(cfg: A2AConfig, agentUrl: string, taskId: string): Promise<A2ATask> {
  const maxPolls = cfg.demoMode ? 6 : 40;
  const pollMs = 1_500;
  for (let i = 0; i < maxPolls; i++) {
    const body = { jsonrpc: "2.0", method: "tasks/get", params: { id: taskId }, id: makeId() };
    const res = await fetchWithTimeout(
      agentUrl,
      { method: "POST", headers: headers(cfg), body: JSON.stringify(body) },
      A2A_POLL_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`tasks/get failed: ${res.status}`);
    const rpc = (await res.json()) as JsonRpcResponse<A2ATask>;
    if (rpc.error) throw new Error(`tasks/get RPC error: ${rpc.error.message}`);
    const task = rpc.result!;
    const state = a2aTaskState(task);
    if (state === "completed") return task;
    if (state === "failed" || state === "canceled") {
      throw new Error(`A2A task ended with state: ${state}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`A2A task polling timed out (${cfg.demoMode ? "9 s / demo" : "~60 s"})`);
}

export function extractA2AText(task: A2ATask): string {
  const artifactTexts = (task.artifacts ?? []).flatMap((a) =>
    a.parts.filter((p): p is A2ATextPart => p.kind === "text").map((p) => p.text),
  );
  if (artifactTexts.length > 0) return artifactTexts.join("\n\n");
  const statusTexts = statusMessageParts(task)
    .filter((p): p is A2ATextPart => p.kind === "text")
    .map((p) => p.text)
    .filter(Boolean);
  if (statusTexts.length > 0) return statusTexts.join("\n\n");
  const history = task.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "agent") {
      const t = history[i].parts
        .filter((p): p is A2ATextPart => p.kind === "text")
        .map((p) => p.text)
        .join("\n\n");
      if (t) return t;
    }
  }
  return "";
}

export function detectA2ATool(task: A2ATask): string | undefined {
  for (const artifact of task.artifacts ?? []) {
    if (artifact.name && artifact.name !== "text_response") return artifact.name;
    for (const part of artifact.parts) {
      if (part.kind === "data") {
        const toolName = (part as A2ADataPart).data?.tool_name;
        if (typeof toolName === "string") return toolName;
      }
    }
  }
  return undefined;
}

/** One full turn: card → send → poll → text. */
export async function runA2ATurn(
  cfg: A2AConfig,
  text: string,
  extraParts: A2APart[] = [],
): Promise<{ answer: string; tool_executed?: string; task: A2ATask; agentUrl: string }> {
  const base = a2aBaseUrl(cfg.endpoint);
  const card = await getA2AAgentCard(cfg, base);
  const agentUrl = card.url ?? base;
  let task = await sendA2AMessage(cfg, agentUrl, text, extraParts);
  if (a2aTaskState(task) !== "completed") task = await pollA2ATask(cfg, agentUrl, task.id);
  const answer = extractA2AText(task).trim();
  if (!answer) throw new Error("A2A task completed without any text response");
  return { answer, tool_executed: detectA2ATool(task), task, agentUrl };
}
