/**
 * Expo env for Azure AI Foundry / Azure OpenAI (HSMS).
 *
 * Preferred transport (Foundry sample + Agents list):
 *   EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT     — https://{resource}.services.ai.azure.com/openai/v1
 *   EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION   — gpt-4o  (Pass 1 image → HSMS via Responses)
 *   EXPO_PUBLIC_AZURE_AGENT_API_KEY       — api-key (never commit)
 *
 * Pass 2 syntax uses Foundry Agent `hsms-agent-607kfp6kw1-gpt5-mini`
 * (portal name). Its bound model id is `gpt-5.4-mini` — required by Azure when
 * posting to the agent Responses protocol.
 *
 *   EXPO_PUBLIC_AZURE_TRANSPORT=openai|a2a|hybrid
 *     openai  — both roles via resource `/openai/v1/responses`
 *     a2a     — both roles via Foundry Agents A2A (requires a2a protocol enabled)
 *     hybrid  — vision=resource gpt-4o; syntax=agent Responses (gpt5-mini agent) [default]
 *
 *   EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX — model id for the syntax agent (gpt-5.4-mini)
 */

export type AzureAgentRole = "vision" | "syntax";
/** Global preference; per-role resolution via getAzureTransportForRole. */
export type AzureTransport = "openai" | "a2a" | "hybrid";

const DEFAULT_RESOURCE_HOST = "https://jason-hsms-1907-resource.services.ai.azure.com";
const DEFAULT_PROJECT = `${DEFAULT_RESOURCE_HOST}/api/projects/jason-hsms-1907`;
const DEFAULT_OPENAI = `${DEFAULT_RESOURCE_HOST}/openai/v1`;
const DEFAULT_VISION_DEPLOYMENT = "gpt-4o";
/**
 * Model id bound to Foundry Agent hsms-agent-607kfp6kw1-gpt5-mini.
 * (Agent display name says gpt5-mini; Azure requires this exact model string.)
 */
const DEFAULT_SYNTAX_DEPLOYMENT = "gpt-5.4-mini";
const DEFAULT_VISION_AGENT = "hsms-agent-q0rwhx433x-gpt-4o";
const DEFAULT_SYNTAX_AGENT = "hsms-agent-607kfp6kw1-gpt5-mini";

/**
 * Literal `process.env.EXPO_PUBLIC_*` reads only — Metro inlines these at export time.
 * Dynamic `process.env[name]` stays empty in the browser and breaks static deploys.
 */
const PUBLIC_ENV = {
  EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT: process.env.EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT,
  EXPO_PUBLIC_AZURE_AGENT_ENDPOINT: process.env.EXPO_PUBLIC_AZURE_AGENT_ENDPOINT,
  EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT: process.env.EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT,
  EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION: process.env.EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION,
  EXPO_PUBLIC_AZURE_MODEL_VISION: process.env.EXPO_PUBLIC_AZURE_MODEL_VISION,
  EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX: process.env.EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX,
  EXPO_PUBLIC_AZURE_MODEL_SYNTAX: process.env.EXPO_PUBLIC_AZURE_MODEL_SYNTAX,
  EXPO_PUBLIC_AZURE_AGENT_VISION: process.env.EXPO_PUBLIC_AZURE_AGENT_VISION,
  EXPO_PUBLIC_AZURE_AGENT_1: process.env.EXPO_PUBLIC_AZURE_AGENT_1,
  EXPO_PUBLIC_AZURE_AGENT_SYNTAX: process.env.EXPO_PUBLIC_AZURE_AGENT_SYNTAX,
  EXPO_PUBLIC_AZURE_AGENT_2: process.env.EXPO_PUBLIC_AZURE_AGENT_2,
  EXPO_PUBLIC_AZURE_AGENT_API_KEY: process.env.EXPO_PUBLIC_AZURE_AGENT_API_KEY,
  EXPO_PUBLIC_AZURE_OPENAI_API_KEY: process.env.EXPO_PUBLIC_AZURE_OPENAI_API_KEY,
  EXPO_PUBLIC_AZURE_DEMO_MODE: process.env.EXPO_PUBLIC_AZURE_DEMO_MODE,
  EXPO_PUBLIC_AZURE_TRANSPORT: process.env.EXPO_PUBLIC_AZURE_TRANSPORT,
} as const;

function env(name: keyof typeof PUBLIC_ENV): string {
  return (PUBLIC_ENV[name] ?? "").trim();
}

