import {
  scanStructuralTokenIssues,
  unclosedEnvironmentErrors,
} from "../utils/parseValidation";
import { tokenizeLineStructural } from "../utils/structuralAssembly";
import { validateTranscription } from "../utils/validation";

describe("parseValidation structural env stack", () => {
  it("does not flag unclosed env on intermediate lines of a multi-line block", () => {
    let stack: ReturnType<typeof scanStructuralTokenIssues>["stackAfter"] = [];

    const line1 = "{RUB. Capitulo";
    const scan1 = scanStructuralTokenIssues(tokenizeLineStructural(line1), line1, 11, stack);
    expect(scan1.errors).toHaveLength(0);
    expect(scan1.stackAfter.map((f) => f.code)).toEqual(["RUB"]);
    stack = scan1.stackAfter;

    const line2 = "continua";
    const scan2 = scanStructuralTokenIssues(tokenizeLineStructural(line2), line2, 12, stack);
    expect(scan2.errors).toHaveLength(0);
    stack = scan2.stackAfter;

    const line3 = "fin rubrica}";
    const scan3 = scanStructuralTokenIssues(tokenizeLineStructural(line3), line3, 13, stack);
    expect(scan3.errors).toHaveLength(0);
    expect(scan3.stackAfter).toHaveLength(0);
    expect(scan3.columnBlockClosed).toBe(false);
  });

  it("treats trailing } as column wrapper close inside {CB1.", () => {
    let stack: ReturnType<typeof scanStructuralTokenIssues>["stackAfter"] = [];
    const line = "prose line ending.}";
    const scan = scanStructuralTokenIssues(
      tokenizeLineStructural(line),
      line,
      20,
      stack,
      true,
    );
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(true);
    expect(scan.stackAfter).toHaveLength(0);
  });

  it("does not treat single-close inline {LAT. …} as column wrapper close", () => {
    const line = "{LAT. {IN2.} Orare & operari.}";
    const scan = scanStructuralTokenIssues(tokenizeLineStructural(line), line, 0, [], true);
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(false);
    expect(scan.stackAfter).toHaveLength(0);
  });

  it("treats second } on same line as column close after inline env", () => {
    const line = "{LAT. foo.}}";
    const scan = scanStructuralTokenIssues(tokenizeLineStructural(line), line, 0, [], true);
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(true);
  });

  it("does not flag trailing }} when column closes with an empty env stack", () => {
    const line = "tatib<us> liberatur :}}";
    const scan = scanStructuralTokenIssues(tokenizeLineStructural(line), line, 0, [], true);
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(true);
  });

  it("does not close column when prose continues after inline env close on same line", () => {
    const line = "se iterum Jhesus. &c<etera>.} Em a-";
    const scan = scanStructuralTokenIssues(tokenizeLineStructural(line), line, 0, [], true);
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(false);
  });

  it("recognizes spaced { LAT. opens across EEE-GUROP-style lines", () => {
    const raw =
      "[fol. 1r]\n{CB2.\n{IN3.}{ LAT. I A illo tempore: Cum turba\nplurima co~ueniret &c<etera>.} Em a-\nprose line\nzem fruyto em paciencia.}";
    const errors = validateTranscription(raw);
    expect(errors.filter((e) => /extra structural closing/i.test(e.message))).toHaveLength(0);
  });

  it("tokenizes {IN3} without trailing dot as drop cap, not env_close crawl", () => {
    const tokens = tokenizeLineStructural("{IN3} LEese a iij.");
    expect(tokens.filter((t) => t.type === "env_close")).toHaveLength(0);
  });

  it("tokenizes {Glosa.} as env open+close, not stray column close", () => {
    const tokens = tokenizeLineStructural("{Glosa.}");
    expect(tokens.filter((t) => t.type === "env_open").map((t) => t.value)).toEqual(["GLOSA"]);
    expect(tokens.filter((t) => t.type === "env_close")).toHaveLength(1);
    const scan = scanStructuralTokenIssues(tokens, "{Glosa.}", 0, [], {
      inColumnBlock: true,
      columnContext: { lineIndex: 5, hadEnvOpen: true },
    });
    expect(scan.columnBlockClosed).toBe(false);
  });

  it("does not treat {RUB: …} colon metadata as structural env", () => {
    const tokens = tokenizeLineStructural("{RUB: Euagnelho do domingo}");
    expect(tokens.filter((t) => t.type === "env_close")).toHaveLength(0);
    expect(tokens.filter((t) => t.type === "env_open")).toHaveLength(0);
  });

  it("consumes {IN2.} as lexical without structural env_close", () => {
    const tokens = tokenizeLineStructural("{IN2.}");
    expect(tokens.filter((t) => t.type === "env_close")).toHaveLength(0);
  });

  it("does not close column wrapper on single-brace inline {LAT.} within {CB1.", () => {
    const line =
      "{LAT. {IN2.} (o)Or<ati>o iusti viri p<re>val<et> q<u><<a>><m> ex<er>cit<us> pugnato<rum>}";
    const tokens = tokenizeLineStructural(line);
    expect(tokens.filter((t) => t.type === "env_close")).toHaveLength(1);
    const scan = scanStructuralTokenIssues(tokens, line, 7344, [], true);
    expect(scan.errors).toHaveLength(0);
    expect(scan.columnBlockClosed).toBe(false);
    expect(scan.stackAfter).toHaveLength(0);
  });

  it("closes column on second brace of inline {LAT. …}} at column end", () => {
    const line = "{LAT. {IN2.} Orare & op<er>ari salua<n>t homine<m>.}}";
    let stack: ReturnType<typeof scanStructuralTokenIssues>["stackAfter"] = [];
    let inColumn = true;

    const line7345 =
      "{LAT. {IN2.} (o)Or<ati>o iusti viri p<re>val<et> q<u><<a>><m> ex<er>cit<us> pugnato<rum>}";
    const scan7345 = scanStructuralTokenIssues(
      tokenizeLineStructural(line7345),
      line7345,
      7344,
      stack,
      inColumn,
    );
    expect(scan7345.columnBlockClosed).toBe(false);
    stack = scan7345.stackAfter;
    inColumn = !scan7345.columnBlockClosed && inColumn;

    const prose = "E assi prose without braces";
    const scanProse = scanStructuralTokenIssues(
      tokenizeLineStructural(prose),
      prose,
      7345,
      stack,
      inColumn,
    );
    stack = scanProse.stackAfter;
    inColumn = !scanProse.columnBlockClosed && inColumn;
    expect(inColumn).toBe(true);

    const scan7366 = scanStructuralTokenIssues(
      tokenizeLineStructural(line),
      line,
      7365,
      stack,
      inColumn,
    );
    expect(scan7366.errors).toHaveLength(0);
    expect(scan7366.columnBlockClosed).toBe(true);
  });

  it("standalone } inside column closes inner env before column wrapper", () => {
    const raw = "[fol. 1r]\n{CB1.\n1 {RUB. line one\nline two\n}\nmore prose\n}";
    const errors = validateTranscription(raw);
    expect(errors.filter((e) => /extra structural closing/i.test(e.message))).toHaveLength(0);
    const unclosed = errors.filter((e) => /unclosed environment/i.test(e.message));
    expect(unclosed).toHaveLength(0);
  });

  it("flags extra close only when a structural env is already open", () => {
    const line = "{RUB. x} }";
    const scan = scanStructuralTokenIssues(tokenizeLineStructural(line), line, 0, []);
    expect(scan.errors.some((e) => e.message.includes("Extra structural closing"))).toBe(true);
  });

  it("does not emit structural env_close for metadata brace blocks", () => {
    const tokens = tokenizeLineStructural("{RMK: Alfonso VIII.}");
    expect(tokens.some((t) => t.type === "env_close")).toBe(false);
  });

  it("does not treat {RMK: …} closers as stray structural braces", () => {
    const raw = "{RMK: Author name.}\n[fol. 1r]\n{CB1.\n1 {RUB. Test}\n}";
    const errors = validateTranscription(raw);
    expect(errors.filter((e) => /stray closing brace/i.test(e.message))).toHaveLength(0);
  });

  it("reports document-level unclosed environments once", () => {
    const raw = "[fol. 1r]\n{CB1.\n1 {RUB. never closed\nstill open";
    const errors = validateTranscription(raw);
    const unclosed = errors.filter((e) => /unclosed environment/i.test(e.message));
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0].message).toContain("{RUB.");
  });

  it("unclosedEnvironmentErrors emits one error per open frame", () => {
    const errors = unclosedEnvironmentErrors([
      { code: "RUB", startLine: 4, snippet: "{RUB. x" },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("line 5");
  });
});
