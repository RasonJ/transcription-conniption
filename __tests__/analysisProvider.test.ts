/** SPEC-LIGHTWEIGHT §5 / SPEC-COPILOT §13: local recipes run in-process; Tier D goes remote. */
import { CompositeProvider, LocalAnalysisProvider, RemoteAnalysisProvider } from "../utils/analysis/provider";
import { loadPersistedOverview, persistOverview, overviewCacheKey, type KeyValueStore } from "../utils/copilot/persistentOverview";
import { parseHsMsText } from "../utils/manuscriptParser";

const SAMPLE = `[fol. 1r]
{CB1.
1 el (^rey) mando (dios) que
2 <<q>> el rey dixo
}`;

describe("analysis providers", () => {
  const parsed = parseHsMsText(SAMPLE);
  const witness = { hash: "w1", title: "sample" };

  it("runs catalog recipes locally", async () => {
    const res = await new LocalAnalysisProvider().run<{ recipeId: string; params?: Record<string, unknown> }>({
      recipeId: "corr.deletions_scribal_vs_editorial",
      params: {},
      witness,
      parsed,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.params).toMatchObject({ scribal: 1, editorial: 1 });
  });

  it("routes server capabilities to the remote provider and keeps text on device", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ?? "" });
      return { ok: true, status: 200, json: async () => ({ headline: "server" }) };
    }) as unknown as typeof fetch;
    const composite = new CompositeProvider(new LocalAnalysisProvider(), new RemoteAnalysisProvider("https://api.example/", fakeFetch));
    const res = await composite.run<{ headline: string }>({
      recipeId: "syntax.clitic_position",
      capability: "pos_tagging",
      params: {},
      witness,
      parsed,
    });
    expect(res).toEqual({ ok: true, providerId: "remote", data: { headline: "server" } });
    expect(calls[0].url).toBe("https://api.example/v1/recipes/syntax.clitic_position");
    expect(calls[0].body).not.toContain("rey");
    const local = await composite.run({ recipeId: "abbr.superscripts", capability: "facets", params: {}, witness, parsed });
    expect(local.providerId).toBe("local");
    expect(local.ok).toBe(true);
  });
});

describe("persisted overview (LRU)", () => {
  function memoryStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
  }
  const entry = (n: number) => [{ recipeId: "abbr.superscripts", category: "paleography" as const, chipLabel: "x".repeat(n), count: 1, headline: "h" }];

  it("round-trips and evicts least recently used past the budget", async () => {
    const store = memoryStore();
    await persistOverview("A", entry(100), { store, budgetBytes: 1000, now: 1 });
    await persistOverview("B", entry(100), { store, budgetBytes: 1000, now: 2 });
    expect(await loadPersistedOverview("A", store)).toEqual(entry(100));
    await persistOverview("C", entry(100), { store, budgetBytes: 1000, now: 3 });
    // budget fits two entries; A was touched by the load (usedAt = now) so B is evicted
    expect(store.data.has(overviewCacheKey("B"))).toBe(false);
    expect(store.data.has(overviewCacheKey("A"))).toBe(true);
    expect(store.data.has(overviewCacheKey("C"))).toBe(true);
  });
});
