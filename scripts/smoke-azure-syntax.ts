/**
 * Live smoke: Pass 2 syntax repair via Foundry Agent gpt5-mini (A2A / hybrid).
 *
 * Usage:
 *   npx tsx scripts/smoke-azure-syntax.ts [path/to/good.hsms]
 *
 * Default input: tmp/smoke-nunes1.hsms from Pass 1, or a built-in fragment.
 */
import fs from "node:fs";
import path from "node:path";

import {
  describeAzureAgentRouting,
  isAzureAgentConfigured,
} from "../services/azureAgentConfig";
import {
  formatDiagnosticsForRepair,
  runPassTwoRepair,
} from "../services/passTwoRepairService";
import { handleAgentVisionOutput } from "../utils/ingestAgentTranscription";
import { lintHsmsTranscription } from "../utils/hsmsLinter";

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

/** Introduce the failure modes Pass 2 must fix without modernizing spelling. */
function breakHsms(good: string): string {
  // Strip the proper envelope and emit empty {CB1.} + loose body (vision echo mode).
  const body = good
    .replace(/^\[fol\.[^\]]*\]\s*/i, "")
    .replace(/^\{CB\d+\.\s*/m, "")
    .replace(/\}\s*$/m, "")
    .trim();
  return `{CB1.}
[fol. 1]
${body}
{CB1.}
[fol. 1]
${body}
`;
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  loadDotEnv(path.join(root, ".env"));

  if (!isAzureAgentConfigured()) {
    console.error("Azure not configured.");
    process.exit(1);
  }

  const routing = describeAzureAgentRouting();
  console.log("Routing:", {
    transport: routing.transport,
    visionWire: routing.visionWire,
    syntaxViaFoundryAgent: routing.syntaxViaFoundryAgent,
    syntaxAgent: routing.syntaxAgent,
    syntaxDeployment: routing.syntaxDeployment,
    syntaxResponsesUrl: routing.syntaxResponsesUrl,
  });

  const inputRel = process.argv[2] ?? path.join("tmp", "smoke-nunes1.hsms");
  const inputPath = path.isAbsolute(inputRel) ? inputRel : path.join(root, inputRel);
  const good = fs.existsSync(inputPath)
    ? fs.readFileSync(inputPath, "utf8")
    : `[fol. 1]
{CB1.
1 {IN4.} Tratado da sphera
2 com a Theorica do Sol & da
3 Lua.
}`;

  const broken = breakHsms(good);
  const before = lintHsmsTranscription(broken);
  console.log("Broken input lint:", {
    isValid: before.isValid,
    errorCount: before.errorCount,
    codes: [...new Set(before.criticalErrors.map((e) => e.code).filter(Boolean))],
  });

  if (before.isValid) {
    console.error("Expected broken input to fail lint — aborting.");
    process.exit(1);
  }

  const diagnostics = formatDiagnosticsForRepair(before.criticalErrors);
  console.log(`Pass 2: syntax repair (${diagnostics.length} diagnostics)…`);
  const t0 = Date.now();
  const repaired = await runPassTwoRepair(broken, diagnostics);
  console.log(`Pass 2 done in ${Date.now() - t0} ms`);

  if (!repaired?.trim()) {
    console.error("Pass 2 returned empty output.");
    process.exit(2);
  }

  const after = handleAgentVisionOutput(repaired);
  const outPath = path.join(root, "tmp", "smoke-nunes1-repaired.hsms");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, after.hsmsAscii, "utf8");

  console.log("--- Repaired HSMS (first 1200 chars) ---");
  console.log(after.hsmsAscii.slice(0, 1200));
  console.log("---");
  console.log(
    JSON.stringify(
      {
        isValid: after.isValid,
        errorCount: after.lintReport.errorCount,
        warningCount: after.lintReport.warningCount,
        critical: after.criticalErrors.map((e) => e.message).slice(0, 8),
        outPath: path.relative(root, outPath),
        chars: after.hsmsAscii.length,
        preservedSample: /Tratado da sphera/i.test(after.hsmsAscii),
        noEmptyCbTag: !/^\{CB\d+\.\}\s*$/m.test(after.hsmsAscii),
      },
      null,
      2,
    ),
  );

  if (!after.isValid) process.exit(3);
}

main().catch((err) => {
  console.error("Syntax smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
