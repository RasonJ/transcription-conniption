import { clampZoom, computeFitScale, resolveDisplayFitScale, scaledAnchorOffset, stepZoom } from "../utils/folioScale";
import { pairBraces } from "../utils/editorTransforms";
import { applyMnemonicCompletion, getMnemonicCompletions } from "../utils/mnemonicCompletions";
import { concordanceToCsv } from "../utils/concordanceExport";
import { lintHsmsTranscription } from "../utils/hsmsLinter";

describe("folio scale", () => {
  it("fits the page into the container without enlarging", () => {
    expect(computeFitScale(320, 800, 16)).toBeCloseTo((320 - 32) / 800, 5);
    expect(computeFitScale(2000, 800, 16)).toBe(1);
    expect(computeFitScale(0, 800)).toBe(1);
  });

  it("keeps desktop web fit at 100% when the pane would shrink body text", () => {
    const cramped = computeFitScale(640, 800, 16);
    expect(cramped).toBeLessThan(0.85);
    expect(resolveDisplayFitScale(cramped, 16, { web: true, containerWidth: 640 })).toBe(1);
    expect(resolveDisplayFitScale(cramped, 16, { web: false, containerWidth: 640 })).toBe(cramped);
    expect(resolveDisplayFitScale(1, 16, { web: true, containerWidth: 1200 })).toBe(1);
  });

  it("steps zoom inside 0.5×–3×", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.1, 5);
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(0.1)).toBe(0.5);
  });

  it("scales scroll offsets", () => {
    expect(scaledAnchorOffset(40, 0.5)).toBe(20);
    expect(scaledAnchorOffset(40, 2)).toBe(80);
  });
});

describe("brace pairing", () => {
  it("inserts the closer and steps over it", () => {
    expect(pairBraces("", "{")).toEqual({ text: "{}", cursor: 1 });
    expect(pairBraces("{}", "{}}")).toEqual({ text: "{}", cursor: 2 });
    expect(pairBraces("{}", "}")).toEqual({ text: "", cursor: 0 });
  });
});

describe("mnemonic completions", () => {
  it("ranks HD first after a folio line", () => {
    const ranked = getMnemonicCompletions("", "[fol. 3r]\n");
    expect(ranked[0]?.code).toBe("HD");
  });

  it("inserts the delimiter and a space", () => {
    const spec = getMnemonicCompletions("CW", "")[0];
    expect(spec?.code).toBe("CW");
    expect(applyMnemonicCompletion("{CW", 3, spec!)).toEqual({ text: "{CW. ", cursor: 5 });
  });
});

describe("concordance csv", () => {
  it("writes a header and quoted cells", () => {
    const csv = concordanceToCsv(
      {
        rey: {
          count: 1,
          occurrences: [
            {
              folioId: "1r",
              lineNumber: "2",
              blockIndex: 0,
              preContext: 'el "rey"',
              postContext: "mando",
              keyword: "rey",
            },
          ],
        },
      },
      "word forms",
    );
    expect(csv.split("\n")[0]).toBe("lemma,count,folio,line,pre,keyword,post");
    expect(csv).toContain('"el ""rey"""');
    expect(csv.endsWith("# word forms")).toBe(true);
  });
});

describe("placement rules", () => {
  it("flags a catchword inside a column and accepts one after the column", () => {
    const inside = lintHsmsTranscription("[fol. 1r]\n{CB1.\n1 palabra\n{CW. e}\n}");
    expect(inside.issues.some((issue) => issue.code === "HSMS-E-CW-PLACEMENT")).toBe(true);

    const outside = lintHsmsTranscription("[fol. 1r]\n{CB1.\n1 palabra\n}\n{CW. e}");
    expect(outside.issues.some((issue) => issue.code === "HSMS-E-CW-PLACEMENT")).toBe(false);
  });

  it("records {GLR.} as an info extension", () => {
    const report = lintHsmsTranscription("[fol. 1r]\n{CB1.\n1 {GLR. [^nota]}\n}");
    const info = report.issues.filter((issue) => issue.code === "HSMS-I-EXTENSION");
    expect(info).toHaveLength(1);
    expect(info[0]?.severity).toBe("info");
  });
});
