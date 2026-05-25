import type { Token } from "../constants/manuscript";
import {
  figureLayoutMode,
  partitionFigureSegments,
  segmentTokensForRender,
} from "../utils/figureLayout";

describe("figureLayout", () => {
  it("assigns margin layout to ILL and full width to DIAG", () => {
    expect(figureLayoutMode("ILL")).toBe("margin");
    expect(figureLayoutMode("DIAG")).toBe("fullWidth");
    expect(figureLayoutMode("MIN")).toBe("inline");
  });

  it("partitions margin figures from flow", () => {
    const ill: Token = {
      type: "figure_anchor",
      value: "drawing",
      raw: "{ILL. drawing}",
      figureId: "3r_fig_001",
      figureType: "ILL",
    };
    const min: Token = {
      type: "figure_anchor",
      value: "mini",
      raw: "{MIN. mini}",
      figureId: "3r_fig_002",
      figureType: "MIN",
    };
    const segments = segmentTokensForRender([
      { type: "text", value: "hello ", raw: "hello " },
      ill,
      { type: "text", value: " world ", raw: " world " },
      min,
    ]);
    const { marginFigures, fullWidthFigures, flowSegments } = partitionFigureSegments(segments);
    expect(marginFigures).toHaveLength(1);
    expect(marginFigures[0].figureType).toBe("ILL");
    expect(fullWidthFigures).toHaveLength(0);
    expect(flowSegments).toHaveLength(3);
    expect(flowSegments[2].kind).toBe("figure");
  });
});
