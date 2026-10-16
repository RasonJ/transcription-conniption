import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOG_VERSION, RECIPES } from "../utils/copilot/catalog";
import type { Recipe, SlotSpec } from "../utils/copilot/types";
import { normalizeQuery } from "../utils/copilot/router";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt.json";
import ca from "../i18n/locales/ca.json";
import gl from "../i18n/locales/gl.json";
import eu from "../i18n/locales/eu.json";

/** SPEC-COPILOT §5: ≥ 6 trigger phrases per Tier 1 locale; templates in every base catalog. */
export const MIN_TRIGGERS_PER_LOCALE = 6;
const TIER1_COPILOT_LOCALES = ["en", "es", "pt", "ca", "gl", "eu"] as const;
const CATALOGS: Record<(typeof TIER1_COPILOT_LOCALES)[number], Record<string, string>> = { en, es, pt, ca, gl, eu };

const OUT_PATH = path.resolve(__dirname, "../utils/generated/copilotCatalog.ts");
const MCP_OUT_PATH = path.resolve(__dirname, "../utils/generated/mcpManuscriptTools.ts");
const ID_RE = /^[a-z]+(\.[a-z0-9_]+)+$/;

export function validateCatalog(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const recipe of RECIPES) {
    if (!ID_RE.test(recipe.id)) errors.push(`${recipe.id}: id must look like "category.name"`);
    if (seen.has(recipe.id)) errors.push(`${recipe.id}: duplicate id`);
    seen.add(recipe.id);

    const en = recipe.triggers.en ?? [];
    if (en.length < 1) errors.push(`${recipe.id}: needs at least one English trigger`);

    for (const [locale, phrases] of Object.entries(recipe.triggers)) {
      for (const phrase of phrases ?? []) {
        if (!normalizeQuery(phrase)) errors.push(`${recipe.id}: empty ${locale} trigger`);
      }
    }
    if (recipe.version < 1) errors.push(`${recipe.id}: version must be ≥ 1`);
    if (!recipe.method) errors.push(`${recipe.id}: missing method`);

    for (const locale of TIER1_COPILOT_LOCALES) {
      const n = new Set((recipe.triggers[locale] ?? []).map(normalizeQuery)).size;
      if (n < MIN_TRIGGERS_PER_LOCALE) {
        errors.push(`${recipe.id}: ${n} ${locale} trigger(s), needs ≥ ${MIN_TRIGGERS_PER_LOCALE}`);
      }
      for (const kind of ["chip", "answer", "method"]) {
        if (typeof CATALOGS[locale][`copilot.recipe.${recipe.id}.${kind}`] !== "string") {
          errors.push(`${recipe.id}: missing ${locale} copilot.recipe.${recipe.id}.${kind}`);
        }
      }
    }
  }
  return errors;
}

function slotToJsonSchema(slot: SlotSpec): Record<string, unknown> {
  if (slot.type === "string") {
    return { type: "string", description: `Slot \`${slot.name}\`` };
  }
  if (slot.type === "int") {
    return {
      type: "integer",
      description: `Slot \`${slot.name}\``,
      ...(typeof slot.default === "number" ? { default: slot.default } : {}),
      ...(typeof slot.min === "number" ? { minimum: slot.min } : {}),
      ...(typeof slot.max === "number" ? { maximum: slot.max } : {}),
    };
  }
  if (slot.type === "enum") {
    return {
      type: "string",
      enum: slot.values,
      description: `Slot \`${slot.name}\``,
    };
  }
  if (slot.type === "folioRange") {
    return { type: "string", description: "Folio id or range (e.g. 2r, 1v-3r)" };
  }
  if (slot.type === "hsmsLang") {
    return { type: "string", description: "HSMS language tag (LAT, ENG, …)" };
  }
  return { type: "string" };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  /** Original recipe id (dotted). */
  recipeId: string;
  tier: string;
  category: string;
}

