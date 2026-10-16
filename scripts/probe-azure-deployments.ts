/**
 * Probe which Responses deployment names work on this resource.
 * Never prints the api-key.
 */
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
  const base = (process.env.EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
  const key = (process.env.EXPO_PUBLIC_AZURE_AGENT_API_KEY ?? "").trim();
  if (!base || !key) {
    console.error("Missing endpoint or api-key");
    process.exit(1);
  }
  const headers = {
    "Content-Type": "application/json",
    "api-key": key,
    Authorization: `Bearer ${key}`,
  };

  const modelsRes = await fetch(`${base}/models`, { headers });
  const modelsText = await modelsRes.text();
  console.log("GET /models", modelsRes.status);
  if (modelsRes.ok) {
    try {
      const json = JSON.parse(modelsText) as { data?: Array<{ id?: string }> };
      const ids = (json.data ?? []).map((d) => d.id).filter(Boolean);
      console.log("model ids:", ids.join(", ") || "(none)");
    } catch {
      console.log(modelsText.slice(0, 400));
    }
  } else {
    console.log(modelsText.slice(0, 300));
  }

  const candidates = [
    process.env.EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX || "gpt-5-mini",
    process.env.EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION || "gpt-4o",
    "gpt-5-mini",
    "gpt-5.4-mini",
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-5-mini-2025-08-07",
    "gpt-4.1-mini",
    "o4-mini",
  ];
  const seen = new Set<string>();
  for (const model of candidates) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    const r = await fetch(`${base}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: "Reply with the single word OK." }),
    });
    const t = await r.text();
    let detail = t.slice(0, 160).replace(/\s+/g, " ");
    try {
      const j = JSON.parse(t) as { error?: { message?: string }; output_text?: string };
      detail = j.error?.message ?? j.output_text ?? detail;
    } catch {
      /* keep */
    }
    console.log(`${r.ok ? "OK " : "ERR"} ${model} → ${r.status} ${detail}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
