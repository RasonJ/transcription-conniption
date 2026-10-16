import { folioIdFromCanvasLabel, sequentialFolioId, skeletonFromIiifDraft } from "../utils/ingest/iiifWorkspace";
import { parseHsMsText } from "../utils/manuscriptParser";
import type { IiifWitnessDraft } from "../utils/ingest/iiifManifest";

const draft = (labels: string[]): IiifWitnessDraft => ({
  manifestId: "https://lib.example/iiif/ms1/manifest",
  label: "Libro {de} los gatos",
  metadata: {},
  canvases: labels.map((label, index) => ({
    index,
    canvasId: `c${index}`,
    label,
    imageService: `https://lib.example/iiif/img${index}`,
  })),
});

describe("IIIF → workspace skeleton", () => {
  it("parses folio labels", () => {
    expect(folioIdFromCanvasLabel("fol. 12v")).toBe("12v");
    expect(folioIdFromCanvasLabel("f3R")).toBe("3r");
    expect(folioIdFromCanvasLabel("Cover")).toBeNull();
    expect([0, 1, 2].map(sequentialFolioId)).toEqual(["1r", "1v", "2r"]);
  });

  it("builds a parseable skeleton with page images per folio", () => {
    const sk = skeletonFromIiifDraft(draft(["fol. 1r", "fol. 1v", "fol. 2r"]));
    expect(sk.sequentialIds).toBe(false);
    expect(Object.keys(sk.folioBackgrounds)).toEqual(["1r", "1v", "2r"]);
    expect(sk.folioBackgrounds["1v"]).toBe("https://lib.example/iiif/img1/full/2000,/0/default.jpg");
    const parsed = parseHsMsText(sk.transcriptionText);
    expect(parsed.folios.map((f) => f.id)).toEqual(["1r", "1v", "2r"]);
    expect(sk.transcriptionText).not.toContain("{de}");
  });

  it("falls back to sequential ids when labels are not folio numbers", () => {
    const sk = skeletonFromIiifDraft(draft(["Front cover", "Inside", "Page 3"]));
    expect(sk.sequentialIds).toBe(true);
    expect(Object.keys(sk.folioBackgrounds)).toEqual(["1r", "1v", "2r"]);
  });
});
