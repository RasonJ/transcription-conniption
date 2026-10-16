import { hasCliFlag, readAllCliArgs, readCliArg } from "../scripts/readCliArg";

describe("readCliArg", () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("reads --key value", () => {
    process.argv = ["node", "script.ts", "--out", "./dist", "--limit", "5"];
    expect(readCliArg("--out")).toBe("./dist");
    expect(readCliArg("--limit")).toBe("5");
  });

  it("reads --key=value", () => {
    process.argv = ["node", "script.ts", "--out=./dist", "--limit=5"];
    expect(readCliArg("--out")).toBe("./dist");
    expect(readCliArg("--limit")).toBe("5");
  });

  it("does not treat a following flag as a value", () => {
    process.argv = ["node", "script.ts", "--out", "--limit", "5"];
    expect(readCliArg("--out")).toBeUndefined();
    expect(readCliArg("--limit")).toBe("5");
  });

  it("returns undefined when missing", () => {
    process.argv = ["node", "script.ts"];
    expect(readCliArg("--out")).toBeUndefined();
  });

  it("collects repeated and comma-separated --in values", () => {
    process.argv = [
      "node",
      "script.ts",
      "--in",
      "C:/osta",
      "--in=C:/celestina,C:/extra",
    ];
    expect(readAllCliArgs("--in")).toEqual(["C:/osta", "C:/celestina", "C:/extra"]);
  });
});

describe("hasCliFlag", () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("detects bare flags only", () => {
    process.argv = ["node", "script.ts", "--verbose", "--out=./dist"];
    expect(hasCliFlag("--verbose")).toBe(true);
    expect(hasCliFlag("--out")).toBe(false);
    expect(hasCliFlag("--missing")).toBe(false);
  });
});
