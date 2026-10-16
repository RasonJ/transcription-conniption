import {
  canSkipOstaConvert,
  hashTranscriptionSource,
  sourceHashPath,
} from "../utils/ostaConvertCache";

describe("ostaConvertCache", () => {
  it("hashes transcription text stably", () => {
    const a = hashTranscriptionSource("hello\n");
    const b = hashTranscriptionSource("hello\n");
    const c = hashTranscriptionSource("hello\nworld");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a .source.sha256 sidecar path", () => {
    expect(sourceHashPath("/out", "TEXT.DEMO")).toContain("TEXT.DEMO.source.sha256");
  });

  it("skips only when hash matches and artifacts exist", () => {
    const hash = hashTranscriptionSource("witness");
    expect(
      canSkipOstaConvert({
        sourceHash: hash,
        storedHash: hash,
        hasHtml: true,
        hasNative: true,
        hasLibrary: true,
      }),
    ).toBe(true);

    expect(
      canSkipOstaConvert({
        sourceHash: hash,
        storedHash: hash,
        hasHtml: true,
        hasNative: false,
        hasLibrary: true,
      }),
    ).toBe(false);

    expect(
      canSkipOstaConvert({
        sourceHash: hash,
        storedHash: "deadbeef",
        hasHtml: true,
        hasNative: true,
        hasLibrary: true,
      }),
    ).toBe(false);

    expect(
      canSkipOstaConvert({
        sourceHash: hash,
        storedHash: hash,
        hasHtml: true,
        hasNative: true,
        hasLibrary: true,
        force: true,
      }),
    ).toBe(false);
  });
});
