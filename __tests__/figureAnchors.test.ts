import {
  stripEnvironmentClose,
  trailingBraceClosesInlineFigure,
} from "../utils/figureAnchors";

describe("stripEnvironmentClose", () => {
  it("does not strip closing brace on inline ILL tags", () => {
    expect(trailingBraceClosesInlineFigure("{ILL. Plate caption.}")).toBe(true);
    const result = stripEnvironmentClose("9 {ILL. Astrolabe.}");
    expect(result.line).toBe("9 {ILL. Astrolabe.}");
    expect(result.endsBlock).toBe(false);
  });

  it("does not treat nested env braces inside inline figures as block closers", () => {
    expect(trailingBraceClosesInlineFigure("{MIN. {IN4.} S}")).toBe(true);
  });

  it("still strips rubric environment closers", () => {
    const result = stripEnvironmentClose("{RUB. Capitulo primero.}");
    expect(result.endsBlock).toBe(true);
    expect(result.line).toBe("{RUB. Capitulo primero.");
  });
});
