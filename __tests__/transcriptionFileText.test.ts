import {
  isLegacyBinaryWordDoc,
  isTranscriptionDocumentFile,
  isWordTranscriptionFile,
  transcriptionTextFromHsmsPayload,
} from "../utils/transcriptionFileText";
import { HSMS_BUNDLE_FORMAT } from "../utils/hsmsBundle";
import { classifyStudioUpload } from "../utils/visionUpload";

describe("transcriptionFileText", () => {
  it("accepts .txt, .hsms, and Word docs as local transcription uploads", () => {
    expect(isTranscriptionDocumentFile({ name: "TEXT.NUN.txt" })).toBe(true);
    expect(isTranscriptionDocumentFile({ name: "witness.hsms" })).toBe(true);
    expect(isTranscriptionDocumentFile({ name: "notes.docx" })).toBe(true);
    expect(
      isWordTranscriptionFile({
        name: "notes.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe(true);
    expect(isTranscriptionDocumentFile({ name: "leaf.png", type: "image/png" })).toBe(false);
  });

  it("flags legacy binary .doc for a convert-to-docx message", () => {
    expect(isLegacyBinaryWordDoc({ name: "old.doc", type: "application/msword" })).toBe(true);
    expect(isLegacyBinaryWordDoc({ name: "new.docx" })).toBe(false);
  });

  it("extracts witness text from scriptorium .hsms JSON bundles", () => {
    const json = JSON.stringify({
      manifest: {
        format: HSMS_BUNDLE_FORMAT,
        exportedAt: "2026-01-01",
        workspace: {
          transcriptionText: "[fol. 1r]\n{CB1.\nok\n}",
          manuscriptTitle: "Demo",
          sourceFileName: "demo.hsms",
        },
      },
      assets: {},
      folioBackgrounds: {},
    });
    expect(transcriptionTextFromHsmsPayload(json)).toContain("[fol. 1r]");
    expect(transcriptionTextFromHsmsPayload("[fol. 1r]\nplain")).toBeNull();
  });

  it("routes studio uploads so transcription docs bypass Azure", () => {
    expect(classifyStudioUpload({ name: "a.txt" })).toBe("text");
    expect(classifyStudioUpload({ name: "a.hsms" })).toBe("text");
    expect(classifyStudioUpload({ name: "a.docx" })).toBe("text");
    expect(classifyStudioUpload({ name: "a.pdf" })).toBe("vision");
  });
});