/** Project root (Agents UI / A2A). */
export function getAzureProjectEndpoint(): string {
  const raw =
    env("EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT") ||
    stripAgentPath(env("EXPO_PUBLIC_AZURE_AGENT_ENDPOINT")) ||
    DEFAULT_PROJECT;
  return raw.replace(/\/+$/, "");
}

/** OpenAI-compatible Responses base (`…/openai/v1`). */
export function getAzureOpenAIEndpoint(): string {
  const raw = env("EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT");
  if (raw) return normalizeOpenAIEndpointLocal(raw);
  // Derive from project / resource host when unset.
  const project = getAzureProjectEndpoint();
  const host = project.match(/^(https:\/\/[^/]+\.services\.ai\.azure\.com)/i);
  if (host) return `${host[1]}/openai/v1`;
  return DEFAULT_OPENAI;
}

function normalizeOpenAIEndpointLocal(endpoint: string): string {
  let url = endpoint.replace(/\/+$/, "");
  if (/\/openai\/v1$/i.test(url)) return url;
  if (/\/openai$/i.test(url)) return `${url}/v1`;
  const host = url.match(/^(https:\/\/[^/]+\.services\.ai\.azure\.com)/i);
  if (host) return `${host[1]}/openai/v1`;
  return url;
}

/** Deployment for Pass 1 vision (sample: gpt-4o). */
export function getAzureVisionDeployment(): string {
  return (
    env("EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION") ||
    env("EXPO_PUBLIC_AZURE_MODEL_VISION") ||
    DEFAULT_VISION_DEPLOYMENT
  );
}

/** Deployment for Pass 2 syntax / post-processing. */
export function getAzureSyntaxDeployment(): string {
  return (
    env("EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX") ||
    env("EXPO_PUBLIC_AZURE_MODEL_SYNTAX") ||
    DEFAULT_SYNTAX_DEPLOYMENT
  );
}

export function getAzureDeploymentForRole(role: AzureAgentRole): string {
  return role === "syntax" ? getAzureSyntaxDeployment() : getAzureVisionDeployment();
}

/** Vision Foundry agent name (A2A fallback). */
export function getAzureVisionAgentName(): string {
  return (
    env("EXPO_PUBLIC_AZURE_AGENT_VISION") ||
    env("EXPO_PUBLIC_AZURE_AGENT_1") ||
    DEFAULT_VISION_AGENT
  );
}

/** Syntax Foundry agent name (A2A fallback). */
export function getAzureSyntaxAgentName(): string {
  return (
    env("EXPO_PUBLIC_AZURE_AGENT_SYNTAX") ||
    env("EXPO_PUBLIC_AZURE_AGENT_2") ||
    DEFAULT_SYNTAX_AGENT
  );
}

export function getAzureAgentApiKey(): string {
  return env("EXPO_PUBLIC_AZURE_AGENT_API_KEY") || env("EXPO_PUBLIC_AZURE_OPENAI_API_KEY");
}

