import type { ParsedManuscript } from "../../constants/manuscript";
import { DEFAULT_DIM, hashEmbed, hashEmbedInto } from "../embeddings/hashEmbed";
import { resolveFolioJump } from "../manuscriptSearch";
import { RECIPES } from "./catalog";
import type { CopilotLocale, Recipe } from "./types";

/**
 * Multilingual recipe router (SPEC-COPILOT §8).
 *
 * Each trigger phrase becomes a sparse feature vector: whole words weighted by inverse
 * recipe frequency (IDF over the catalog), 5-letter stems (so "tachaduras" meets
 * "tachado"), boundary-padded character trigrams for spelling variation, and HSMS
 * notation kept as features (`%2`, `[+]`, `{cw.`, `@'`). Grammatical words of the six
 * Tier 1 languages are dropped. A query scores each recipe by its best phrase plus a small
 * share of its second-best, so recipes are not decided by one lucky phrase.
 */

const DEFAULT_LOCALES: CopilotLocale[] = ["en", "es"];

/**
 * Out-of-scope requests (translation, summaries, authorship, free writing). When this
 * pseudo-recipe wins, the router answers "no confident match" instead of guessing.
 */
export const OUT_OF_SCOPE_ID = "_out_of_scope";
const OUT_OF_SCOPE: Partial<Record<CopilotLocale, string[]>> = {
  en: [
    "translate this passage into modern english", "give me a translation", "who is the author of the work",
    "when was it composed", "summarize the story", "what happens in the plot", "write me a sonnet",
    "explain what this means", "tell me a joke", "what is your opinion of the book", "recommend similar books",
    "who wrote the original text", "render the folio in another language",
    "who wrote this manuscript", "what is the weather today", "write a poem about the king",
    "summarize the plot", "translate folio into english",
  ],
  es: [
    "traduce este pasaje al español moderno", "dame una traducción", "quién es el autor de la obra",
    "cuándo se compuso", "resume la historia", "qué pasa en la trama", "escríbeme un soneto",
    "explica qué significa", "cuéntame un chiste", "qué opinas del libro",
    "quién escribió el texto original", "pasa la hoja a otro idioma",
    "quién escribió este manuscrito", "resume el argumento", "traduce el folio al inglés",
  ],
  pt: [
    "traduz esta passagem para português moderno", "quem é o autor da obra", "resume a história",
    "o que acontece no enredo", "escreve-me um soneto", "explica o que significa",
    "qual é o enredo",
  ],
  ca: [
    "tradueix aquest passatge al català modern", "qui és l'autor de l'obra", "resumeix la història",
    "què passa a la trama", "escriu-me un sonet", "explica què vol dir",
    "escriu un poema", "escriu-me un poema",
  ],
  gl: [
    "traduce esta pasaxe ao galego moderno", "quen é o autor da obra", "resume a historia",
    "que pasa no argumento", "escríbeme un soneto", "explica que significa",
  ],
  eu: [
    "itzuli pasarte hau euskara modernora", "nor da lanaren egilea", "laburtu istorioa",
    "zer gertatzen da argumentuan", "idatzi soneto bat", "azaldu zer esan nahi duen",
  ],
};
/** Calibrated on the held-out paraphrase and negative sets (see __tests__/copilotRouting). */
export const ROUTER_THRESHOLD = 0.3;
/** Alternatives below this score are not worth offering. */
export const ALTERNATIVE_FLOOR = 0.15;
/**
 * Hash-embedding cosine bands for the close-enough tier.
 * These are not on the same scale as {@link ROUTER_THRESHOLD}.
 */
export const EMBED_DIRECT_THRESHOLD = 0.82;
export const EMBED_SUGGEST_THRESHOLD = 0.68;
const MAX_ALTERNATIVES = 3;
const DIM = 1 << 16;

