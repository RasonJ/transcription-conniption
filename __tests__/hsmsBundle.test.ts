import { HSMS_BUNDLE_FORMAT, parseHsmsBundleJson } from "../utils/hsmsBundle";

describe("hsmsBundle", () => {
  it("parses bundle JSON with expected format version", () => {
    const json = JSON.stringify({
      manifest: {
        format: HSMS_BUNDLE_FORMAT,
        exportedAt: "2026-01-01T00:00:00.000Z",
        workspace: {
          id: "ws_test",
          manuscriptTitle: "Test",
          transcriptionText: "[fol. 1r]\n1 texto",
          assetMap: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          lastModified: "2026-01-01T00:00:00.000Z",
        },
      },
      assets: {},
      folioBackgrounds: {},
    });
    const bundle = parseHsmsBundleJson(json);
    expect(bundle.manifest.workspace.manuscriptTitle).toBe("Test");
  });

  it("rejects unknown bundle format", () => {
    expect(() => parseHsmsBundleJson(JSON.stringify({ manifest: { format: "other" } }))).toThrow(
      "Unsupported",
    );
  });
});
