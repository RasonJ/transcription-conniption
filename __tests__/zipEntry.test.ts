import JSZip from "jszip";
import { readZipEntryText, readZipJson } from "../utils/zipEntry";

describe("zip entries", () => {
  it("reads a JSON entry from the archive without expanding it to disk", async () => {
    const zip = new JSZip();
    zip.file("corpus-tfidf.json", JSON.stringify({ "es:rey": 4.2 }));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    await expect(readZipJson<Record<string, number>>(bytes, "corpus-tfidf.json")).resolves.toEqual({
      "es:rey": 4.2,
    });
  });

  it("reads a text entry by its original name", async () => {
    const zip = new JSZip();
    zip.file("es.index.tsv", "term\ttf\nrey\t3\n");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    await expect(readZipEntryText(bytes, "es.index.tsv")).resolves.toBe("term\ttf\nrey\t3\n");
  });

  it("rejects a zip that does not contain the expected entry", async () => {
    const zip = new JSZip();
    zip.file("other.txt", "x");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(readZipEntryText(bytes, "es.index.tsv")).rejects.toThrow(/es\.index\.tsv/);
  });
});
