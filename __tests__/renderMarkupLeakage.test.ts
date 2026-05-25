import { exportToLegacyHTML } from "../utils/htmlExport";
import { compileManuscriptTree } from "../utils/compiler";
import {
  extractParchmentBodyFragments,
  scanParsedTokenMarkupLeakage,
  scanRenderedMarkupLeakage,
  visibleTextForLeakScan,
  visibleTextFromHtmlFragment,
} from "../utils/renderMarkupLeakage";
import { formatIssueLog, processOstaTranscription } from "../utils/ostaBatchConverter";
import { parseIssueLog, buildIssueGroups } from "../utils/ostaIssueReport";

const CLEAN = `[fol. 1r]
{CB1.
1 En el nonbre de Dios
2 Aqui comiença este libro
{CW. fin}}`;

describe("renderMarkupLeakage", () => {
  it("extracts parchment body HTML without title chrome", () => {
    const html = exportToLegacyHTML(compileManuscriptTree(CLEAN));
    const fragments = extractParchmentBodyFragments(html);
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.join("")).toContain("En el nonbre");
    expect(fragments.join("")).not.toContain("manuscript-title");
  });

  it("reports no leaks for a clean witness HTML export", () => {
    const html = exportToLegacyHTML(compileManuscriptTree(CLEAN));
    const leaks = scanRenderedMarkupLeakage(html, CLEAN);
    expect(leaks).toHaveLength(0);
  });

  it("detects injected brace mnemonics in rendered HTML", () => {
    const html = exportToLegacyHTML(compileManuscriptTree(CLEAN));
    const poisoned = html.replace(
      "En el nonbre",
      "{CB1.} En el nonbre",
    );
    const leaks = scanRenderedMarkupLeakage(poisoned, CLEAN);
    expect(leaks.some((l) => l.message.includes("RENDER_LEAK"))).toBe(true);
    expect(leaks.some((l) => l.message.includes("{CB1."))).toBe(true);
  });

  it("maps leakage back to a source line index", () => {
    const html = exportToLegacyHTML(compileManuscriptTree(CLEAN));
    const poisoned = html.replace("En el nonbre", "{RUB.} En el nonbre");
    const leaks = scanRenderedMarkupLeakage(poisoned, CLEAN);
    const hit = leaks.find((l) => l.rawSnippet.includes("{RUB"));
    expect(hit).toBeDefined();
    expect(hit!.lineIndex).toBeGreaterThanOrEqual(0);
  });

  it("strips tags before scanning visible text", () => {
    const visible = visibleTextFromHtmlFragment(
      `<span class="rubric-style"><i>q</i>ue</span> {IN4.} texto`,
    );
    expect(visible).not.toContain("<i>");
    expect(visible).toContain("{IN4.}");
  });

  it("does not flag properly rendered reconstruction spans", () => {
    const fragment = `<span style="color: #2a6e22; font-style: italic;">[r]</span> obra`;
    expect(visibleTextForLeakScan(fragment)).not.toContain("[");
    const leaks = scanRenderedMarkupLeakage(
      `<div class="parchment-sheet-card">${fragment}</div>`,
      "ob[*r]a dey",
    );
    expect(leaks.filter((l) => l.message.includes("Stray bracketed"))).toHaveLength(0);
  });

  it("detects stray bracket fragments in text tokens and HTML", () => {
    const SNIP = `{CB1.
{IN8.} DEpoys que eu ouue per grac'a & ajuda do[ ]Senhor
deos. ob[*r]a dey luguar membro[*s] supit[*a]men[*t]e a[ ]aparec'er}`;
    const parsed = compileManuscriptTree(SNIP);
    const html = exportToLegacyHTML(parsed);
    const leaks = scanRenderedMarkupLeakage(html, SNIP, parsed);

    expect(leaks.some((l) => l.message.includes("Lacuna token"))).toBe(true);
    expect(leaks.some((l) => l.rawSnippet.includes("[ ]"))).toBe(true);

    const poisonedHtml = `${html}<div class="parchment-sheet-card">membro[s] clump</div>`;
    const htmlLeaks = scanRenderedMarkupLeakage(poisonedHtml, SNIP, parsed);
    expect(htmlLeaks.some((l) => l.message.includes("Stray bracketed fragment"))).toBe(true);
  });

  it("finishes quickly on unclosed bracket runs (no regex hang)", () => {
    const pathological = "[".repeat(50_000);
    const start = Date.now();
    const leaks = scanRenderedMarkupLeakage(
      `<div class="parchment-sheet-card">${pathological}</div>`,
      pathological,
    );
    expect(Date.now() - start).toBeLessThan(3000);
    expect(leaks.length).toBeGreaterThan(0);
  });

  it("detects raw [*…] reconstruction syntax in HTML", () => {
    const html = exportToLegacyHTML(
      compileManuscriptTree("{CB1.\n1 ob[*r]a fin}"),
    );
    const poisoned = html.replace(
      '<span style="color: #2a6e22; font-style: italic;">[r]</span>',
      "[*r]",
    );
    const leaks = scanRenderedMarkupLeakage(poisoned, "ob[*r]a");
    expect(leaks.some((l) => l.message.includes("reconstruction markup"))).toBe(true);
  });
});

describe("batch render leakage logging", () => {
  it("includes RENDER section in per-file issue logs when HTML leaks", () => {
    const result = processOstaTranscription("CLEAN.txt", CLEAN);
    const html = result.html.replace("nonbre", "{CB2.} nonbre");
    const leaks = scanRenderedMarkupLeakage(html, CLEAN);
    expect(leaks.length).toBeGreaterThan(0);

    const log = formatIssueLog("CLEAN.txt", "ok", {
      lint: [],
      parse: [],
      render: leaks.map((l) => ({
        lineIndex: l.lineIndex,
        severity: l.severity,
        message: l.message,
        rawSnippet: l.rawSnippet,
        source: "render" as const,
      })),
    });
    expect(log).toContain("=== RENDER / HTML LEAKAGE");
    expect(log).toMatch(/\[RENDER\]/);

    const parsed = parseIssueLog(log, "CLEAN.issues.log");
    expect(parsed.renderErrorCount).toBeGreaterThan(0);
    const groups = buildIssueGroups([parsed]);
    expect(groups.some((g) => g.code === "RENDER_LEAK" || g.code === "RENDER_COLUMN_TAG")).toBe(
      true,
    );
  });
});
