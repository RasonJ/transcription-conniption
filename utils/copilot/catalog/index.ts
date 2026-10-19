import { buildManuscriptVectorIndex, type ManuscriptVectorIndex } from "../../manuscriptVectorIndex";
import { resolveFolioJump, searchManuscriptIndex } from "../../manuscriptSearch";
import type { ParsedManuscript } from "../../../constants/manuscript";
import {
  codeSwitching,
  damageIllegible,
  deletionsScribalVsEditorial,
  foreignRatio,
  glossVsAddenda,
  initialHierarchy,
  layoutWrapback,
  nonOriginalHands,
  reconstructionsByHand,
  superscripts,
} from "../executors/tierA";
import { ngrams, termFrequency, vocabDensity } from "../executors/voyant";
import type { CopilotLocale, Recipe, RecipeResult } from "../types";
import { EXTRA_RECIPES } from "./extra";
import { LOCALE_TRIGGERS } from "../triggers";
import { mergeI18nTriggerSeeds } from "../i18nTriggerSeeds";
import TIER_B_PRECISION from "../tierBPrecision.json";
import enCatalog from "../../../i18n/locales/en.json";
import esCatalog from "../../../i18n/locales/es.json";
import ptCatalog from "../../../i18n/locales/pt.json";
import caCatalog from "../../../i18n/locales/ca.json";
import glCatalog from "../../../i18n/locales/gl.json";
import euCatalog from "../../../i18n/locales/eu.json";

/** Bump when any recipe's triggers or output semantics change. */
export const CATALOG_VERSION = 4;

const I18N_CATALOGS = {
  en: enCatalog as Record<string, string>,
  es: esCatalog as Record<string, string>,
  pt: ptCatalog as Record<string, string>,
  ca: caCatalog as Record<string, string>,
  gl: glCatalog as Record<string, string>,
  eu: euCatalog as Record<string, string>,
};

type AnyRecipe = Recipe<Record<string, unknown>>;

const vectorIndexCache = new WeakMap<ParsedManuscript, ManuscriptVectorIndex>();

function vectorIndexFor(
  parsed: ParsedManuscript,
  given?: ManuscriptVectorIndex,
): ManuscriptVectorIndex {
  if (given) return given;
  let index = vectorIndexCache.get(parsed);
  if (!index) {
    index = buildManuscriptVectorIndex(parsed);
    vectorIndexCache.set(parsed, index);
  }
  return index;
}

const tierA = (r: Omit<AnyRecipe, "version" | "tier" | "slots" | "requires" | "precompute">): AnyRecipe => ({
  version: 1,
  tier: "A",
  slots: [],
  requires: ["facets"],
  precompute: "eager",
  ...r,
});

const navFolio: Recipe<{ query?: string }> = {
  id: "nav.folio",
  version: 1,
  category: "navigation",
  tier: "A",
  triggers: {
    en: [
      "go to folio",
      "turn to page",
      "jump to leaf",
      "open folio",
      "show me folio",
      "go to fol",
    ],
    es: ["ir al folio", "ir a la pagina", "abrir el folio", "saltar al folio"],
  },
  slots: [{ name: "range", type: "folioRange" }],
  requires: [],
  precompute: "on_demand",
  run(ctx, params) {
    const jump = resolveFolioJump(params.query ?? "", ctx.parsed);
    return {
      headline: jump ? `Jump to [fol. ${jump.folioId}].` : "No matching folio in this witness.",
      params: { folio: jump?.folioId ?? "" },
      messageKey: jump ? undefined : "none",
      count: jump ? 1 : 0,
      rows: jump ? [{ folioId: jump.folioId, lineNumber: jump.lineNumber, label: "folio" }] : [],
      navigate: jump ?? undefined,
    };
  },
  present: { view: "count", chipLabel: "Go to folio" },
  method: "Matched a folio reference in the query against the witness's leaf ids.",
};