const RE_MARKS = /[̀-ͯ]/g;
const RE_SPLIT_CHARS = /[,;]/g;
const RE_WS = /\s+/g;
const RE_TOKEN = /%[23]?|\[\+\]|\[—\]|\[\*|\[\?\?\]|\{[a-z]{2,5}\d?[.:]|<<|@['^#`]|[\p{L}\p{N}]+/gu;

/** Function words of en, es, pt, ca, gl, eu (accents already folded). */
const STOPWORDS = new Set(
  (
    // en
    "the a an of in on at to for and or is are was were be been does do did how what which where who whom whose " +
    "show me list find all this that these those with by from as it its my any more than many much " +
    "there their them they we you your i into out up about over per each every between versus vs compared same " +
    // es
    "el la los las lo un una unos unas de del al en y e o u que como donde cual cuales cuanto cuantos cuantas cuanta " +
    "por para con sin se su sus es son esta este estos estas esa ese hay muestra muestrame dame frente muy entre " +
    // pt
    "os as um uma uns umas do da dos das no na nos nas ao aos em ou onde qual quais quanto quantos quantas com sem " +
    "seu sua seus suas e sao este esta isto mostra mostrame ha " +
    // ca
    "els les dels pels i amb per on quin quina quins quines quant quants quantes es son aquest aquesta hi enfront mostra " +
    // gl
    "unha uns unhas co coa cos coas onde cal cales canto cantos cantas sen amosa amosame fronte ten " +
    // eu
    "eta edo da dira du dute zer nola non zein zeintzuk zenbat bat batzuk ere ala al dago daude erakutsi"
  ).split(" "),
);

/** NFD, strip combining marks, lowercase, collapse whitespace. */
export function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    .replace(RE_MARKS, "")
    .toLowerCase()
    .replace(RE_SPLIT_CHARS, " ")
    .replace(RE_WS, " ")
    .trim();
}

function contentTokens(normalized: string): string[] {
  const out: string[] = [];
  RE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_TOKEN.exec(normalized)) !== null) {
    const t = m[0];
    if (!STOPWORDS.has(t)) out.push(t);
  }
  return out;
}

function stemOf(word: string): string | null {
  return word.length > 5 && /^[\p{L}]+$/u.test(word) ? word.slice(0, 5) : null;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

type SparseVec = Map<number, number>;

interface Weights {
  word: Map<string, number>;
  stem: Map<string, number>;
  /** IDF for unseen words: as rare as a word seen in one recipe. */
  unseen: number;
}

function addFeature(vec: SparseVec, key: string, weight: number): void {
  const h = fnv(key);
  const idx = h % DIM;
  const sign = h & 0x80000000 ? -1 : 1;
  vec.set(idx, (vec.get(idx) ?? 0) + sign * weight);
}

function embed(normalized: string, w: Weights): SparseVec {
  const vec: SparseVec = new Map();
  for (const tok of contentTokens(normalized)) {
    const idf = w.word.get(tok) ?? w.unseen;
    addFeature(vec, `w:${tok}`, idf);
    const stem = stemOf(tok);
    if (stem) addFeature(vec, `s:${stem}`, 0.6 * (w.stem.get(stem) ?? w.unseen));
    if (/^[\p{L}]{3,}$/u.test(tok)) {
      const padded = `^${tok}$`;
      const n = padded.length - 2;
      // Trigrams help spelling variants of known words; for unseen words they mostly collide.
      const tri = ((w.word.has(tok) ? 0.35 : 0.1) * idf) / Math.sqrt(n);
      for (let i = 0; i < n; i++) addFeature(vec, `t:${padded.slice(i, i + 3)}`, tri);
    }
  }
  let norm = 0;
  vec.forEach((v) => {
    norm += v * v;
  });
  const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0;
  vec.forEach((v, k) => vec.set(k, v * inv));
  return vec;
}

function dot(a: SparseVec, b: SparseVec): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  small.forEach((v, k) => {
    const o = large.get(k);
    if (o !== undefined) s += v * o;
  });
  return s;
}

export interface RouterIndex {
  threshold: number;
  /** One entry per trigger phrase (`recipeId#n`), kept for callers that inspect coverage. */
  protos: { intents: string[]; dim: number };
  locales: CopilotLocale[];
  weights: Weights;
  phrases: Array<{ recipeId: string; vec: SparseVec }>;
}

export interface RouteMatch {
  recipeId: string;
  score: number;
}

export type RouteResult =
  | { kind: "folio"; folioJump: { folioId: string; lineNumber?: string } }
  | {
      kind: "recipe";
      /** Best recipe at or above the threshold, else null. */
      top: RouteMatch | null;
      /** Next-best recipes below the threshold ("Did you mean…"). */
      alternatives: RouteMatch[];
      /** Best score regardless of threshold. */
      bestScore: number;
      /** The out-of-scope prototype won, so embedding dispatch must not guess a recipe. */
      outOfScope: boolean;
    };

const routerCache = new Map<string, RouterIndex>();

