import { buildInitialScene, PIGMENT_PALETTE } from "../utils/initials/scene";
import { gradeFromDepth, resolveInitialSpec } from "../utils/initials/spec";
import { deriveTraditionFromRmk } from "../utils/initials/tradition";

const CROMBERGER = `{RMK: Feliciano de Silva.}
{RMK: Lisuarte de Grecia.}
{RMK: Sevilla | Jacobo y Juan Cromberger | 1525.}
{CB1.
{IN4.} S text
}`;

const NUNES = `{RMK: Lisboa | Germão Galharde | 1537.}
{CB1. text }`;

const MANUSCRIPT = `{RMK: Madrid | Biblioteca Nacional de España | MSS/9218.}
{CB1. text }`;

const INCUNABLE = `{RMK: Sevilla | Meinardo Ungut | 1490.}
{CB1. text }`;

describe("initial tradition from RMK", () => {
  it("selects woodcut for a 16th-century Iberian imprint", () => {
    expect(deriveTraditionFromRmk(CROMBERGER)).toBe("print.woodcut");
    expect(deriveTraditionFromRmk(NUNES)).toBe("print.woodcut");
  });

  it("selects incunable at or before 1500", () => {
    expect(deriveTraditionFromRmk(INCUNABLE)).toBe("print.incunable");
  });

  it("selects penwork for an MSS shelfmark without a printer date", () => {
    expect(deriveTraditionFromRmk(MANUSCRIPT)).toBe("ms.penwork");
  });
});

describe("buildInitialScene", () => {
  it("is deterministic for the same spec", () => {
    const spec = resolveInitialSpec({
      letter: "S",
      depth: 4,
      tradition: "print.woodcut",
      sequence: 0,
      seed: "witness|0",
    });
    const a = buildInitialScene(spec, 18);
    const b = buildInitialScene(spec, 18);
    expect(a).toEqual(b);
    expect(a.items.some((item) => item.kind === "rect" && item.rx)).toBe(false);
    expect(JSON.stringify(a)).not.toContain("Impact");
    expect(JSON.stringify(a)).toContain(PIGMENT_PALETTE.printerInk);
  });

  it("gives I a narrower box than M", () => {
    const base = {
      depth: 4,
      tradition: "ms.penwork" as const,
      sequence: 0,
      seed: "x",
    };
    const i = buildInitialScene(resolveInitialSpec({ ...base, letter: "I" }), 20);
    const m = buildInitialScene(resolveInitialSpec({ ...base, letter: "M" }), 20);
    expect(i.boxWidth).toBeLessThan(m.boxWidth);
  });

  it("maps markup depth to grade", () => {
    expect(gradeFromDepth(2)).toBe("minor");
    expect(gradeFromDepth(4)).toBe("major");
    expect(gradeFromDepth(6)).toBe("principal");
    expect(gradeFromDepth(4, { illuminated: true })).toBe("illuminated");
    expect(gradeFromDepth(3, { unexecuted: true })).toBe("unexecuted");
  });

  it("alternates vermilion and azurite by sequence", () => {
    const even = buildInitialScene(
      resolveInitialSpec({
        letter: "A",
        depth: 4,
        tradition: "ms.penwork",
        sequence: 0,
        seed: "a",
      }),
      18,
    );
    const odd = buildInitialScene(
      resolveInitialSpec({
        letter: "A",
        depth: 4,
        tradition: "ms.penwork",
        sequence: 1,
        seed: "a",
      }),
      18,
    );
    expect(JSON.stringify(even)).toContain(PIGMENT_PALETTE.vermilion);
    expect(JSON.stringify(odd)).toContain(PIGMENT_PALETTE.azurite);
    expect(even.marginOverflowLeft).toBeGreaterThan(0);
  });
});
