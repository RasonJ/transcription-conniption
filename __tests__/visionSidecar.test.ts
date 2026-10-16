/** SPEC-PDF-INGEST §5/§7: machine drafts carry folio review states that survive edits. */
import { askCopilot } from "../utils/copilot/ask";
import { sidecarFromMachineTranscription, withFolioReview, folioLineRanges } from "../utils/ingest/visionSidecar";
import { touchWorkspace } from "../utils/scriptoriumWorkspace";
import { parseHsMsText } from "../utils/manuscriptParser";
import type { ScriptoriumWorkspace } from "../constants/manuscript";

const TEXT = `{RMK: Draft.}
[fol. 1r]
{CB1.
el rey dixo
}
[fol. 1v]
{CB1.
la reyna
}`;

const meta = {
  pages: [
    { folioId: "1r", pageNumber: 1, errorCount: 0 },
    { folioId: "1v", pageNumber: 2, errorCount: 2 },
  ],
  sourceKind: "pdf" as const,
};

describe("machine-transcription sidecar", () => {
  it("records folio line ranges and review states", () => {
    expect([...folioLineRanges(TEXT).keys()]).toEqual(["1r", "1v"]);
    const sc = sidecarFromMachineTranscription(TEXT, meta, new Date(0));
    expect(sc.folios["1r"].review).toBe("machine");
    expect(sc.folios["1v"].review).toBe("needs_attention");
    expect(sc.folios["1r"].lines.map((l) => l.sourceLine)).toEqual([1, 2, 3, 4]);
  });

  it("keeps lines linked when the researcher edits the text", () => {
    const ws: ScriptoriumWorkspace = {
      id: "w",
      manuscriptTitle: "t",
      transcriptionText: TEXT,
      assetMap: {},
      createdAt: "",
      lastModified: "",
      facsSidecar: sidecarFromMachineTranscription(TEXT, meta),
    };
    const edited = TEXT.replace("{RMK: Draft.}", "{RMK: Draft.}\n{RMK: Second remark.}");
    const next = touchWorkspace(ws, { transcriptionText: edited });
    expect(next.facsSidecar!.folios["1v"].lines.map((l) => l.sourceLine)).toEqual([6, 7, 8, 9]);
    expect(next.facsSidecar!.witnessHash).not.toBe(ws.facsSidecar!.witnessHash);
  });

  it("feeds the copilot's unreviewed-folios recipe", () => {
    const parsed = parseHsMsText(TEXT);
    let sidecar = sidecarFromMachineTranscription(TEXT, meta);
    expect(askCopilot("recipe ingest.unreviewed", parsed, { sidecar }).params).toEqual({ total: 2 });
    sidecar = withFolioReview(sidecar, "1r", "reviewed");
    expect(askCopilot("recipe ingest.unreviewed", parsed, { sidecar }).params).toEqual({ total: 1 });
    expect(askCopilot("recipe ingest.low_confidence", parsed, { sidecar }).messageKey).toBe("noConfidence");
  });
});