const searchPassages: Recipe<{ query?: string; topK?: number }> = {
  id: "search.passages",
  version: 1,
  category: "navigation",
  tier: "C",
  triggers: {
    en: [
      "search for passages about",
      "find where the text mentions",
      "where does it say",
      "look up a phrase",
      "search the manuscript",
      "find passages containing",
      "run structural lint on this witness",
      "run structural lint",
      "show validation errors",
      "preflight this transcription",
    ],
    es: ["buscar pasajes sobre", "donde dice", "buscar en el manuscrito", "encontrar el texto que menciona"],
  },
  slots: [{ name: "word", type: "string", required: true }],
  requires: [],
  precompute: "on_demand",
  run(ctx, params): RecipeResult {
    const query = (params.query ?? "").trim();
    const hits = query
      ? searchManuscriptIndex(query, vectorIndexFor(ctx.parsed, ctx.vectorIndex), params.topK ?? 5)
      : [];
    return {
      headline:
        hits.length > 0
          ? `${hits.length} passage${hits.length === 1 ? "" : "s"} matched.`
          : "No passages above the similarity threshold.",
      params: { count: hits.length },
      messageKey: hits.length > 0 ? undefined : "none",
      count: hits.length,
      rows: hits.map((h) => ({
        folioId: h.chunk.folioId,
        lineNumber: h.chunk.lineNumber,
        label: `${h.chunk.type !== "prose" ? `${h.chunk.type} · ` : ""}${(h.score * 100).toFixed(0)}%`,
        detail: h.chunk.text,
      })),
    };
  },
  present: { view: "table", chipLabel: "Search passages" },
  method: "Cosine similarity of hash-embedded character trigrams against normalized lines.",
};

