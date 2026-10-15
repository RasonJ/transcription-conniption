import type { ParsedManuscript } from "../constants/manuscript";
import {
  parseNativeBundleMeta,
  parseNativeTranscriptionSource,
} from "../scripts/readNativeBundle";
import {
  HSMS_NATIVE_BUNDLE_FORMAT,
  generateNativeTypeScriptModule,
} from "../utils/ostaBatchConverter";

const EMPTY_PARSED: ParsedManuscript = {
  metadata: {
    author: "",
    title: "",
    imprint: {},
    witness: {},
  },
  folios: [],
  stats: {
    totalWords: 0,
    totalLines: 0,
    rubricCount: 0,
    glossCount: 0,
  },
};

describe("parseNativeTranscriptionSource", () => {
  it("extracts transcriptionText from a generated native module", () => {
    const source = generateNativeTypeScriptModule({
      format: HSMS_NATIVE_BUNDLE_FORMAT,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sourceFileName: "sample.txt",
      manuscriptTitle: "Sample",
      transcriptionText: '{RMK: Author.}\n[fol. 1r]\n1 hello "quoted"',
      parsedManuscript: EMPTY_PARSED,
    });

    expect(parseNativeTranscriptionSource(source)).toBe(
      '{RMK: Author.}\n[fol. 1r]\n1 hello "quoted"',
    );
  });

  it("still works when the file has no trailing newline after transcriptionText", () => {
    const source =
      'export const transcriptionText = "line one\\nline two";\nexport const parsedManuscript = null;';
    expect(parseNativeTranscriptionSource(source)).toBe("line one\nline two");

    const noNewline = 'export const transcriptionText = "eof";';
    expect(parseNativeTranscriptionSource(noNewline)).toBe("eof");
  });

  it("returns undefined for malformed exports", () => {
    expect(parseNativeTranscriptionSource("export const other = 1;")).toBeUndefined();
    expect(
      parseNativeTranscriptionSource("export const transcriptionText = notJson;"),
    ).toBeUndefined();
  });
});

describe("parseNativeBundleMeta", () => {
  it("parses pretty-printed nativeBundleMeta", () => {
    const source = `export const nativeBundleMeta = {
  "format": "hsms-native-bundle/2",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "sourceFileName": "sample.txt",
  "manuscriptTitle": "Sample"
} as const;

export const transcriptionText = "x";
`;
    expect(parseNativeBundleMeta(source)).toMatchObject({
      exportedAt: "2026-01-01T00:00:00.000Z",
      sourceFileName: "sample.txt",
      manuscriptTitle: "Sample",
    });
  });
});