export function isAzureDemoMode(): boolean {
  const raw = env("EXPO_PUBLIC_AZURE_DEMO_MODE").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getAzureTransport(): AzureTransport {
  const raw = env("EXPO_PUBLIC_AZURE_TRANSPORT").toLowerCase();
  if (raw === "a2a") return "a2a";
  if (raw === "openai") return "openai";
  if (raw === "hybrid") return "hybrid";
  // Default: vision via Responses (gpt-4o), syntax via Foundry Agent (gpt5-mini).
  return getAzureOpenAIEndpoint() ? "hybrid" : "a2a";
}

/**
 * Resolve wire protocol for a role.
 * hybrid → both use Responses API; syntax posts to the Foundry agent endpoint
 * (A2A is not enabled on the gpt5-mini agent in this project).
 */
export function getAzureTransportForRole(role: AzureAgentRole): "openai" | "a2a" {
  const mode = getAzureTransport();
  if (mode === "a2a") return "a2a";
  // openai + hybrid both use Responses (resource or agent URL).
  void role;
  return "openai";
}

/** True when syntax should hit the Foundry agent Responses protocol URL. */
export function useFoundryAgentResponses(role: AzureAgentRole): boolean {
  return getAzureTransport() === "hybrid" && role === "syntax";
}

/**
 * Foundry agent OpenAI Responses URL
 * (`…/agents/{name}/endpoint/protocols/openai/responses?api-version=v1`).
 */
export function buildAzureAgentResponsesUrl(agentName: string): string {
  const project = getAzureProjectEndpoint();
  const name = (agentName ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!project || !name) return "";
  return `${project}/agents/${encodeURIComponent(name)}/endpoint/protocols/openai/responses?api-version=v1`;
}

export function getAzureAgentResponsesUrlForRole(role: AzureAgentRole): string {
  const name = role === "syntax" ? getAzureSyntaxAgentName() : getAzureVisionAgentName();
  return buildAzureAgentResponsesUrl(name);
}

export function stripAgentPath(endpoint: string): string {
  const url = (endpoint ?? "").trim().replace(/\/+$/, "");
  if (!url) return "";
  return url.replace(/\/agents\/[^/]+(?:\/endpoint)?(?:\/protocols\/[^/]+)?$/i, "");
}

export function buildAzureAgentA2AUrl(projectOrAgentEndpoint: string, agentName?: string): string {
  let base = (projectOrAgentEndpoint ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/\/agents\/[^/]+\/endpoint/i.test(base) || /\/protocols\/a2a$/i.test(base)) {
    return base;
  }
  const name = (agentName ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!name) return base;
  const project = stripAgentPath(base) || base;
  return `${project}/agents/${encodeURIComponent(name)}/endpoint/protocols/a2a`;
}

export function getAzureAgentEndpointForRole(role: AzureAgentRole): string {
  const legacyFull = env("EXPO_PUBLIC_AZURE_AGENT_ENDPOINT");
  const project = getAzureProjectEndpoint();
  if (role === "syntax") {
    return buildAzureAgentA2AUrl(project, getAzureSyntaxAgentName());
  }
  const hasExplicitProject = Boolean(env("EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT"));
  const hasExplicitVision = Boolean(
    env("EXPO_PUBLIC_AZURE_AGENT_VISION") || env("EXPO_PUBLIC_AZURE_AGENT_1"),
  );
  if (legacyFull && /\/agents\//i.test(legacyFull) && !hasExplicitProject && !hasExplicitVision) {
    return legacyFull;
  }
  return buildAzureAgentA2AUrl(project, getAzureVisionAgentName());
}

/** @deprecated Prefer getAzureAgentEndpointForRole("vision") */
export function getAzureAgentEndpoint(): string {
  return getAzureAgentEndpointForRole("vision");
}

export function isAzureAgentConfigured(): boolean {
  const hasKey = Boolean(getAzureAgentApiKey());
  const visionWire = getAzureTransportForRole("vision");
  const syntaxWire = getAzureTransportForRole("syntax");
  const visionOk =
    visionWire === "openai"
      ? Boolean(getAzureOpenAIEndpoint() && getAzureVisionDeployment())
      : Boolean(getAzureAgentEndpointForRole("vision"));
  const syntaxOk = useFoundryAgentResponses("syntax")
    ? Boolean(getAzureAgentResponsesUrlForRole("syntax") && getAzureSyntaxDeployment())
    : syntaxWire === "openai"
      ? Boolean(getAzureOpenAIEndpoint() && getAzureSyntaxDeployment())
      : Boolean(getAzureAgentEndpointForRole("syntax"));
  const hasEndpoint = visionOk && syntaxOk;
  if (hasEndpoint && !hasKey) {
    console.warn(
      "[HSMS Copilot] EXPO_PUBLIC_AZURE_AGENT_API_KEY is not set. " +
        "Add your Azure AI api-key to .env and restart Expo.",
    );
  }
  return hasEndpoint && hasKey;
}

export function describeAzureAgentRouting(): {
  transport: AzureTransport;
  visionWire: "openai" | "a2a";
  syntaxWire: "openai" | "a2a";
  syntaxViaFoundryAgent: boolean;
  openAiEndpoint: string;
  visionDeployment: string;
  syntaxDeployment: string;
  project: string;
  visionAgent: string;
  syntaxAgent: string;
  visionEndpoint: string;
  syntaxEndpoint: string;
  syntaxResponsesUrl: string;
} {
  return {
    transport: getAzureTransport(),
    visionWire: getAzureTransportForRole("vision"),
    syntaxWire: getAzureTransportForRole("syntax"),
    syntaxViaFoundryAgent: useFoundryAgentResponses("syntax"),
    openAiEndpoint: getAzureOpenAIEndpoint(),
    visionDeployment: getAzureVisionDeployment(),
    syntaxDeployment: getAzureSyntaxDeployment(),
    project: getAzureProjectEndpoint(),
    visionAgent: getAzureVisionAgentName(),
    syntaxAgent: getAzureSyntaxAgentName(),
    visionEndpoint: getAzureAgentEndpointForRole("vision"),
    syntaxEndpoint: getAzureAgentEndpointForRole("syntax"),
    syntaxResponsesUrl: getAzureAgentResponsesUrlForRole("syntax"),
  };
}
