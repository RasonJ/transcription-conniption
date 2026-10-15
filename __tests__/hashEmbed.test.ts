import {
  cosineSim,
  hashEmbed,
  hashEmbedInto,
  l2NormalizeSlice,
} from "../utils/embeddings/hashEmbed";

describe("hashEmbed", () => {
  it("returns a unit-norm vector of the requested dimension", () => {
    const v = hashEmbed("rubric heading gold leaf", 64);
    expect(v).toHaveLength(64);
    let normSq = 0;
    for (let i = 0; i < v.length; i++) normSq += v[i] * v[i];
    expect(Math.sqrt(normSq)).toBeCloseTo(1, 5);
  });

  it("is stable for identical input", () => {
    const a = hashEmbed("folio verso recto");
    const b = hashEmbed("folio verso recto");
    expect(cosineSim(a, b)).toBeCloseTo(1, 5);
  });

  it("ranks related phrases above unrelated ones", () => {
    const q = hashEmbed("find rubrics and red titles");
    const related = hashEmbed("show rubric headings in red ink");
    const unrelated = hashEmbed("integer cents billing claim denial");
    expect(cosineSim(q, related)).toBeGreaterThan(cosineSim(q, unrelated));
  });

  it("hashEmbedInto writes into an offset slice", () => {
    const buf = new Float32Array(16);
    hashEmbedInto("abc", buf, 4, 8, true);
    let normSq = 0;
    for (let i = 4; i < 12; i++) normSq += buf[i] * buf[i];
    expect(Math.sqrt(normSq)).toBeCloseTo(1, 5);
    expect(buf[0]).toBe(0);
    expect(buf[15]).toBe(0);
  });

  it("l2NormalizeSlice leaves a zero vector unchanged", () => {
    const z = new Float32Array(8);
    l2NormalizeSlice(z, 0, 8);
    expect([...z]).toEqual(Array(8).fill(0));
  });
});
