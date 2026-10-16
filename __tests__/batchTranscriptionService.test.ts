import {
  mergeHsmsPages,
  runHybridTranscriptionPipeline,
  yieldToUi,
  type TranscribedFolio,
} from "../services/batchTranscriptionService";

jest.mock("../services/azureHsmsTranscriber", () => ({
  extractHsmsAsciiPayload: (raw: string) => {
    const fence = raw.match(/```(?:hsms)?\s*([\s\S]*?)```/i);
    if (fence) return fence[1].trim();
    const idx = raw.search(/\[fol\./i);
    return idx >= 0 ? raw.slice(idx).trim() : raw.trim();
  },
  transcribePageScan: jest.fn(),
}));

jest.mock("../utils/pdfPageExtractor", () => ({
  isPdfSource: (mime?: string, name?: string) =>
    /pdf/i.test(mime ?? "") || /\.pdf$/i.test(name ?? ""),
  convertPdfToPageImages: jest.fn(),
}));

jest.mock("../utils/hsmsLinter", () => ({
  lintHsmsTranscription: () => ({
    isValid: true,
    errorCount: 0,
    warningCount: 0,
    criticalErrors: [],
    structuralWarnings: [],
    incidents: [],
    issues: [],
  }),
}));

jest.mock("../utils/ingestAgentTranscription", () => ({
  ingestAgentTranscription: jest.fn((raw: string) => {
    const broken = /broken|UNCLOSED/i.test(raw);
    return {
      hsmsAscii: raw.trim(),
      cleanAscii: raw.trim(),
      isValid: !broken,
      criticalErrors: broken
        ? [{ message: "UNCLOSED_BRACE", severity: "error" }]
        : [],
      warnings: [],
      issues: [],
      lintReport: {
        isValid: !broken,
        errorCount: broken ? 1 : 0,
        warningCount: 0,
      },
      parsedManuscript: {},
      parsed: {},
    };
  }),
}));

jest.mock("../services/passTwoRepairService", () => ({
  formatDiagnosticsForRepair: (errors: Array<{ message: string }>) =>
    errors.map((e) => e.message),
  runBatchPassTwoRepair: jest.fn(),
}));

const { transcribePageScan } = jest.requireMock("../services/azureHsmsTranscriber") as {
  transcribePageScan: jest.Mock;
};
const { convertPdfToPageImages } = jest.requireMock("../utils/pdfPageExtractor") as {
  convertPdfToPageImages: jest.Mock;
};
const { runBatchPassTwoRepair } = jest.requireMock("../services/passTwoRepairService") as {
  runBatchPassTwoRepair: jest.Mock;
};

describe("mergeHsmsPages", () => {
  it("joins pages with blank lines", () => {
    expect(mergeHsmsPages(["[fol. 1r]\na", "[fol. 1v]\nb"])).toBe(
      "[fol. 1r]\na\n\n[fol. 1v]\nb",
    );
  });

  it("drops empty pages", () => {
    expect(mergeHsmsPages(["[fol. 1r]\na", "  ", ""])).toBe("[fol. 1r]\na");
  });
});

describe("yieldToUi", () => {
  it("resolves on the next tick", async () => {
    await expect(yieldToUi()).resolves.toBeUndefined();
  });
});

describe("runHybridTranscriptionPipeline streaming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("streams each PDF folio via onFolioComplete before finishing", async () => {
    convertPdfToPageImages.mockResolvedValue([
      {
        folioId: "1r",
        pageNumber: 1,
        dataUri: "data:image/jpeg;base64,aaa",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
      },
      {
        folioId: "1v",
        pageNumber: 2,
        dataUri: "data:image/jpeg;base64,bbb",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
      },
    ]);
    transcribePageScan
      .mockResolvedValueOnce({
        hsmsAscii: "[fol. 1r]\n{CB1.\none\n}",
        isValid: true,
        errorCount: 0,
        warningCount: 0,
      })
      .mockResolvedValueOnce({
        hsmsAscii: "[fol. 1v]\n{CB1.\ntwo\n}",
        isValid: true,
        errorCount: 0,
        warningCount: 0,
      });

    const folios: TranscribedFolio[] = [];
    const cumulatives: string[] = [];

    const result = await runHybridTranscriptionPipeline({
      uri: "file:///scan.pdf",
      name: "scan.pdf",
      mimeType: "application/pdf",
      onFolioComplete: (folio, cumulative) => {
        folios.push(folio);
        cumulatives.push(cumulative);
      },
    });

    expect(folios).toHaveLength(2);
    expect(folios[0].folioId).toBe("1r");
    expect(folios[1].folioId).toBe("1v");
    expect(cumulatives[0]).toContain("[fol. 1r]");
    expect(cumulatives[0]).not.toContain("[fol. 1v]");
    expect(cumulatives[1]).toContain("[fol. 1r]");
    expect(cumulatives[1]).toContain("[fol. 1v]");
    expect(result.pageCount).toBe(2);
    expect(result.hsmsAscii).toContain("[fol. 1v]");
    expect(transcribePageScan).toHaveBeenCalledTimes(2);
    expect(transcribePageScan.mock.calls[0][0].skipSyntaxRepair).toBe(true);
    expect(runBatchPassTwoRepair).not.toHaveBeenCalled();
  });

  it("batches Pass 2 for flagged pages while streaming clean ones first", async () => {
    convertPdfToPageImages.mockResolvedValue([
      {
        folioId: "1r",
        pageNumber: 1,
        dataUri: "data:image/jpeg;base64,aaa",
      },
      {
        folioId: "1v",
        pageNumber: 2,
        dataUri: "data:image/jpeg;base64,bbb",
      },
      {
        folioId: "2r",
        pageNumber: 3,
        dataUri: "data:image/jpeg;base64,ccc",
      },
    ]);
    transcribePageScan
      .mockResolvedValueOnce({
        hsmsAscii: "[fol. 1r]\n{CB1.\nclean\n}",
        isValid: true,
        errorCount: 0,
        warningCount: 0,
      })
      .mockResolvedValueOnce({
        hsmsAscii: "[fol. 1v]\n{CB1.\nbroken UNCLOSED\n",
        isValid: false,
        errorCount: 1,
        warningCount: 0,
      })
      .mockResolvedValueOnce({
        hsmsAscii: "[fol. 2r]\n{CB1.\nalso clean\n}",
        isValid: true,
        errorCount: 0,
        warningCount: 0,
      });

    runBatchPassTwoRepair.mockResolvedValue([
      {
        pageIndex: 1,
        folioId: "1v",
        repairedHsmsAscii: "[fol. 1v]\n{CB1.\nrepaired\n}",
      },
    ]);

    const folios: TranscribedFolio[] = [];
    const phases: string[] = [];

    const result = await runHybridTranscriptionPipeline({
      uri: "file:///scan.pdf",
      name: "scan.pdf",
      mimeType: "application/pdf",
      onProgress: (p) => phases.push(p.phase),
      onFolioComplete: (folio) => {
        folios.push(folio);
      },
    });

    // Clean pages stream before batch repair completes.
    expect(folios[0].folioId).toBe("1r");
    expect(folios[1].folioId).toBe("2r");
    expect(folios[2].folioId).toBe("1v");
    expect(folios[2].hsmsAscii).toContain("repaired");
    expect(runBatchPassTwoRepair).toHaveBeenCalledTimes(1);
    expect(runBatchPassTwoRepair.mock.calls[0][0]).toHaveLength(1);
    expect(runBatchPassTwoRepair.mock.calls[0][0][0].folioId).toBe("1v");
    expect(phases).toContain("repairing");
    expect(result.repairedPageCount).toBe(1);
    expect(result.hsmsAscii).toContain("repaired");
  });

  it("emits a single folio for non-PDF images", async () => {
    transcribePageScan.mockResolvedValue({
      hsmsAscii: "[fol. leaf]\n{CB1.\nx\n}",
      isValid: true,
      errorCount: 0,
      warningCount: 0,
    });

    const folios: TranscribedFolio[] = [];
    const result = await runHybridTranscriptionPipeline({
      uri: "file:///leaf.jpg",
      name: "leaf.jpg",
      mimeType: "image/jpeg",
      onFolioComplete: (folio) => {
        folios.push(folio);
      },
    });

    expect(convertPdfToPageImages).not.toHaveBeenCalled();
    expect(folios).toHaveLength(1);
    expect(result.pageCount).toBe(1);
    expect(transcribePageScan.mock.calls[0][0].skipSyntaxRepair).toBeUndefined();
  });

  it("honors AbortSignal between pages", async () => {
    convertPdfToPageImages.mockResolvedValue([
      {
        folioId: "1r",
        pageNumber: 1,
        dataUri: "data:image/jpeg;base64,aaa",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
      },
      {
        folioId: "1v",
        pageNumber: 2,
        dataUri: "data:image/jpeg;base64,bbb",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
      },
    ]);
    const controller = new AbortController();
    transcribePageScan.mockImplementation(async () => {
      controller.abort();
      return {
        hsmsAscii: "[fol. 1r]\nok",
        isValid: true,
        errorCount: 0,
        warningCount: 0,
      };
    });

    await expect(
      runHybridTranscriptionPipeline({
        uri: "file:///scan.pdf",
        name: "scan.pdf",
        mimeType: "application/pdf",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
