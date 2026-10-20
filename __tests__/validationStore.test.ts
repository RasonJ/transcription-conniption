import { validationStore } from "../utils/validation/store";

describe("validationStore", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("merges lexical and structural diagnostics for the current revision", () => {
    const snapshots: number[] = [];
    const unsub = validationStore.subscribe((s) => {
      snapshots.push(s.diagnostics.length);
    });

    validationStore.updateText(`{ZZZ. bogus mnemonic}`);

    jest.advanceTimersByTime(150);
    const afterLexical = validationStore.getState();
    expect(afterLexical.revision).toBeGreaterThan(0);

    jest.advanceTimersByTime(250);
    const afterStructural = validationStore.getState();
    expect(afterStructural.isParsing).toBe(false);
    expect(afterStructural.diagnostics.length).toBeGreaterThan(0);

    unsub();
    expect(snapshots.length).toBeGreaterThan(1);
  });
});
