# Manuscript Reasoning Graph & Precompiled Intent Chains

Scholarly + philological knowledge graph for the HSMS scriptorium workstation. The graph backs Copilot Tier‑1 answers (controversy, barriers, learning paths) without multi-hop GDB traversal at query time.

## Schema

| File | Role |
|------|------|
| [`schemas/manuscript-reasoning-graph-v1.json`](../schemas/manuscript-reasoning-graph-v1.json) | Single JSON Schema (`schema_version` **1.0**) |
| [`utils/reasoningGraph/`](../utils/reasoningGraph/) | Types, builder, spatial seed, FAQ, agents, facets, Pearlian/temporal helpers |

**Do not bump `schema_version` without an explicit project decision.** Improvements land in the same v1 schema file.

### Layers (LOD)

| `lod_tier` | Contents | Query use |
|------------|----------|-----------|
| `MACRO_REASONING` | Manuscript, Author, Claim, Evidence, Concept, Work | Epistemic / corpus questions |
| `MESO_DISCOURSE` | FAQ, AnswerSnippet, Agent, Barrier, Event, causal roles | Discourse + ops |
| `MICRO_PHILOLOGICAL` | Folio → Column → Block → Line → Token, damage, variants | Facsimile / layout only |

Filter `MICRO_PHILOLOGICAL` out of high-level Neo4j / Memgraph traversals.

### Design rules

- **Node vs edge attributes** — Claims hold `proposition_text` / `epistemic_status` / `certainty_degree`. Edges hold `confidence_score`, `consensus_status`, `relevance_score`, `do_action`.
- **Discriminators** — `ReasoningNode` uses `allOf` + `if`/`then` on `type` (no catch-all object).
- **Edge gates** — `source_type` / `target_type` constrained for rebuts, supports_claim, FAQ, causal relations, etc.

## Building a graph in code

```ts
import {
  seedFromWitness,
  annotateClaim,
  annotateManuscriptBarrier,
  precompileChainsFromGraph, // via utils/copilot/precompiledChains
} from "@/utils/reasoningGraph";
import { seedHsmsFaqBundle } from "@/utils/reasoningGraph/faqMapping";

let g = seedFromWitness(parsed, { witnessId: "demo", spatial: "shallow" });
g = annotateClaim(g, {
  manuscriptId: "MANUSCRIPT:demo",
  claimId: "catchword-quire",
  proposition: "Catchwords mark quire boundaries.",
  confidence: 0.9,
  evidenceId: "folio-cw",
  evidenceAttrs: { evidence_type: "philological_witness" },
});
g = seedHsmsFaqBundle(g);
```

Pearlian / temporal helpers live in `utils/reasoningGraph/causalTemporal.ts` (`annotateDoIntervention`, `annotateProvenanceEvent`, `annotateDamageRegion`, `linkVariantForm`, …).

## Precompiled intent chains

```
Reasoning Graph
      │  offline batch
      ▼
assets/precompiled-intent-chains.json
assets/intent-taxonomy.json  (precompiled_chain fields)
      │  Tier-1 match (<1ms)
      ▼
askCopilot() → doActions / navigate / MCP tool hint
```

| Intent id | Pattern |
|-----------|---------|
| `analyze:controversy:explain` | FAQ → AnswerSnippet → Manuscript → `refuted` |
| `validate:barrier:repair_flow` | Manuscript → barrier → jump folio → repair |
| `learn:prerequisite:pathway` | Concept ← `prerequisite_for` ← LayExplanation |

### Commands

```bash
npm run merge:intent-taxonomy      # deep-merge EXTRA intents into taxonomy
npm run precompile:graph-intents   # graph subgraphs → chain bundle + taxonomy
# alias:
npm run compile:graph-intents
```

Runtime: `utils/copilot/precompiledChains.ts` + short-circuit in `utils/copilot/ask.ts`. MCP declarations: `utils/generated/mcpPrecompiledChainTools.ts`.

### Tests

```bash
npx jest __tests__/reasoningGraph.test.ts __tests__/reasoningGraphPearlian.test.ts __tests__/precompiledChains.test.ts
```

## Related assets

| Path | Role |
|------|------|
| `assets/intent-taxonomy.json` | `domain:entity:action` intents, stages, doActions |
| `assets/calibrated-thresholds.json` | Auto-dispatch gates for doActions |
| `assets/terminology-allowlist.json` | Jargon / bilingual pre-pass |
| `assets/precompiled-intent-chains.json` | Flat execution recipes |
