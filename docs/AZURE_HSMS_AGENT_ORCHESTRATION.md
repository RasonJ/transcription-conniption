# Azure HSMS Agent Orchestration

> Transcription Conniption Copilot — Azure AI Foundry paleography stack (hybrid OpenAI Responses + optional A2A)  
> Pattern adapted from XEN dental-rcm (`clients/dental-rcm/services/azureAgentOrchestrator.ts`).

Related docs: [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md) (Foundry Instructions) · [ARCHITECTURE.md](ARCHITECTURE.md) (system map) · [HSMS-EDITOR.md](HSMS-EDITOR.md) (Studio UX) · [OSTA-guide.md](OSTA-guide.md)

## Purpose

Route **vision transcription** jobs (page scans / multi-page PDFs, typically the first ~25 leaves) to Azure and return **raw HSMS ASCII**. The Expo client always runs `ingestAgentTranscription` (lint → compile → enrich) before `applyTranscription` reloads the parchment / SvgFacsimile view.

Local Tier‑A recipes (facets, Voyant frequency, Proofer audit, **HTR cleanup** via `convert_htr_to_hsms`) stay on-device. Azure is the backoff path for:

| Pass | Role | Default target |
|------|------|----------------|
| **Pass 1** | Vision OCR → HSMS draft | Resource Responses **`gpt-4o`** |
| **Pass 2** | Structural syntax repair only | Foundry Agent **`hsms-agent-607kfp6kw1-gpt5-mini`** (bound model **`gpt-5.4-mini`**) |

Pass 2 runs **only** when the client linter reports critical errors. Clean pages never call the repair agent (avoids latency, cost, and orthographic drift).

## Agent vs client responsibility

LLMs excel at visual decipherment and paleographic resolution; they are weak at exact character counting and lossless AST work. Split the stack accordingly:

```
┌────────────────────────────────────────────────┐
│         PROMPT & AGENT MEMORY                  │
│  • HSMS grammar / syntax contracts             │
│  • Paleographic resolution (i/j, nn, <…>)      │
│  • Proofer + linter guidelines (text rules)    │
│    assets/agent-memory/hsms-agent-rules.txt    │
└──────────────────────┬─────────────────────────┘
                       │ raw draft ASCII
                       ▼
┌────────────────────────────────────────────────┐
│                   CLIENT CODE                  │
│  • Tokenization (`hsmsLexer.ts`)               │
│  • Spatial AST (`spatialAst.ts` / compiler)    │
│  • Deterministic lint (`hsmsLinter.ts`)        │
│  • Gate: `ingestAgentTranscription()`          │
│  • Batch Pass 2 consolidate (`passTwoRepair…`) │
└────────────────────────────────────────────────┘
```

| Keep in **agent** prompt / memory | Keep strictly in **client** code |
|-----------------------------------|----------------------------------|
| Paleographic grapheme resolution (`i`/`j`, tilde nasals, `<…>` vs `<<…>>`) | Sticky lexer / sentinel matching (`hsmsLexer.ts`) |
| Structural invariants (`{CB.}`, `{INn.}` single space, gloss forms) | Column zip / wrap-back layout (`spatialAst.ts`) |
| Proofer incident *guidelines* & edge cases | Final bracket-depth / unclosed-env audit (`hsmsLinter.ts`) |
| Self-check reminders before returning ASCII | Parchment / SvgFacsimile rendering |
| Pass 2 batch section wrappers (`=== PAGE N [fol. X] ===`) | Split / align repaired folios (`parseBatchRepairResponse`) |

**Never** outsource tokenization or AST rendering to the LLM. Always run `lintHsmsTranscription` (via `ingestAgentTranscription`) on the client after each agent reply.

## Transport (hybrid default)

`EXPO_PUBLIC_AZURE_TRANSPORT=hybrid` (see `.env.example`):

| Role | Wire | Notes |
|------|------|-------|
| Vision | `POST {resource}/openai/v1/responses` model `gpt-4o` | Multimodal `input_image` data-URI (or https) |
| Syntax | Foundry Agent Responses URL `…/agents/{syntax}/endpoint/protocols/openai/responses?api-version=v1` | Model id in payload must be **`gpt-5.4-mini`** (Agents UI name “gpt5-mini”); agent rejects client `instructions` / `temperature` |
| Fallback | If A2A vision fails under hybrid | Orchestrator retries OpenAI Responses multimodal |