/** One vector per trigger phrase in the requested locales; IDF over recipes. */
export function buildRouterIndex(
  recipes: readonly Pick<Recipe, "id" | "triggers">[] = RECIPES,
  locales: CopilotLocale[] = DEFAULT_LOCALES,
  threshold: number = ROUTER_THRESHOLD,
): RouterIndex {
  const docs: Array<{ id: string; phrases: string[] }> = recipes.map((r) => ({
    id: r.id,
    phrases: locales.flatMap((l) => r.triggers[l] ?? []).map(normalizeQuery).filter(Boolean),
  }));
  if (recipes === RECIPES || recipes.length > 5) {
    docs.push({
      id: OUT_OF_SCOPE_ID,
      phrases: locales.flatMap((l) => OUT_OF_SCOPE[l] ?? []).map(normalizeQuery),
    });
  }
  const df = new Map<string, number>();
  const dfStem = new Map<string, number>();
  for (const d of docs) {
    const words = new Set<string>();
    const stems = new Set<string>();
    for (const p of d.phrases) {
      for (const t of contentTokens(p)) {
        words.add(t);
        const s = stemOf(t);
        if (s) stems.add(s);
      }
    }
    words.forEach((w) => df.set(w, (df.get(w) ?? 0) + 1));
    stems.forEach((s) => dfStem.set(s, (dfStem.get(s) ?? 0) + 1));
  }
  const n = Math.max(1, docs.length);
  const idf = (c: number) => Math.log(1 + n / c);
  const weights: Weights = {
    word: new Map([...df].map(([k, c]) => [k, idf(c)])),
    stem: new Map([...dfStem].map(([k, c]) => [k, idf(c)])),
    unseen: idf(1),
  };
  const phrases: RouterIndex["phrases"] = [];
  const intents: string[] = [];
  for (const d of docs) {
    d.phrases.forEach((p, i) => {
      phrases.push({ recipeId: d.id, vec: embed(p, weights) });
      intents.push(`${d.id}#${i}`);
    });
  }
  return { threshold, locales, weights, phrases, protos: { intents, dim: DIM } };
}

/** Locales to route over: the UI language, English, and the witness's modern language (§8.1). */
export function routingLocales(uiLocale: string, witnessLanguage?: string): CopilotLocale[] {
  const base = uiLocale.split("-")[0];
  const out = new Set<CopilotLocale>();
  const known: CopilotLocale[] = ["en", "es", "pt", "ca", "gl", "eu"];
  // Community locales route through their fallback language (ast/an → es, oc → ca, qu/gn/ay → es).
  const mapped = base === "oc" ? "ca" : ["ast", "an", "qu", "gn", "ay"].includes(base) ? "es" : base;
  if ((known as string[]).includes(mapped)) out.add(mapped as CopilotLocale);
  out.add("en");
  const witness: Record<string, CopilotLocale> = { SPN: "es", PRT: "pt", GAL: "gl", CAT: "ca" };
  if (witnessLanguage && witness[witnessLanguage]) out.add(witness[witnessLanguage]);
  return [...out];
}

export function defaultRouterIndex(locales: CopilotLocale[] = DEFAULT_LOCALES): RouterIndex {
  const key = locales.join(",");
  let index = routerCache.get(key);
  if (!index) {
    index = buildRouterIndex(RECIPES, locales);
    routerCache.set(key, index);
  }
  return index;
}

/** Rank recipes for a query: best phrase score plus 10% of the second best (capped at 1). */
export function rankRecipes(query: string, router: RouterIndex = defaultRouterIndex()): RouteMatch[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const q = embed(normalized, router.weights);
  if (q.size === 0) return [];
  const best = new Map<string, [number, number]>();
  for (const p of router.phrases) {
    const s = dot(q, p.vec);
    const cur = best.get(p.recipeId);
    if (!cur) best.set(p.recipeId, [s, 0]);
    else if (s > cur[0]) best.set(p.recipeId, [s, cur[0]]);
    else if (s > cur[1]) cur[1] = s;
  }
  return [...best.entries()]
    .map(([recipeId, [a, b]]) => ({ recipeId, score: Math.min(1, a + 0.1 * b) }))
    .sort((x, y) => y.score - x.score);
}

