import { buildBundleV2, isBundleV2, parseBundleJson, serializeBundleV2 } from "../utils/ingest/bundleV2";
import {
  alignSidecar,
  diffLines,
  hashWitnessText,
  lineAnchors,
  splitWitnessLines,
} from "../utils/ingest/sidecarAlign";
import { FACS_SIDECAR_FORMAT, type HsmsFacsSidecar, type SidecarLine } from "../utils/ingest/types";

function line(sourceLine: number, confidence = 0.9): SidecarLine {
  return {
    sourceLine,
    anchor: "",
    polygon: [[0, sourceLine * 10], [100, sourceLine * 10], [100, sourceLine * 10 + 8], [0, sourceLine * 10 + 8]],
    baseline: [[0, sourceLine * 10 + 6], [100, sourceLine * 10 + 6]],
    zone: "MainZone",
    confidence,
  };
}

function sidecarFor(lines: number[]): HsmsFacsSidecar {
  return {
    format: FACS_SIDECAR_FORMAT,
    witnessHash: "old",
    source: { kind: "iiif", rights: "PD", manifestUrl: "https://example.org/m.json" },
    pipeline: { jobId: "j1", stages: {} },
    folios: {
      "1r": {
        canvasId: "c1",
        imageService: "https://example.org/iiif/1r",
        pixelSize: [1000, 1500],
        geometry: { aspect: 1.5, writingArea: [0, 0, 1, 1], columns: [], meanLineSpacing: 0.02, linesPerColumn: [] },
        review: "machine",
        lines: lines.map((n) => line(n)),
      },
    },
  };
}

const OLD = ["[fol. 1r]", "{CB1.", "uno dos", "tres cuatro", "cinco seis", "}"].join("\n");

describe("diffLines", () => {
  it("emits equal/delete/insert entries covering both arrays", () => {
    const a = ["a", "b", "c", "d"];
    const b = ["a", "c", "x", "d", "e"];
    const diff = diffLines(a, b);
    expect(diff.filter((d) => d.op !== "insert").map((d) => d.oldIndex)).toEqual([0, 1, 2, 3]);
    expect(diff.filter((d) => d.op !== "delete").map((d) => d.newIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(diff.filter((d) => d.op === "delete").map((d) => a[d.oldIndex!])).toEqual(["b"]);
    expect(diff.filter((d) => d.op === "insert").map((d) => b[d.newIndex!])).toEqual(["x", "e"]);
  });

  it("handles empty sides and identical input", () => {
    expect(diffLines([], ["a"])).toEqual([{ op: "insert", oldIndex: null, newIndex: 0 }]);
    expect(diffLines(["a"], [])).toEqual([{ op: "delete", oldIndex: 0, newIndex: null }]);
    expect(diffLines(["a", "b"], ["a", "b"]).every((d) => d.op === "equal")).toBe(true);
  });
});

describe("lineAnchors", () => {
  it("disambiguates repeated lines by ordinal", () => {
    const [a, b, c] = lineAnchors(["x", "y", "x"]);
    expect(a.endsWith(":0")).toBe(true);
    expect(c.endsWith(":1")).toBe(true);
    expect(a.split(":")[0]).toBe(c.split(":")[0]);
    expect(b).not.toBe(a);
  });
});

describe("alignSidecar", () => {
  it("shifts links when lines are inserted above", () => {
    const next = ["[fol. 1r]", "{CB1.", "nueva linea", "uno dos", "tres cuatro", "cinco seis", "}"].join("\n");
    const result = alignSidecar(sidecarFor([2, 3, 4]), OLD, next);
    expect(result.sidecar.folios["1r"].lines.map((l) => l.sourceLine)).toEqual([3, 4, 5]);
    expect(result.stats).toMatchObject({ carried: 3, dropped: 0, unlinked: 1 });
    expect(result.unlinkedNewLines).toEqual([2]);
    expect(result.sidecar.witnessHash).toBe(hashWitnessText(next));
    expect(result.sidecar.witnessHash).not.toBe("old");
  });

  it("keeps the link for a modified line and drops deleted ones", () => {
    const next = ["[fol. 1r]", "{CB1.", "uno dos", "tres CUATRO", "}"].join("\n");
    const result = alignSidecar(sidecarFor([2, 3, 4]), OLD, next);
    const lines = result.sidecar.folios["1r"].lines;
    expect(lines.map((l) => l.sourceLine)).toEqual([2, 3]);
    expect(result.stats).toMatchObject({ carried: 1, modified: 1, dropped: 1 });
    expect(lines[1].anchor).toBe(lineAnchors(splitWitnessLines(next))[3]);
  });

  it("re-anchors a moved line by content", () => {
    const next = ["[fol. 1r]", "{CB1.", "tres cuatro", "cinco seis", "otra", "uno dos", "}"].join("\n");
    const result = alignSidecar(sidecarFor([2]), OLD, next);
    const lines = result.sidecar.folios["1r"].lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].sourceLine).toBe(5);
    expect(result.stats.dropped).toBe(0);
  });

  it("is a no-op for identical text apart from the hash", () => {
    const sidecar = sidecarFor([2, 3, 4]);
    const result = alignSidecar(sidecar, OLD, OLD);
    expect(result.sidecar.folios["1r"].lines.map((l) => l.sourceLine)).toEqual([2, 3, 4]);
    expect(result.stats).toMatchObject({ carried: 3, modified: 0, dropped: 0, unlinked: 0 });
    expect(sidecar.witnessHash).toBe("old");
  });

  it("treats CRLF and LF text as equivalent", () => {
    expect(hashWitnessText("a\r\nb")).toBe(hashWitnessText("a\nb"));
  });
});

describe("bundle v2", () => {
  const bundle = buildBundleV2({
    text: OLD,
    metadata: { title: "Test witness", rights: "PD" },
    sidecar: sidecarFor([2]),
    iiif: { manifestUrl: "https://example.org/m.json" },
    exportedAt: "2026-10-15T00:00:00.000Z",
  });

  it("round-trips through parseBundleJson", () => {
    expect(isBundleV2(bundle)).toBe(true);
    const parsed = parseBundleJson(serializeBundleV2(bundle));
    expect(parsed.version).toBe(2);
    if (parsed.version === 2) {
      expect(parsed.bundle.manifest.witness.hash).toBe(hashWitnessText(OLD));
      expect(parsed.bundle.manifest.sidecar?.format).toBe(FACS_SIDECAR_FORMAT);
    }
  });

  it("still accepts v1 bundles unchanged", () => {
    const v1 = {
      manifest: {
        format: "hsms-scriptorium-bundle/1",
        exportedAt: "x",
        workspace: { id: "w", manuscriptTitle: "T", transcriptionText: "t", assetMap: {} },
      },
      assets: {},
      folioBackgrounds: {},
    };
    const parsed = parseBundleJson(JSON.stringify(v1));
    expect(parsed.version).toBe(1);
  });

  it("rejects unknown formats", () => {
    expect(() => parseBundleJson(JSON.stringify({ manifest: { format: "nope" } }))).toThrow();
    expect(isBundleV2({ manifest: { format: "hsms-scriptorium-bundle/2" } })).toBe(false);
  });
});