Overrides: `EXPO_PUBLIC_AZURE_TRANSPORT=openai` (both roles on resource Responses) or `a2a` (legacy Agents protocol — requires A2A enabled on the agent).

`services/azureOpenAI.ts` adds timeouts, clean Azure error extraction, and retries on 429 / 5xx / network blips so multi-page queues do not fail on a single transient.

## Immediate vision execution (no questions)

1. **System prompt (Pass 1)** — paste `docs/prompt-hsms-transcriber.md` into Foundry (optional when using resource Responses; runtime re-anchors via `hsmsOpenAIInstructions.ts`). Includes CRITICAL EXECUTION DIRECTIVES, zero-modernization orthography, and structural HSMS rules.
2. **File search OFF** — in Azure AI Foundry agent settings / Playground, **uncheck File search** so page image tensors go straight to vision.
3. **Pass 1 request** — `transcribePageScan` / batch path sends `intent_key: "transcription.vision_ocr"`, `agent_role: "vision"`. `buildAzureAgentQuery` injects `bypass file_search` and suppresses chat history. System rules are **re-anchored** at the top of every vision/repair user frame.
4. **Client lint gate** — `ingestAgentTranscription` runs locally (~2 ms). If `isValid` / no critical errors → stream to parchment; **skip Pass 2**.
5. **Pass 2** — only on critical errors (see below).
6. **PDF slicer** — `utils/pdfPageExtractor.web.ts` applies page `/Rotate`, exports PNG/JPEG, then tears down canvas (`width/height = 0`) + `page.cleanup()` so long manuscripts do not retain GPU handles.

## Two-pass pipeline (single leaf)

Used by `transcribePageScan` for one image (Studio single-page / smoke):

```
Pass 1  image data-URI  →  intent: transcription.vision_ocr  →  gpt-4o  →  raw HSMS ASCII
                              │
                              ▼
                    ingestAgentTranscription (client)
                              │
              ┌───────────────┴───────────────┐
              │ 0 critical errors             │ critical errors
              ▼                               ▼
         apply / parchment      Pass 2  runPassTwoRepair
                                intent: transcription.syntax_repair
                                agent_role: syntax (gpt-5.4-mini)
                                              │
                                              ▼
                                   re-ingest → parchment
```

Sketch (matches `azureHsmsTranscriber.ts`):

```ts
const visionResult = await chatWithAzureAgent({
  query: prompt,
  image_uri: pageDataUri,
  intent_key: "transcription.vision_ocr",
  agent_role: "vision",
});

const ingested = ingestAgentTranscription(visionResult.answer);

if (!ingested.isValid && ingested.criticalErrors.length > 0) {
  const repaired = await runPassTwoRepair(
    ingested.hsmsAscii,
    formatDiagnosticsForRepair(ingested.criticalErrors),
  );
  // re-ingest repaired ASCII…
}
```

### Why skip Pass 2 on clean output

- Deterministic local verification already passed (`hsmsLinter` + `prooferIncidents`).
- Avoids 1–3 s latency and secondary completion tokens per page.
- Prevents repair-model over-correction (spelling modernization / dropped lines) on pages that need no structural fix.

## Batch repair architecture (multi-page PDF)

`processPdfBatchInBackground` consolidates diagnostics so **gpt-5.4-mini** (large context, fast output) repairs all flagged leaves in **one** turn:

```
[ Multi-Page PDF Queue ]
          │
          ▼
[ Pass 1: Vision Agent ] ──► Page 1, Page 2, … (stream; skipSyntaxRepair)
          │
          ▼
[ Local Linter & Proofer Auditor ] (~2 ms / page)
          │
   ┌──────┴─────────────────────────────────┐
   ▼                                        ▼
(Clean Pages)                      (Pages with Errors)
   │                                        │
   │ stream immediately            [ Consolidate Diagnostics ]
   │                                        │
   │                              [ Pass 2: runBatchPassTwoRepair ]
   │                                        │
   └──────────────────┬─────────────────────┘
                      ▼
        [ Stream Finalized Folios → merge ]
```

| Step | Behavior |
|------|----------|
| Pass 1 | `transcribePageScan({ skipSyntaxRepair: true })` per frame |
| Clean | `onFolioComplete` immediately (parchment paints without waiting) |
| Flagged | Collect `PageDiagnosticsPayload` (folio id, raw HSMS, diagnostic lines) |
| Pass 2 | Single `runBatchPassTwoRepair(flagged)` → parse `=== PAGE N [fol. X] ===` sections → re-ingest → stream |
| Failure | Log warn; fall back to Pass 1 ASCII for flagged pages |
| Progress | `TranscriptionProgressBar` phases: `slicing` → `transcribing` → `repairing` → `merging` |