/** MCP tool declarations for local/desktop agents (Claude Desktop, Cursor, …). */
export function renderMcpToolDefinitions(
  recipes: readonly Pick<
    Recipe,
    "id" | "tier" | "category" | "method" | "slots" | "present" | "triggers"
  >[] = RECIPES,
): McpToolDefinition[] {
  return recipes.map((r) => {
    const properties: Record<string, unknown> = {
      query: {
        type: "string",
        description: "Optional free-text query passed to on-demand recipes.",
      },
    };
    const required: string[] = [];
    for (const slot of r.slots) {
      properties[slot.name] = slotToJsonSchema(slot);
      if ("required" in slot && slot.required) required.push(slot.name);
    }

    const enTriggers = (r.triggers.en ?? []).slice(0, 3).join("; ");
    return {
      name: r.id.replace(/\./g, "_"),
      description: `${r.present.chipLabel}. ${r.method}${enTriggers ? ` Triggers: ${enTriggers}.` : ""} (Precompiled local recipe, no network.)`,
      inputSchema: {
        type: "object" as const,
        properties,
        required,
      },
      recipeId: r.id,
      tier: r.tier,
      category: r.category,
    };
  });
}

export function renderCatalogModule(): string {
  const entries = RECIPES.map((r) => {
    const triggers: Record<string, string[]> = {};
    for (const [locale, phrases] of Object.entries(r.triggers)) {
      triggers[locale] = (phrases ?? []).map(normalizeQuery);
    }
    return {
      id: r.id,
      version: r.version,
      tier: r.tier,
      category: r.category,
      precompute: r.precompute,
      triggers,
    };
  });

  return [
    "// Generated by scripts/compile-copilot.ts. Do not edit.",
    "",
    `export const COPILOT_CATALOG_VERSION = ${CATALOG_VERSION};`,
    "",
    "export interface CopilotCatalogEntry {",
    "  id: string;",
    "  version: number;",
    '  tier: "A" | "B" | "C" | "D";',
    "  category: string;",
    '  precompute: "eager" | "on_demand";',
    "  /** Normalized trigger phrases per locale. */",
    "  triggers: Record<string, string[]>;",
    "}",
    "",
    `export const COPILOT_CATALOG: CopilotCatalogEntry[] = ${JSON.stringify(entries, null, 2)};`,
    "",
  ].join("\n");
}

/** Precomputed corpus / graph tools (batch sidecars; no AST walk at query time). */
export function renderMcpGraphTools(): McpToolDefinition[] {
  return [
    {
      name: "query_codicological_graph",
      description:
        "Graph search across authors, printers, cities, years, and shared rare vocabulary (out/library-graph.json).",
      inputSchema: {
        type: "object",
        properties: {
          entityId: {
            type: "string",
            description: "Node id (e.g. AUTHOR.pedro_nunes, CITY.lisboa, MS.TEXT.TRS, TERM.sphera)",
          },
          relation: {
            type: "string",
            enum: ["AUTHORED_BY", "PRINTED_BY", "PUBLISHED_IN", "DATED", "CONTAINS_TERM"],
            description: "Edge relation to traverse",
          },
          neighborType: {
            type: "string",
            enum: ["manuscript", "author", "printer", "city", "year", "term"],
            description: "Optional filter on neighbor node type",
          },
        },
        required: ["relation"],
      },
      recipeId: "graph.codicological",
      tier: "A",
      category: "corpus",
    },
    {
      name: "get_precompiled_facets",
      description:
        "Fetch instant structural counts (rubrics, glosses, drop caps, code-switching) from out/<id>.facets.json.",
      inputSchema: {
        type: "object",
        properties: {
          witnessId: {
            type: "string",
            description: "Base name of manuscript (e.g. TEXT.TRS or 1500__auto1_01)",
          },
        },
        required: ["witnessId"],
      },
      recipeId: "corpus.precompiled_facets",
      tier: "A",
      category: "corpus",
    },
    {
      name: "rank_witnesses_tfidf",
      description:
        "Rank library witnesses for a term using precomputed IDF (out/corpus-tfidf.json) × per-witness TF.",
      inputSchema: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "Query lemma / surface (normalized internally)",
          },
          topK: {
            type: "integer",
            description: "Max witnesses to return",
            default: 10,
            minimum: 1,
            maximum: 50,
          },
        },
        required: ["term"],
      },
      recipeId: "corpus.rank_tfidf",
      tier: "A",
      category: "corpus",
    },
    {
      name: "audit_hsms_syntax",
      description:
        "Proofer-style HSMS syntax audit (technical / editorial / structural). Returns rows and optional TSV. Does not auto-rewrite — Proofer señala; el editor decide.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Raw HSMS transcription text to audit",
          },
          sourceFileName: {
            type: "string",
            description: "Optional filename for TEXT.SIGLA.txt convention checks",
          },
          format: {
            type: "string",
            enum: ["json", "tsv"],
            description: "Result format (default json)",
            default: "json",
          },
        },
        required: ["text"],
      },
      recipeId: "diag.audit_hsms_syntax",
      tier: "A",
      category: "corpus",
    },
    renderHsmsTranscriberMcpTool(),
    renderHtrToHsmsMcpTool(),
  ];
}

