import {
  clampZoom,
  computeFitScale,
  cycleZoomMode,
  resolveDisplayFitScale,
  scaledAnchorOffset,
  scaleFromPinch,
  stepZoom,
} from "../utils/folioScale";

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

  it("prevents zooming out below 0.5x or above 3x", () => {
    expect(stepZoom(0.5, -1)).toBe(0.5);
    expect(stepZoom(3, 1)).toBe(3);
  });

  it("scales a pinch from the scale where the gesture began", () => {
    expect(scaleFromPinch(1, 1.25)).toBeCloseTo(1.25, 5);
    expect(scaleFromPinch(2, 2)).toBe(3);
    expect(scaleFromPinch(0.6, 0.5)).toBe(0.5);
  });

  it("cycles double-tap between fit width and 100%", () => {
    expect(cycleZoomMode("fit")).toBe("actual");
    expect(cycleZoomMode("actual")).toBe("fit");
    expect(cycleZoomMode("custom")).toBe("fit");
  });

  it("scales scroll offsets", () => {
    expect(scaledAnchorOffset(40, 0.5)).toBe(20);
    expect(scaledAnchorOffset(40, 2)).toBe(80);
  });
});