Benefits: ~80%+ fewer Pass 2 API calls on typical manuscripts; clean pages render instantly; repair turn can see adjacent folios for continuum markers.

Implementation: `services/passTwoRepairService.ts` (`runBatchPassTwoRepair`, `parseBatchRepairResponse`, `alignBatchRepairResults`) · `services/batchTranscriptionService.ts`.

## Foundry setup checklist

1. Open resource **jason-hsms-1907-resource** — OpenAI endpoint `…/openai/v1`.
2. Confirm Responses deployment **`gpt-4o`** (vision) and Foundry Agent **`hsms-agent-607kfp6kw1-gpt5-mini`** (syntax / model `gpt-5.4-mini`) exist.
3. Optional Agents UI prompts: paste **`docs/prompt-hsms-transcriber.md`** into the vision agent; **File search OFF**.
4. Copy OpenAI endpoint + deployment names + api-key into `.env` (see `.env.example`; never commit the key).
5. Restart Expo with `--clear`. Prefer **Expo Web** for multi-page PDF slicing.
6. Optional: `EXPO_PUBLIC_AZURE_TRANSPORT=a2a` only if A2A is enabled on the agent.

## Agent memory rules (export)

```bash
npm run export:agent-memory
```

| Output | Purpose |
|--------|---------|
| `assets/agent-memory/hsms-agent-rules.txt` | Plain text for Foundry memory / `file_search` |
| `assets/agent-memory/hsms-agent-rules.json` | Full JSON catalog |
| `assets/agent-memory/hsms-linter-rules.json` | Linter + paleography subset |
| `assets/agent-memory/hsms-proofer-rules.json` | Proofer incident codes |
| `assets/agent-memory/README.md` | Upload notes |

Source of truth: `utils/hsmsAgentRuleCatalog.ts` (mirrors codes from `hsmsLinter.ts` + `prooferIncidents.ts`). Re-run after changing those modules.

## Environment variables

```bash
EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT=https://jason-hsms-1907-resource.services.ai.azure.com/openai/v1
EXPO_PUBLIC_AZURE_DEPLOYMENT_VISION=gpt-4o
EXPO_PUBLIC_AZURE_DEPLOYMENT_SYNTAX=gpt-5.4-mini
EXPO_PUBLIC_AZURE_AGENT_API_KEY=<api-key>
EXPO_PUBLIC_AZURE_TRANSPORT=hybrid
EXPO_PUBLIC_AZURE_PROJECT_ENDPOINT=https://jason-hsms-1907-resource.services.ai.azure.com/api/projects/jason-hsms-1907
EXPO_PUBLIC_AZURE_AGENT_VISION=hsms-agent-q0rwhx433x-gpt-4o
EXPO_PUBLIC_AZURE_AGENT_SYNTAX=hsms-agent-607kfp6kw1-gpt5-mini
EXPO_PUBLIC_AZURE_DEMO_MODE=false
```

> The Agents UI name says **gpt5-mini**; Azure binds that agent to model id **`gpt-5.4-mini`** (required in the Responses payload). A2A is not enabled on this agent — hybrid uses the agent’s `protocols/openai/responses` endpoint instead.

## Client modules

| File | Role |
|------|------|
| `services/azureOpenAI.ts` | `POST …/responses`; timeouts; 429/5xx retry; vision input builder |
| `services/azureAgentConfig.ts` | Expo env helpers; hybrid role routing |
| `services/azureAgentOrchestrator.ts` | Session context + `chatWithAzureAgent` (A2A→Responses vision fallback) |
| `services/hsmsOpenAIInstructions.ts` | Agent 1/2 prompts; re-anchored every vision/repair turn |
| `services/azureHsmsTranscriber.ts` | Single-leaf Pass 1 → ingest → optional `runPassTwoRepair` |
| `services/passTwoRepairService.ts` | `runPassTwoRepair` + **`runBatchPassTwoRepair`** |
| `services/batchTranscriptionService.ts` | PDF slice → Pass 1 stream → batched Pass 2 → merge |
| `hooks/useBatchTranscription.ts` | Live progress + `onCumulativeHsms` |
| `utils/ingestAgentTranscription.ts` | Strip → lint → compile → enrich gatekeeper |
| `utils/pdfPageExtractor.web.ts` | pdfjs-dist → canvas PNG/JPEG + memory teardown |
| `utils/pdfPageExtractor.ts` | Native stub / optional `react-native-pdf-to-image` |
| `utils/batchProcessor.ts` | In-app multi-file **compile** (not vision); main-thread yields |
| `components/TranscriptionProgressBar.tsx` | `slicing` / `transcribing` / `repairing` / `merging` |
| `utils/hsmsAgentRuleCatalog.ts` | Rule catalog for agent-memory export |
| `docs/prompt-hsms-transcriber.md` | Foundry system prompt (paste into agent) |
| `services/azureA2A.ts` | Optional A2A v0.3 wire |

