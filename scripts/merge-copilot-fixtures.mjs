#!/usr/bin/env node
/**
 * Idempotent merge of scriptorium demo fixtures into assets/scriptorium-offline.json.
 * Existing fixture fields win; missing keys and variant strings are filled in.
 *
 *   node scripts/merge-copilot-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomicSync } from "./lib/fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "..", "assets", "scriptorium-offline.json");

function mergeFixtures(existing, incoming) {
  const out = { ...existing };
  for (const [key, next] of Object.entries(incoming)) {
    const prev = out[key];
    if (!prev || typeof prev !== "object") {
      out[key] = next;
      continue;
    }
    const variants = [...new Set([...(prev.variants ?? []), ...(next.variants ?? [])])];
    out[key] = {
      ...next,
      ...prev,
      response_markdown: prev.response_markdown || next.response_markdown,
      mcp_tool: prev.mcp_tool ?? next.mcp_tool,
      scene: prev.scene ?? next.scene,
      response: prev.response ?? next.response,
      variants,
    };
  }
  return out;
}

const NEW = {
  panel1_flagged_folios: {
    scene: "ingest_queue",
    mcp_tool: "get_today_queue",
    response_markdown:
      "Three of today's six assigned folio sides require immediate attention:\n\n" +
      "• **1r** — Low recognition confidence (0.42)\n" +
      "• **3v** — Empty column envelope `{CB2.}`\n" +
      "• **5r** — Unreviewed machine transcription (14 lines)",
    response: { filter: "action_required", flagged_count: 3 },
    variants: [
      "flagged folios today",
      "folios needing attention",
      "unreviewed sidecar sides",
      "low confidence lines today",
    ],
  },
  panel1_status_meanings: {
    scene: "ingest_queue",
    mcp_tool: "__local__",
    response_markdown:
      "Ingest status badges:\n\n" +
      "**Unreviewed** — machine-transcribed, awaiting human sign-off\n" +
      "**Low confidence** — OCR/HTR score below threshold\n" +
      "**Lint blocked** — structural HSMS barrier prevents export\n" +
      "**Reviewed** — folio side cleared for edit / export\n" +
      "**Pass-two pending** — repair queue after recognition",
    variants: [
      "what does unreviewed mean",
      "ingest status badges",
      "low confidence meaning",
    ],
  },
  panel2_preflight_breakdown: {
    scene: "validate",
    mcp_tool: "audit_hsms_syntax",
    response_markdown:
      "**Witness preflight**\n\n" +
      "• Folio markers: **12** `[fol. …]`\n" +
      "• Column envelopes: **24** `{CBn. …}`\n" +
      "• Empty envelopes: **1** `{CB2.}` on **3v**\n" +
      "• Barriers blocking TEI: **EMPTY_COLUMN_ENVELOPE**\n" +
      "• **Export TEI: blocked until repair**",
    response: {
      card_kind: "preflight",
      status: "blocked",
      barrier_ids: ["EMPTY_COLUMN_ENVELOPE"],
      empty_envelopes: 1,
      folio_markers: 12,
    },
    variants: [
      "preflight this transcription",
      "why is export blocked",
      "run structural lint",
      "validation errors",
    ],
  },
  panel2_term_frequency: {
    scene: "analyze",
    mcp_tool: "__local__",
    response_markdown:
      "**Term frequency — `muito`**\n\n" +
      "• Occurrences: **47**\n" +
      "• Folios: **1r–8v**\n" +
      "• Top context: `muito sabio` (12×)\n\n" +
      "Open KWIC for keyword-in-context rows.",
    response: { word: "muito", count: 47, amount_tokens: 47 },
    variants: [
      "how many times is muito",
      "cuántas veces aparece muito",
      "word count of muito",
      "contagem de muito",
    ],
  },
  panel3_catchwords: {
    scene: "analyze",
    mcp_tool: "__local__",
    response_markdown:
      "**Catchwords (reclamos)**\n\n" +
      "• **4v** → `et dixit`\n" +
      "• **8v** → `dominus noster`\n" +
      "• **12v** → `amen`\n\n" +
      "Three catchwords locate quire boundaries.",
    response: { catchword_count: 3 },
    variants: [
      "locate all catchwords",
      "list reclamos",
      "show catchwords at folio feet",
    ],
  },
  panel3_export_chips: {
    scene: "export",
    mcp_tool: "__local__",
    response_markdown:
      "Ready exports once barriers clear:\n\n" +
      "• **TEI P5** — structured witness with folio/line ids\n" +
      "• **SVG facsimile** — page rendering with ornate initials\n" +
      "• **CSV** — hapax / frequency tables",
    variants: [
      "export tei",
      "download svg",
      "export hapax csv",
    ],
  },
};

let data = { version: "1.0.0-hsms", fixtures: {} };
if (fs.existsSync(target)) {
  try {
    data = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    console.warn("[merge-copilot-fixtures] corrupt offline file — recreating");
  }
}

const fixtures = mergeFixtures(data.fixtures ?? {}, NEW);
const out = {
  ...data,
  version: data.version ?? "1.0.0-hsms",
  domain: "hsms_scriptorium",
  fixtures,
  merged_at: new Date().toISOString(),
};
writeJsonAtomicSync(target, out);
console.log(
  `[merge-copilot-fixtures] fixtures=${Object.keys(fixtures).length} → ${path.relative(path.join(__dirname, ".."), target)}`,
);
