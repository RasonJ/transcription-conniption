import { RECIPES, getRecipe } from "../utils/copilot/catalog";
import { executeDsl, formatDsl, parseDsl } from "../utils/copilot/dsl";
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
} from "../utils/copilot/executors/tierA";
import { buildFacetIndex } from "../utils/copilot/facetIndex";
import { askCopilot } from "../utils/copilot/ask";
import { precomputeEager } from "../utils/copilot/precompute";
import { parseCopilotSample } from "./copilotFixture";

describe("copilot tier A executors", () => {
  const parsed = parseCopilotSample();
  const facets = buildFacetIndex(parsed);

  it("corr.deletions_scribal_vs_editorial", () => {
    const r = deletionsScribalVsEditorial(facets, parsed);
    expect(r.breakdown).toEqual([
      { label: "scribal (^…)", value: 3 },
      { label: "editorial (…)", value: 1 },
    ]);
    expect(r.count).toBe(4);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({ folioId: "1r", label: "scribal", detail: "borrado" });
    expect(r.headline).toContain("3 scribal deletions");
  });

  it("corr.non_original_hands", () => {
    const r = nonOriginalHands(facets, parsed);
    expect(r.count).toBe(3);
    expect(r.breakdown).toEqual(
      expect.arrayContaining([
        { label: "hand 2 · scribal_insertion", value: 1 },
        { label: "hand 2 · reconstructed_text", value: 1 },
        { label: "hand 3 · scribal_insertion", value: 1 },
      ]),
    );
  });

  it("abbr.superscripts", () => {
    const r = superscripts(facets, parsed);
    expect(r.breakdown?.[0].value).toBe(1);
    expect(r.breakdown?.[1].value).toBe(3);
  });

  it("illum.initial_hierarchy", () => {
    const r = initialHierarchy(facets, parsed);
    expect(r.breakdown).toEqual([
      { label: "IN2", value: 1 },
      { label: "IN3", value: 1 },
    ]);
    expect(r.rows[0]).toMatchObject({ folioId: "1r", label: "IN3", detail: "A" });
  });

  it("marg.gloss_vs_addenda", () => {
    const r = glossVsAddenda(facets, parsed);
    expect(r.breakdown).toEqual([
      { label: "gloss {GL.}", value: 2 },
      { label: "addendum {AD.}", value: 1 },
    ]);
    expect(r.rows.map((x) => x.label)).toEqual(["gloss", "addendum", "gloss"]);
  });

  it("damage.illegible", () => {
    const r = damageIllegible(facets, parsed);
    expect(r.breakdown?.slice(0, 2)).toEqual([
      { label: "[??]", value: 1 },
      { label: "[???]", value: 1 },
    ]);
  });

  it("damage.reconstructions_by_hand", () => {
    const r = reconstructionsByHand(facets, parsed);
    expect(r.count).toBe(2);
    expect(r.breakdown).toEqual([
      { label: "hand 2", value: 1 },
      { label: "unmarked hand", value: 1 },
    ]);
  });

  it("layout.wrapback", () => {
    const r = layoutWrapback(facets, parsed);
    expect(r.breakdown).toEqual([
      { label: "%2", value: 1 },
      { label: "%3", value: 1 },
    ]);
  });

  it("lex.code_switching and ml.foreign_ratio", () => {
    const switching = codeSwitching(facets, parsed);
    expect(switching.breakdown).toEqual([{ label: "LAT", value: 1 }]);
    expect(switching.rows[0]).toMatchObject({ folioId: "1r", label: "LAT" });

    const ratio = foreignRatio(facets, parsed);
    expect(ratio.count).toBe(3);
    expect(ratio.headline).toMatch(/^\d+\.\d% of words \(3 of \d+\)/);
  });

  it("precomputes every eager recipe", () => {
    const overview = precomputeEager(parsed, facets);
    const eager = RECIPES.filter((r) => r.precompute === "eager");
    expect(overview).toHaveLength(eager.length);
    expect(overview.find((o) => o.recipeId === "corr.deletions_scribal_vs_editorial")?.count).toBe(4);
  });

  it("every recipe has an English trigger", () => {
    for (const r of RECIPES) expect(r.triggers.en.length).toBeGreaterThan(0);
  });
});

describe("copilot dsl", () => {
  const parsed = parseCopilotSample();
  const facets = buildFacetIndex(parsed);

  it("parses and formats the supported forms", () => {
    const q = parseDsl("count tokens where type = scribal_deletion");
    expect(q).toEqual({
      kind: "count",
      target: "tokens",
      where: [{ field: "type", op: "=", value: "scribal_deletion" }],
      groupBy: [],
    });
    expect(formatDsl(q!)).toBe("count tokens where type = scribal_deletion");

    const hands = parseDsl("count tokens where hand >= 2 group by hand, type");
    expect(hands?.where).toEqual([{ field: "hand", op: ">=", value: 2 }]);
    expect(hands?.groupBy).toEqual(["hand", "type"]);
  });

  it("returns null for non-DSL input", () => {
    expect(parseDsl("show scribal deletions")).toBeNull();
    expect(parseDsl("count tokens where type = nonsense")).toBeNull();
    expect(parseDsl("count tokens where hand >= x")).toBeNull();
    expect(parseDsl("count tokens extra")).toBeNull();
    expect(parseDsl("")).toBeNull();
  });

  it("executes counts over the facet index", () => {
    expect(executeDsl(parseDsl("count tokens where type = scribal_deletion")!, facets, parsed).count).toBe(3);
    expect(executeDsl(parseDsl("count tokens where hand >= 2")!, facets, parsed).count).toBe(3);
    const grouped = executeDsl(
      parseDsl("count tokens where type = scribal_deletion group by folio")!,
      facets,
      parsed,
    );
    expect(grouped.breakdown).toEqual([
      { label: "folio 1r", value: 1 },
      { label: "folio 1v", value: 2 },
    ]);
  });

  it("is used by askCopilot before routing", () => {
    const answer = askCopilot("count tokens where type = scribal_deletion", parsed, { facets });
    expect(answer.recipeId).toBe("dsl.count");
    expect(answer.dsl).toBe("count tokens where type = scribal_deletion");
    expect(answer.tier).toBe("A");
  });
});

describe("copilot ask", () => {
  const parsed = parseCopilotSample();
  const facets = buildFacetIndex(parsed);

  it("keeps the folio fast path", () => {
    const answer = askCopilot("go to folio 1v", parsed, { facets });
    expect(answer.recipeId).toBe("nav.folio");
    expect(answer.navigate?.folioId).toBe("1v");
  });

  it("answers a routed Tier A question with tappable rows", () => {
    const answer = askCopilot("show scribal deletions versus editorial deletions", parsed, { facets });
    expect(answer.recipeId).toBe("corr.deletions_scribal_vs_editorial");
    expect(answer.tier).toBe("A");
    expect(answer.rows.length).toBeGreaterThan(0);
    expect(answer.rows[0].folioId).toBeDefined();
    expect(getRecipe(answer.recipeId)?.method).toBe(answer.method);
  });

  it("falls back to passage search with alternatives when nothing matches", () => {
    const answer = askCopilot("zzzz qqqq xxxx", parsed, { facets });
    expect(answer.recipeId).toBe("search.passages");
    expect(answer.headline).toContain("No confident recipe match");
  });

  it("returns an empty answer for blank input", () => {
    expect(askCopilot("   ", parsed).recipeId).toBe("none");
  });
});
