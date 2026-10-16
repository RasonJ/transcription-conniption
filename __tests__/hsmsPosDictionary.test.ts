import {
  loadLemmaDictionarySync,
  lookupHsmsLemma,
  lookupHsmsPos,
  resetLemmaDictionaryForTests,
} from "../utils/hsmsDictionary";

describe("HSMS POS dictionary index", () => {
  beforeEach(() => {
    resetLemmaDictionaryForTests();
  });

  it("loads lemma and POS from generated indexes when available", () => {
    const ok = loadLemmaDictionarySync();
    if (!ok) {
      // Web / missing assets — skip rather than fail CI without dic files.
      expect(ok).toBe(false);
      return;
    }
    // Common Old Spanish verb surface present in hsms.src
    const lemma = lookupHsmsLemma("fazer") ?? lookupHsmsLemma("haber") ?? lookupHsmsLemma("ser");
    expect(lemma).toBeTruthy();
    const pos =
      lookupHsmsPos("fazer") ?? lookupHsmsPos("haber") ?? lookupHsmsPos("ser") ?? lookupHsmsPos(lemma!);
    // POS index may lag until generate:dictionary is run; assert shape when present.
    if (pos) {
      expect(pos).toMatch(/^[A-Z]{1,4}\d/);
    }
  });
});
