import {
  classifyStudioUpload,
  isPlainTextUploadFile,
  isVisionUploadFile,
  looksLikeHsmsAscii,
  looksLikeTranscribeRequest,
} from "../utils/visionUpload";

describe("visionUpload helpers", () => {
  it("detects images and PDFs for vision OCR", () => {
    expect(isVisionUploadFile({ name: "leaf.png", type: "image/png" })).toBe(true);
    expect(isVisionUploadFile({ name: "scan.PDF", type: "" })).toBe(true);
    expect(isVisionUploadFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
  });

  it("detects plain-text HSMS uploads", () => {
    expect(isPlainTextUploadFile({ name: "TEXT.NUN.txt", type: "text/plain" })).toBe(true);
    expect(isPlainTextUploadFile({ name: "leaf.png", type: "image/png" })).toBe(false);
  });

  it("routes studio uploads: transcription docs bypass Azure, images/PDFs go to vision", () => {
    expect(classifyStudioUpload({ name: "TEXT.NUN.txt", type: "text/plain" })).toBe("text");
    expect(classifyStudioUpload({ name: "witness.hsms" })).toBe("text");
    expect(classifyStudioUpload({ name: "notes.docx" })).toBe("text");
    expect(classifyStudioUpload({ name: "leaf.png", type: "image/png" })).toBe("vision");
    expect(classifyStudioUpload({ name: "scan.pdf", mimeType: "application/pdf" })).toBe("vision");
    expect(classifyStudioUpload({ name: "photo.bin", type: "application/octet-stream" })).toBe(
      "unsupported",
    );
  });

  it("detects pasted HSMS ASCII without sending to Azure", () => {
    expect(looksLikeHsmsAscii("[fol. 1r]\n{CB1.\nx\n}")).toBe(true);
    expect(looksLikeHsmsAscii("hello world")).toBe(false);
  });

  it("recognizes transcribe phrasing", () => {
    expect(looksLikeTranscribeRequest("transcribe this into hsms")).toBe(true);
    expect(looksLikeTranscribeRequest("")).toBe(true);
    expect(looksLikeTranscribeRequest("go to fol. 2r")).toBe(false);
  });
});