/** Folio fast path first, then routing against recipe triggers. */
export function routeQuery(
  query: string,
  parsed: ParsedManuscript,
  router: RouterIndex = defaultRouterIndex(),
): RouteResult {
  const folioJump = resolveFolioJump(query, parsed);
  if (folioJump) return { kind: "folio", folioJump };

  const all = rankRecipes(query, router);
  const outOfScope = all[0]?.recipeId === OUT_OF_SCOPE_ID;
  const ranked = all.filter((m) => m.recipeId !== OUT_OF_SCOPE_ID);
  const top = !outOfScope && ranked[0] && ranked[0].score >= router.threshold ? ranked[0] : null;
  const rest = ranked.slice(top ? 1 : 0, (top ? 1 : 0) + MAX_ALTERNATIVES);
  return {
    kind: "recipe",
    top,
    alternatives: rest.filter((m) => m.score >= ALTERNATIVE_FLOOR),
    bestScore: ranked[0]?.score ?? 0,
    outOfScope,
  };
}

export type EmbeddingIntent =
  | { type: "fallback"; confidence: number }
  | { type: "execute"; recipeId: string; trigger: string; confidence: number }
  | { type: "suggest"; recipeId: string; trigger: string; confidence: number };

type TriggerEmbedIndex = {
  recipeIds: string[];
  triggers: string[];
  matrix: Float32Array;
  dim: number;
};

const triggerEmbedCache = new Map<string, TriggerEmbedIndex>();

function localeList(locale: string | readonly string[]): CopilotLocale[] {
  const known: CopilotLocale[] = ["en", "es", "pt", "ca", "gl", "eu"];
  const raw = typeof locale === "string" ? [locale, "en"] : locale;
  const out: CopilotLocale[] = [];
  for (const item of raw) {
    const base = item.split("-")[0];
    if ((known as string[]).includes(base) && !out.includes(base as CopilotLocale)) {
      out.push(base as CopilotLocale);
    }
  }
  if (out.length === 0) out.push("en");
  return out;
}

/**
 * One row per catalog trigger phrase. Built once per locale set from `RECIPES`
 * (the source compiled into `COPILOT_CATALOG`), so a query is one embed plus dots.
 */
export function warmEmbeddingIntentIndex(locale: string | readonly string[] = "es"): TriggerEmbedIndex {
  const locales = localeList(locale);
  const key = locales.join(",");
  const cached = triggerEmbedCache.get(key);
  if (cached) return cached;

  const recipeIds: string[] = [];
  const triggers: string[] = [];
  for (const recipe of RECIPES) {
    const seen = new Set<string>();
    for (const loc of locales) {
      for (const trigger of recipe.triggers[loc] ?? []) {
        const norm = trigger.trim().toLowerCase();
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        recipeIds.push(recipe.id);
        triggers.push(norm);
      }
    }
  }

  const dim = DEFAULT_DIM;
  const matrix = new Float32Array(triggers.length * dim);
  for (let i = 0; i < triggers.length; i++) {
    hashEmbedInto(triggers[i], matrix, i * dim, dim, true);
  }
  const built = { recipeIds, triggers, matrix, dim };
  triggerEmbedCache.set(key, built);
  return built;
}

/** Map a cosine onto direct dispatch, a suggestion chip, or passage-search fallback. */
export function embeddingBand(similarity: number): EmbeddingIntent["type"] {
  if (!(similarity >= EMBED_SUGGEST_THRESHOLD)) return "fallback";
  if (similarity >= EMBED_DIRECT_THRESHOLD) return "execute";
  return "suggest";
}

/**
 * Close-enough intent match. High cosine dispatches the recipe; the middle band
 * only names it; anything weaker leaves the query for passage search.
 */
export function resolveEmbeddingIntent(query: string, locale: string | readonly string[] = "es"): EmbeddingIntent {
  const q = query.trim();
  if (!q) return { type: "fallback", confidence: 0 };
  const index = warmEmbeddingIntentIndex(locale);
  if (index.recipeIds.length === 0) return { type: "fallback", confidence: 0 };

  const qVec = hashEmbed(q, index.dim);
  let maxSim = -1;
  let best = -1;
  for (let i = 0; i < index.recipeIds.length; i++) {
    const offset = i * index.dim;
    let sim = 0;
    for (let j = 0; j < index.dim; j++) sim += qVec[j] * index.matrix[offset + j];
    if (sim > maxSim) {
      maxSim = sim;
      best = i;
    }
  }

  const confidence = maxSim > 0 ? maxSim : 0;
  const band = embeddingBand(maxSim);
  if (band === "fallback" || best < 0) return { type: "fallback", confidence };
  const recipeId = index.recipeIds[best];
  const trigger = index.triggers[best];
  return band === "execute"
    ? { type: "execute", recipeId, trigger, confidence }
    : { type: "suggest", recipeId, trigger, confidence };
}
