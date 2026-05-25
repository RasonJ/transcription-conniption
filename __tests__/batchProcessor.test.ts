import { processTranscriptionBatch } from "../utils/batchProcessor";

const SAMPLE = `[fol. 1r]
{CB1.
1 En el nonbre de Dios
2 Aqui comiença este libro
{CW. fin}}`;

describe("batchProcessor", () => {
  it("compiles multiple files and reports summary", async () => {
    const progressSnapshots: number[] = [];
    const result = await processTranscriptionBatch(
      [
        { name: "A.txt", content: SAMPLE, size: SAMPLE.length },
        { name: "B.txt", content: SAMPLE, size: SAMPLE.length },
      ],
      (statuses) => {
        progressSnapshots.push(statuses.filter((s) => s.status === "completed").length);
      },
    );

    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.completedFiles).toBe(2);
    expect(result.summary.failedFiles).toBe(0);
    expect(Object.keys(result.compiledTrees)).toEqual(["A.txt", "B.txt"]);
    expect(result.compiledTrees["A.txt"].stats.totalWords).toBeGreaterThan(0);
    expect(progressSnapshots.length).toBeGreaterThan(0);
  });
});