## MCP tool

`transcribe_manuscript_image` is registered in `scripts/compile-copilot.ts` (`renderHsmsTranscriberMcpTool`) and executed via `executeMcpSidecarTool` when Azure is configured.

```bash
npm run compile:copilot
# alias:
npm run compile:graph-intents
```

## Studio UX

**Single image → HSMS**

1. Studio **Transcribe Scan (AI)**, or drag-drop a PNG/JPEG, or
2. Manuscript Assistant → attach image → “transcribe this into hsms”.

Calls `runHybridTranscriptionPipeline` / `transcribePageScan` (Pass 1 + **conditional** per-leaf Pass 2).

**Multi-page PDF** — same entry; client slicer; Pass 1 per leaf with `skipSyntaxRepair`; clean folios stream immediately; one batched Pass 2 for flagged leaves; `TranscriptionProgressBar` (no full-screen overlay). Cap: ~25 pages. Expo Web recommended.

## Data flow (incremental async)

```
Image or multi-page PDF (≤ ~25 pages)
        │
        ▼
DocumentPicker → useBatchTranscription / runHybridTranscriptionPipeline
        │
        ├─ image ──► transcribePageScan (Pass 1 → lint → optional Pass 2)
        │
        └─ PDF → client PDF.js / native slicer (upright PNG/JPEG)
                    │
                    ▼
         Pass 1 vision per leaf (skipSyntaxRepair)
                    │
                    ├─ clean → onFolioComplete (immediate parchment)
                    └─ flagged → queue diagnostics
                    │
                    ▼
         runBatchPassTwoRepair (0..1 call for entire PDF)
                    │
                    ▼
         stream repaired folios → merge + lint → success alert
```

**Why slice on the client?** Azure Playground / `file_search` PDF ingest runs text extractors. Image-only manuscript scans produce empty text. Sending `data:image/…` vision frames bypasses PDF indexing.

**Why stream folios?** Waiting for all ~25 pages blocks the UI. Emitting each clean leaf as Azure returns it gives instant parchment feedback; batch repair runs once at the end for only the broken leaves.

## Client ingest (gatekeeper)

```ts
import { handleAgentVisionOutput } from "@/utils/ingestAgentTranscription";

const { cleanAscii, parsed, isValid, issues } = handleAgentVisionOutput(rawFromAgent);
// then applyTranscription(cleanAscii) — never skip the lint gate
```

## Verification

1. Configure `.env` and restart Expo (`npx expo start --clear`). Prefer **Expo Web** for multi-page PDF slicing (PDF.js).
2. Optionally upload `assets/agent-memory/hsms-agent-rules.txt` to the agent’s knowledge store.
3. Select a facsimile PDF (e.g. trimmed TrSph / Nunes FAX ≤25 pages) or a single page image.
4. Tap **Transcribe Scan (AI)** — progress: slicing → per-folio transcription → optional **batch syntax repair** → merging; parchment updates after each clean leaf (and again after repair).
5. Confirm HSMS accumulates leaf-by-leaf; drop caps `{INn.}`, columns `{CB1.}`, glosses `{GLR.}` render in SvgFacsimile.
6. Smokes: `npx tsx scripts/smoke-azure-vision.ts` · `npx tsx scripts/smoke-azure-syntax.ts`.
7. Optional: MCP `audit_hsms_syntax` / Copilot **Ask** for local paleography recipes.

**Native note:** Expo Go cannot run pdf.js canvas rendering. Use Expo Web for PDF batches, upload page images on device, or add `react-native-pdf-to-image` in a custom native build.

## Privacy

Vision jobs upload image bytes to Azure. Ordinary Studio edit / local Copilot recipes do not. See [ARCHITECTURE.md § Security and privacy](ARCHITECTURE.md#security-and-privacy).
