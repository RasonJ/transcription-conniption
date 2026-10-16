import {
  isPlainTextUploadFile,
  isVisionUploadFile,
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

  it("recognizes transcribe phrasing", () => {
    expect(looksLikeTranscribeRequest("transcribe this into hsms")).toBe(true);
    expect(looksLikeTranscribeRequest("")).toBe(true);
    expect(looksLikeTranscribeRequest("go to fol. 2r")).toBe(false);
  });
});