const BASE_RECIPES: readonly AnyRecipe[] = [
  tierA({
    id: "corr.deletions_scribal_vs_editorial",
    category: "paleography",
    triggers: {
      en: [
        "show scribal deletions versus editorial deletions",
        "where did the scribe expunge or strike through text",
        "punteado tachado scribal cancellations",
        "compare (^text) and (text) deletions",
        "list scribal corrections",
        "editorial cancellations",
      ],
      es: [
        "muestra las tachaduras del copista frente a las del editor",
        "dónde expungió o tachó el escriba",
        "punteado y tachado del copista",
        "correcciones del escriba",
        "cancelaciones editoriales",
      ],
    },
    run: (ctx) => deletionsScribalVsEditorial(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Deletions" },
    method: "Counted scribal_deletion (HSMS (^…)) and editorial_deletion (HSMS (…)) tokens.",
    dsl: "count tokens where type = scribal_deletion",
  }),
  tierA({
    id: "corr.non_original_hands",
    category: "paleography",
    triggers: {
      en: [
        "show text added by later hands",
        "which tokens were written by a non-original hand",
        "second hand corrections",
        "insertions by hand 2 or hand 3",
        "non original hands",
        "later scribes who touched the text",
      ],
      es: [
        "muestra el texto añadido por manos posteriores",
        "correcciones de la segunda mano",
        "manos no originales",
        "inserciones de la mano 2 o 3",
      ],
    },
    run: (ctx) => nonOriginalHands(ctx.facets, ctx.parsed),
    present: { view: "table", chipLabel: "Later hands" },
    method: "Counted tokens carrying a hand marker ^N# with N ≥ 2, grouped by hand and token type.",
    dsl: "count tokens where hand >= 2",
  }),
  tierA({
    id: "abbr.superscripts",
    category: "paleography",
    triggers: {
      en: [
        "show superscript vowels",
        "superscript abbreviations versus interlinear insertions",
        "raised letters above the line",
        "list superscript letters",
        "how many superscripts are there",
        "interlinear additions and superscripts",
      ],
      es: ["muestra las vocales voladas", "letras sobrescritas", "abreviaturas voladas frente a inserciones interlineales"],
    },
    run: (ctx) => superscripts(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Superscripts" },
    method: "Counted superscript (HSMS <<…>>) and scribal_insertion (HSMS [^…]) tokens.",
    dsl: "count tokens where type = superscript",
  }),
  tierA({
    id: "illum.initial_hierarchy",
    category: "paleography",
    triggers: {
      en: [
        "distribution of illuminated initials",
        "how many drop capitals by depth",
        "show initial hierarchy IN1 to IN5",
        "list the decorated initials",
        "illuminated initials and their sizes",
        "drop initials by line depth",
      ],
      es: ["distribución de las iniciales iluminadas", "iniciales por profundidad", "lista las iniciales decoradas", "letras capitales"],
    },
    run: (ctx) => initialHierarchy(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Initials" },
    method: "Grouped drop_initial tokens (HSMS {INn.}) by their line depth n.",
    dsl: "count tokens where type = drop_initial group by type",
  }),
  tierA({
    id: "marg.gloss_vs_addenda",
    category: "paleography",
    triggers: {
      en: [
        "contemporary glosses versus later addenda",
        "show marginal notes and additions",
        "how many glosses and addenda",
        "list marginal glosses",
        "find commentary written in the margins",
        "gloss compared with addendum",
      ],
      es: ["glosas contemporáneas frente a adiciones posteriores", "notas marginales y adiciones", "lista las glosas marginales", "cuántas glosas y adendas"],
    },
    run: (ctx) => glossVsAddenda(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Glosses & addenda" },
    method: "Counted blocks of type gloss (HSMS {GL.}) and addendum (HSMS {AD.}).",
  }),
  tierA({
    id: "damage.illegible",
    category: "paleography",
    triggers: {
      en: [
        "show illegible passages",
        "where is the text unreadable",
        "list missing fragments",
        "damaged areas of the manuscript",
        "count illegible readings [??]",
        "lacunae and lost words",
      ],
      es: ["muestra los pasajes ilegibles", "dónde el texto no se puede leer", "fragmentos perdidos", "zonas dañadas del manuscrito"],
    },
    run: (ctx) => damageIllegible(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Illegible" },
    method: "Counted illegible_text (HSMS [??], [???]) and missing_fragment (HSMS ??) tokens.",
    dsl: "count tokens where type = illegible_text",
  }),
  tierA({
    id: "damage.reconstructions_by_hand",
    category: "paleography",
    triggers: {
      en: [
        "show editorial reconstructions",
        "reconstructed text by hand",
        "where did an editor supply missing text",
        "list reconstructions [*text]",
        "who reconstructed the damaged words",
        "conjectural readings and their hands",
      ],
      es: ["muestra las reconstrucciones editoriales", "texto reconstruido por mano", "lecturas conjeturales"],
    },
    run: (ctx) => reconstructionsByHand(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Reconstructions" },
    method: "Grouped reconstructed_text tokens (HSMS [*…]) by the hand marker, when present.",
    dsl: "count tokens where type = reconstructed_text group by hand",
  }),
  tierA({
    id: "layout.wrapback",
    category: "paleography",
    triggers: {
      en: [
        "show wrapback marks",
        "where are the calderon marks %2 and %3",
        "list column wrap marks",
        "count paragraph signs %2",
        "turnover marks at the end of lines",
        "calderon two and calderon three",
      ],
      es: ["muestra las marcas de reenvío", "dónde están los calderones %2 y %3", "marcas de vuelta al final de la línea"],
    },
    run: (ctx) => layoutWrapback(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Wrap-back marks" },
    method: "Counted calderon_two (HSMS %2) and calderon_three (HSMS %3) tokens.",
    dsl: "count tokens where type = calderon_two",
  }),
  tierA({
    id: "lex.code_switching",
    category: "linguistics",
    triggers: {
      en: [
        "show language switches",
        "where does the scribe change language",
        "list latin and aragonese spans",
        "code switching in the text",
        "tagged language spans LAT ARG CAT",
        "multilingual passages",
      ],
      es: ["muestra los cambios de lengua", "dónde cambia de idioma el escriba", "tramos en latín", "alternancia de códigos"],
    },
    run: (ctx) => codeSwitching(ctx.facets, ctx.parsed),
    present: { view: "table", chipLabel: "Language spans" },
    method: "Counted contiguous language runs from {LAT.}-style environments, per HSMS language code.",
  }),
  tierA({
    id: "ml.foreign_ratio",
    category: "corpus",
    triggers: {
      en: [
        "what share of the text is foreign language",
        "percentage of words in latin",
        "foreign word ratio",
        "how much of the witness is not romance",
        "proportion of tagged language words",
        "ratio of language span words to total",
      ],
      es: ["qué porcentaje del texto está en otra lengua", "proporción de palabras en latín", "ratio de palabras extranjeras"],
    },
    run: (ctx) => foreignRatio(ctx.facets, ctx.parsed),
    present: { view: "count", chipLabel: "Foreign words" },
    method: "Words inside language-span environments divided by all words walked from the token stream.",
  }),
  tierA({
    id: "corpus.term_frequency",
    category: "corpus",
    triggers: {
      en: [
        "show word frequency distribution",
        "word frequency",
        "most frequent words",
        "term frequency",
        "cirrus word cloud terms",
        "top words in the text",
      ],
      es: [
        "muestra la distribución de frecuencias",
        "palabras más frecuentes",
        "frecuencia de términos",
        "nube de palabras",
      ],
    },
    run: (ctx) => termFrequency(ctx.facets, ctx.parsed),
    present: { view: "distribution", chipLabel: "Term frequency" },
    method: "Ranked surface frequencies from the FacetIndex word stream (Voyant Cirrus–style).",
  }),
  {
    id: "corpus.ngrams",
    version: 1,
    category: "corpus",
    tier: "A",
    triggers: {
      en: [
        "extract n-grams",
        "show bigrams",
        "show trigrams",
        "frequent collocations",
        "n-gram frequencies",
        "word pairs that co-occur",
      ],
      es: ["extrae n-gramas", "muestra bigramas", "colocaciones frecuentes", "pares de palabras"],
    },
    slots: [{ name: "n", type: "int", default: 2, min: 2, max: 5 }],
    requires: ["facets"],
    precompute: "on_demand",
    run: (ctx, params) => ngrams(ctx.facets, ctx.parsed, typeof params.n === "number" ? params.n : 2),
    present: { view: "table", chipLabel: "N-grams" },
    method: "Contiguous n-gram counts over normalized word surfaces (default bigrams).",
  } as AnyRecipe,
  tierA({
    id: "corpus.vocab_density",
    category: "corpus",
    triggers: {
      en: [
        "analyze vocabulary density",
        "vocabulary density across folios",
        "type token ratio",
        "hapax density",
        "lexical diversity",
        "STTR of this witness",
      ],
      es: [
        "analiza la densidad léxica",
        "densidad de vocabulario por folio",
        "ratio tipos tokens",
        "diversidad léxica",
      ],
    },
    run: (ctx) => vocabDensity(ctx.facets, ctx.parsed),
    present: { view: "table", chipLabel: "Vocab density" },
    method: "Witness TTR / STTR / hapax plus per-folio type–token density (Voyant-style).",
  }),
  navFolio as unknown as AnyRecipe,
  searchPassages as unknown as AnyRecipe,
];

/** Merge per-locale trigger files + i18n chip/label seeds into each recipe's triggers. */
function withLocaleTriggers(recipe: AnyRecipe): AnyRecipe {
  let triggers = { ...recipe.triggers };
  for (const [locale, table] of Object.entries(LOCALE_TRIGGERS) as Array<[CopilotLocale, Record<string, string[]>]>) {
    const extra = table[recipe.id];
    if (!extra?.length) continue;
    const merged = new Set([...(triggers[locale] ?? []), ...extra]);
    triggers[locale] = [...merged];
  }
  triggers = mergeI18nTriggerSeeds(recipe.id, triggers, I18N_CATALOGS) as typeof triggers;
  return { ...recipe, triggers };
}

/** Measured precision per Tier B recipe (`npm run tierb:precision -- score`), SPEC-COPILOT §12. */
const PRECISION = TIER_B_PRECISION as Record<string, { precision: number; labeled: number }>;

export const RECIPES: readonly AnyRecipe[] = [
  ...BASE_RECIPES,
  ...(EXTRA_RECIPES as unknown as AnyRecipe[]),
]
  .map(withLocaleTriggers)
  .map((r) => (PRECISION[r.id] ? { ...r, precision: PRECISION[r.id].precision } : r));

const BY_ID = new Map<string, AnyRecipe>(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): AnyRecipe | undefined {
  return BY_ID.get(id);
}

export function eagerRecipes(): AnyRecipe[] {
  return RECIPES.filter((r) => r.precompute === "eager");
}
