import { pairBraces } from "../utils/editorTransforms";
import { applyMnemonicCompletion, getMnemonicCompletions } from "../utils/mnemonicCompletions";

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
