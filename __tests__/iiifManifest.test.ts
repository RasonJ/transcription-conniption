import {
  fetchIiifManifest,
  iiifImageUrl,
  iiifText,
  parseIiifManifest,
} from "../utils/ingest/iiifManifest";
import { INGEST_CAPABILITIES } from "../utils/ingest/types";

const MANIFEST = {
  "@context": "http://iiif.io/api/presentation/3/context.json",
  id: "https://example.org/iiif/ms1/manifest",
  type: "Manifest",
  label: { en: ["Test Codex"], es: ["Códice de prueba"] },
  rights: "http://creativecommons.org/publicdomain/mark/1.0/",
  requiredStatement: {
    label: { en: ["Attribution"] },
    value: { en: ["Example Library"] },
  },
  metadata: [{ label: { en: ["Shelfmark"] }, value: { none: ["MS 42"] } }],
  items: [
    {
      id: "https://example.org/iiif/ms1/canvas/1",
      type: "Canvas",
      label: { none: ["1r"] },
      width: 3000,
      height: 4000,
      items: [
        {
          id: "https://example.org/iiif/ms1/page/1",
          type: "AnnotationPage",
          items: [
            {
              id: "https://example.org/iiif/ms1/anno/1",
              type: "Annotation",
              motivation: "painting",
              target: "https://example.org/iiif/ms1/canvas/1",
              body: {
                id: "https://example.org/iiif/img1/full/max/0/default.jpg",
                type: "Image",
                service: [{ id: "https://example.org/iiif/img1/", type: "ImageService3" }],
              },
            },
          ],
        },
      ],
    },
    {
      id: "https://example.org/iiif/ms1/canvas/2",
      type: "Canvas",
      label: { en: ["1v"] },
      items: [
        {
          type: "AnnotationPage",
          items: [
            {
              type: "Annotation",
              motivation: "painting",
              body: {
                id: "https://example.org/static/2.jpg",
                type: "Image",
                width: 1200,
                height: 1800,
                service: [{ "@id": "https://example.org/iiif/img2", "@type": "ImageService2" }],
              },
            },
          ],
        },
      ],
    },
    {
      id: "https://example.org/iiif/ms1/canvas/3",
      type: "Canvas",
      items: [],
    },
  ],
};

describe("iiif manifest", () => {
  it("extracts labels, sizes and image services from a P3 manifest", () => {
    const draft = parseIiifManifest(MANIFEST, "https://example.org/m.json");
    expect(draft.label).toBe("Test Codex");
    expect(draft.manifestUrl).toBe("https://example.org/m.json");
    expect(draft.rights).toContain("publicdomain");
    expect(draft.attribution).toBe("Example Library");
    expect(draft.metadata).toEqual({ Shelfmark: "MS 42" });
    expect(draft.canvases).toHaveLength(3);
    expect(draft.canvases[0]).toMatchObject({
      index: 0,
      label: "1r",
      width: 3000,
      height: 4000,
      imageService: "https://example.org/iiif/img1",
    });
    expect(draft.canvases[1]).toMatchObject({
      label: "1v",
      width: 1200,
      height: 1800,
      imageService: "https://example.org/iiif/img2",
    });
    expect(draft.canvases[2].label).toBe("3");
    expect(draft.canvases[2].imageService).toBeUndefined();
  });

  it("builds IIIF Image API URLs", () => {
    const [first, , third] = parseIiifManifest(MANIFEST).canvases;
    expect(iiifImageUrl(first)).toBe("https://example.org/iiif/img1/full/max/0/default.jpg");
    expect(iiifImageUrl(first, 400)).toBe("https://example.org/iiif/img1/full/400,/0/default.jpg");
    expect(iiifImageUrl(third)).toBeUndefined();
  });

  it("resolves language maps", () => {
    expect(iiifText({ es: ["hola"], en: ["hello"] })).toBe("hello");
    expect(iiifText({ es: ["hola"] })).toBe("hola");
    expect(iiifText({ none: ["x"] })).toBe("x");
    expect(iiifText("plain")).toBe("plain");
    expect(iiifText(undefined)).toBe("");
  });

  it("rejects non-manifests and other Presentation versions", () => {
    expect(() => parseIiifManifest({ type: "Collection" })).toThrow();
    expect(() => parseIiifManifest(null)).toThrow();
    expect(() =>
      parseIiifManifest({
        "@context": "http://iiif.io/api/presentation/2/context.json",
        type: "Manifest",
      }),
    ).toThrow(/version/);
  });

  it("fetches through an injected fetch implementation", async () => {
    const fetchImpl = (async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
      url,
    })) as unknown as typeof fetch;
    const draft = await fetchIiifManifest("https://example.org/m.json", { fetchImpl });
    expect(draft.canvases).toHaveLength(3);
    expect(draft.manifestUrl).toBe("https://example.org/m.json");

    const failing = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(fetchIiifManifest("https://example.org/x", { fetchImpl: failing })).rejects.toThrow(
      /404/,
    );
  });

  it("lists ingest capabilities", () => {
    expect([...INGEST_CAPABILITIES]).toEqual(["pdf_ingest", "htr", "iiif_hosting"]);
  });
});
