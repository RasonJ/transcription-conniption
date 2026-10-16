/** Probe Foundry agent Responses protocol (no api-key printed). */
import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.replace(/^export\s+/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadDotEnv(path.join(__dirname, "..", ".env"));
  const key = (process.env.EXPO_PUBLIC_AZURE_AGENT_API_KEY ?? "").trim();
  const project = (process.env.EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT ?? "").replace(/\/+$/, "");
  const agent = process.env.EXPO_PUBLIC_AZURE_AGENT_SYNTAX ?? "hsms-agent-607kfp6kw1-gpt5-mini";
  const headers = {
    "api-key": key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // Agent card says gpt5-mini; Azure requires model id gpt-5.4-mini on this agent.
  const url = `${project}/agents/${agent}/endpoint/protocols/openai/responses?api-version=v1`;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      input: "Reply with the single word OK.",
    }),
  });
  const t = await r.text();
  console.log(`POST ${r.status} agent-responses gpt-5.4-mini → ${t.slice(0, 500).replace(/\s+/g, " ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
