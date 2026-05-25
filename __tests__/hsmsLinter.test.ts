import { lintHsmsTranscription } from "../utils/hsmsLinter";
import { validateTranscription } from "../utils/validation";

describe("lintHsmsTranscription", () => {
  it("reports empty files as blocking errors", () => {
    const report = lintHsmsTranscription("   \n  ");
    expect(report.isValid).toBe(false);
    expect(report.errorCount).toBe(1);
    expect(report.criticalErrors[0]?.message).toMatch(/EMPTY_FILE/);
    expect(report.issues).toHaveLength(1);
  });

  it("splits critical errors and structural warnings", () => {
    const raw = `{CB1.
{RUB. Capitulo sin cerrar
linea dos sin cierre`;
    const report = lintHsmsTranscription(raw);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.criticalErrors.length).toBe(report.errorCount);
    expect(report.structuralWarnings.length).toBe(report.warningCount);
    expect(report.issues.length).toBe(report.errorCount + report.warningCount);
  });

  it("flags folio markers inside open environments", () => {
    const raw = `{CB1.
{RUB. abierto
[fol. 2r]
cerrado}`;
    const report = lintHsmsTranscription(raw);
    expect(report.criticalErrors.some((i) => /FOLIO_LEAK/i.test(i.message))).toBe(true);
  });

  it("warns when catchword appears at folio top", () => {
    const raw = `[fol. 3r]
{CW. catchword}
{CB1.
prose line}`;
    const report = lintHsmsTranscription(raw);
    expect(report.structuralWarnings.some((i) => /STRAY_PAGE_METADATA/i.test(i.message))).toBe(
      true,
    );
  });

  it("errors on nested braces inside running headers", () => {
    const raw = `[fol. 1r]
{HD. {RUB. nested leak}}`;
    const report = lintHsmsTranscription(raw);
    expect(report.criticalErrors.some((i) => /MALFORMED_HEADER_BLOCK/i.test(i.message))).toBe(
      true,
    );
  });

  it("warns on malformed reconstruction asterisk placement", () => {
    const raw = `{CB1.
word[pro*]more}`;
    const report = lintHsmsTranscription(raw);
    expect(
      report.structuralWarnings.some((i) => /MALFORMED_RECONSTRUCTION/i.test(i.message)),
    ).toBe(true);
  });

  it("warns on empty illegible brackets", () => {
    const report = lintHsmsTranscription("{CB1.\ntext [??] end}");
    expect(report.structuralWarnings.some((i) => /EMPTY_BRACKET/i.test(i.message))).toBe(false);

    const empty = lintHsmsTranscription("{CB1.\na[]que}");
    expect(empty.structuralWarnings.some((i) => /EMPTY_BRACKET/i.test(i.message))).toBe(true);
  });

  it("does not flag a single space after {INn.}", () => {
    const report = lintHsmsTranscription("{CB1.\n{IN4.} AO muyto texto.}");
    expect(
      report.structuralWarnings.some((i) => /INITIAL_GUTTER_LEAK/i.test(i.message)),
    ).toBe(false);
  });

  it("warns on multiple spaces after {INn.}", () => {
    const report = lintHsmsTranscription("{CB1.\n{IN4.}  AO muyto}");
    expect(
      report.structuralWarnings.some((i) => /INITIAL_GUTTER_LEAK/i.test(i.message)),
    ).toBe(true);
  });

  it("passes a minimal well-formed snippet", () => {
    const raw = `[fol. 1r]
{CB1.
{IN4.} AO muyto texto.}
{CW. fin}`;
    const report = lintHsmsTranscription(raw);
    expect(report.errorCount).toBe(0);
    expect(report.isValid).toBe(true);
  });

  it("validateTranscription matches lint issue list", () => {
    const raw = `{CB1.
{RUB. open
line}`;
    const linted = lintHsmsTranscription(raw).issues;
    const validated = validateTranscription(raw);
    expect(validated.length).toBe(linted.length);
  });
});