/** Transkribus / eScriptorium HTR cleanup → HSMS (utils/htrConverter.ts). */
export function renderHtrToHsmsMcpTool(): McpToolDefinition {
  return {
    name: "convert_htr_to_hsms",
    description:
      "Cleans Handwritten Text Recognition exports (Transkribus / eScriptorium) into HSMS ASCII using the ordered 80+ substitution rules from HSMS-tools/HTR_to_HSMS.",
    inputSchema: {
      type: "object",
      properties: {
        htrText: {
          type: "string",
          description: "Raw HTR / OCR plain text to convert.",
        },
        text: {
          type: "string",
          description: "Alias for htrText.",
        },
        skip_space_cleanup: {
          type: "boolean",
          description: "If true, skip the trailing whitespace normalization pass.",
          default: false,
        },
      },
      required: [],
    },
    recipeId: "transcription.convert_htr",
    tier: "A",
    category: "paleography",
  };
}

/** Azure Vision → HSMS ASCII (Foundry A2A agent; see docs/azure_hsms_transcriber_prompt.md). */
export function renderHsmsTranscriberMcpTool(): McpToolDefinition {
  return {
    name: "transcribe_manuscript_image",
    description:
      "Transcribes a multi-page manuscript page scan or PDF into validated HSMS ASCII markup via the Azure paleography agent.",
    inputSchema: {
      type: "object",
      properties: {
        image_uri: {
          type: "string",
          description:
            "Image data URI / file URI, or a PDF URI. PDFs are sliced client-side to PNG/JPEG before vision calls (never uploaded as PDF).",
        },
        folio_id: {
          type: "string",
          description: "Target folio marker for a single leaf, e.g., '1r' or '3v'.",
        },
        language_hint: {
          type: "string",
          description: "Ibero-Romance language hint (POR, SPA, CAT, LAT).",
        },
        max_pages: {
          type: "integer",
          description: "Max PDF pages to slice (default 25).",
          default: 25,
          minimum: 1,
          maximum: 50,
        },
        mime_type: {
          type: "string",
          description: "Optional MIME (application/pdf triggers client slicer).",
        },
      },
      required: ["image_uri"],
    },
    recipeId: "transcription.vision_ocr",
    tier: "A",
    category: "paleography",
  };
}

export function renderMcpToolsModule(
  tools: McpToolDefinition[] = [...renderMcpToolDefinitions(), ...renderMcpGraphTools()],
): string {
  return [
    "// Generated by scripts/compile-copilot.ts. Do not edit.",
    "// MCP tool declarations for manuscript recipes + precomputed corpus/graph indexes.",
    "",
    "export interface McpManuscriptTool {",
    "  name: string;",
    "  description: string;",
    "  inputSchema: {",
    '    type: "object";',
    "    properties: Record<string, unknown>;",
    "    required: string[];",
    "  };",
    "  recipeId: string;",
    "  tier: string;",
    "  category: string;",
    "}",
    "",
    `export const MCP_MANUSCRIPT_TOOLS: McpManuscriptTool[] = ${JSON.stringify(tools, null, 2)};`,
    "",
    `export const MCP_GRAPH_TOOLS: McpManuscriptTool[] = ${JSON.stringify(renderMcpGraphTools(), null, 2)};`,
    "",
  ].join("\n");
}

function main(): void {
  const errors = validateCatalog();
  if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, renderCatalogModule(), "utf8");
  const recipeTools = renderMcpToolDefinitions();
  const graphTools = renderMcpGraphTools();
  const tools = [...recipeTools, ...graphTools];
  fs.writeFileSync(MCP_OUT_PATH, renderMcpToolsModule(tools), "utf8");
  console.log(
    `copilot catalog: ${RECIPES.length} recipes → ${path.relative(process.cwd(), OUT_PATH)}`,
  );
  console.log(
    `mcp tools:       ${tools.length} tools (${graphTools.length} corpus/graph) → ${path.relative(process.cwd(), MCP_OUT_PATH)}`,
  );
}

const isDirectRun =
  (typeof require !== "undefined" && require.main === module) ||
  // ESM / tsx: compare this module URL to the entry argv path.
  (typeof import.meta !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href);

if (isDirectRun) main();
