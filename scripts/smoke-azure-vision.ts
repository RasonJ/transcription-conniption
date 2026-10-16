/**
 * Live smoke: Azure OpenAI Responses vision → HSMS on a page image.
 *
 * Usage:
 *   npx tsx scripts/smoke-azure-vision.ts [path/to/image.png]
 *
 * Loads .env from repo root. Never prints the api-key.
 */
import fs from "node:fs";
import path from "node:path";

import {
  describeAzureAgentRouting,
  isAzureAgentConfigured,
} from "../services/azureAgentConfig";
import {
  chatWithAzureAgent,
  SYNTAX_REPAIR_INTENT,
  VISION_OCR_INTENT,
} from "../services/azureAgentOrchestrator";
import { extractHsmsAsciiPayload } from "../utils/hsmsAsciiPayload";
import { handleAgentVisionOutput } from "../utils/ingestAgentTranscription";

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function mimeFor(filePath: string): string {
  if (/\.png$/i.test(filePath)) return "image/png";
  if (/\.webp$/i.test(filePath)) return "image/webp";
  if (/\.gif$/i.test(filePath)) return "image/gif";
  return "image/jpeg";
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  loadDotEnv(path.join(root, ".env"));

  const imageRel =
    process.argv[2] ?? path.join("assets", "examples", "nunes1.png");
  const imagePath = path.isAbsolute(imageRel)
    ? imageRel
    : path.join(root, imageRel);

  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  if (!isAzureAgentConfigured()) {
    console.error(
      "Azure not configured. Set EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT, deployments, and EXPO_PUBLIC_AZURE_AGENT_API_KEY in .env",
    );
    process.exit(1);
  }

  const routing = describeAzureAgentRouting();
  console.log("Routing:", {
    transport: routing.transport,
    openAiEndpoint: routing.openAiEndpoint,
    visionDeployment: routing.visionDeployment,
    syntaxDeployment: routing.syntaxDeployment,
    apiKeyPresent: Boolean(
      (process.env.EXPO_PUBLIC_AZURE_AGENT_API_KEY ?? "").trim(),
    ),
  });

  const bytes = fs.readFileSync(imagePath);
  const dataUri = `data:${mimeFor(imagePath)};base64,${bytes.toString("base64")}`;
  console.log(
    `Image: ${path.relative(root, imagePath)} (${bytes.length} bytes, data URI ${dataUri.length} chars)`,
  );

  const prompt =
    `Transcribe the attached manuscript page image (1) into strict HSMS ASCII immediately. ` +
    `Read the image directly — no file_search, no questions, no Markdown fences, no duplicate output. ` +
    `Hint language: POR. ` +
    `Emit [fol. 1] once, then ONE multiline column envelope:\n` +
    `[fol. 1]\n{CB1.\n1 {IN4.} Tratado…\n2 …\n}\n` +
    `Never emit an empty {CB1.} tag. Keep {RUB.}/{INn.}/{ILL.} inside the envelope. ` +
    `Return only raw HSMS markup.`;

  console.log("Pass 1: vision OCR…");
  const t0 = Date.now();
  const response = await chatWithAzureAgent({
    query: prompt,
    screen: "Studio",
    persona: "paleographer",
    locale: "pt",
    intent_key: VISION_OCR_INTENT,
    folio_id: "1",
    language_hint: "POR",
    image_uri: dataUri,
    vision: true,
    agent_role: "vision",
    session_entities: {
      demo_date: "1537-01-01",
      locale: "pt",
      witness: "nunes_rotunda",
    },
  });
  console.log(`Pass 1 done in ${Date.now() - t0} ms via ${response.tool_executed}`);

  if (!response?.answer?.trim()) {
    console.error("Pass 1 Vision OCR returned an empty or invalid response.");
    process.exit(2);
  }

  let ingested = handleAgentVisionOutput(response.answer);
  let repaired = false;

  if (!ingested.isValid && ingested.criticalErrors.length > 0) {
    console.log(
      `Lint failed (${ingested.criticalErrors.length} critical). Pass 2 syntax repair…`,
    );
    const lintLines = ingested.criticalErrors.map((e) => {
      const line = typeof e.lineIndex === "number" ? `L${e.lineIndex + 1}` : "L?";
      return `${line}: ${e.message}`;
    });
    const repairPrompt = `You are a strict HSMS structural syntax repair tool.

### LINT DIAGNOSTIC ERRORS DETECTED:
${lintLines.join("\n")}

### RAW HSMS TEXT TO REPAIR:
${ingested.hsmsAscii}

### REPAIR INSTRUCTIONS:
1. Fix ONLY the structural markup syntax errors listed above.
2. DO NOT alter historical spelling.
3. Output ONLY the repaired HSMS ASCII — no Markdown fences.`;

    const t1 = Date.now();
    const repair = await chatWithAzureAgent({
      query: repairPrompt,
      screen: "Studio",
      persona: "linter_corrector",
      intent_key: SYNTAX_REPAIR_INTENT,
      agent_role: "syntax",
    });
    console.log(`Pass 2 done in ${Date.now() - t1} ms via ${repair.tool_executed}`);
    ingested = handleAgentVisionOutput(extractHsmsAsciiPayload(repair.answer));
    repaired = true;
  }

  const outPath = path.join(root, "tmp", "smoke-nunes1.hsms");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ingested.hsmsAscii, "utf8");

  console.log("--- HSMS (first 1200 chars) ---");
  console.log(ingested.hsmsAscii.slice(0, 1200));
  console.log("---");
  console.log(
    JSON.stringify(
      {
        isValid: ingested.isValid,
        errorCount: ingested.lintReport.errorCount,
        warningCount: ingested.lintReport.warningCount,
        critical: ingested.criticalErrors.map((e) => e.message).slice(0, 8),
        repaired,
        outPath: path.relative(root, outPath),
        chars: ingested.hsmsAscii.length,
      },
      null,
      2,
    ),
  );

  if (!ingested.hsmsAscii.trim()) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
