# Azure HSMS Transcriber Prompt

> **Canonical Foundry instructions (Pass 1):** [prompt-hsms-transcriber.md](prompt-hsms-transcriber.md)

**Deployment checklist**

1. Paste Pass 1 into Agent Instructions (optional when using resource Responses `gpt-4o`).
2. Toggle **File search OFF** so image turns hit vision directly (no vector interception).
3. Client Pass 2 uses `intent_key: transcription.syntax_repair` via `runPassTwoRepair` / `runBatchPassTwoRepair` in `services/passTwoRepairService.ts` (syntax agent / model `gpt-5.4-mini`). Skip Pass 2 when the local linter reports zero critical errors.
4. PDF slicer renders upright frames and tears down canvases (`utils/pdfPageExtractor.web.ts`).

See [AZURE_HSMS_AGENT_ORCHESTRATION.md](AZURE_HSMS_AGENT_ORCHESTRATION.md).
