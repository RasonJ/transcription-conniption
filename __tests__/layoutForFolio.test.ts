import {
  CANVAS_W,
  GUTTER_WIDTH,
  MARGIN,
  PAGE_PAD_TOP,
  columnWidth,
  innerCanvasWidth,
} from "../components/svgFacsimile/pageLayout";
import { LH } from "../components/svgFacsimile/tokenRendering";
import { layoutForFolio } from "../utils/ingest/layoutForFolio";
import type { FolioGeometry } from "../utils/ingest/types";

describe("layoutForFolio", () => {
  it("returns today's constants when geometry is missing", () => {
    const layout = layoutForFolio();
    expect(layout).toEqual({
      canvasW: CANVAS_W,
      canvasH: null,
      margin: MARGIN,
      gutter: GUTTER_WIDTH,
      columnWidths: [columnWidth(), columnWidth()],
      lineAdvance: LH,
      writingArea: { x: MARGIN, y: PAGE_PAD_TOP, w: innerCanvasWidth(), h: null },
    });
  });

  const geometry: FolioGeometry = {
    aspect: 1.5,
    writingArea: [0.1, 0.08, 0.8, 0.84],
    columns: [
      [0.1, 0.08, 0.38, 0.84],
      [0.52, 0.08, 0.38, 0.84],
    ],
    meanLineSpacing: 0.02,
    linesPerColumn: [40, 40],
  };

  it("scales measured geometry to the 800 px logical width", () => {
    const layout = layoutForFolio(geometry);
    expect(layout.canvasW).toBe(800);
    expect(layout.canvasH).toBe(1200);
    expect(layout.margin).toBeCloseTo(80);
    expect(layout.columnWidths[0]).toBeCloseTo(304);
    expect(layout.columnWidths).toHaveLength(2);
    expect(layout.gutter).toBeCloseTo(32);
    expect(layout.lineAdvance).toBeCloseTo(24);
    expect(layout.writingArea).toMatchObject({ x: 80, w: 640 });
    expect(layout.writingArea.y).toBeCloseTo(96);
    expect(layout.writingArea.h).toBeCloseTo(1008);
  });

  it("handles a single column and missing spacing", () => {
    const layout = layoutForFolio({
      ...geometry,
      columns: [],
      meanLineSpacing: 0,
    });
    expect(layout.columnWidths).toEqual([640]);
    expect(layout.gutter).toBe(GUTTER_WIDTH);
    expect(layout.lineAdvance).toBe(LH);
  });
});
