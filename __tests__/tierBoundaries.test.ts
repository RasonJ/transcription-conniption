import { findTierViolations, staticImports } from "../scripts/check-tiers";

describe("load tiers (SPEC-LIGHTWEIGHT LW-1)", () => {
  it("no Tier 1/2 module is statically reachable from Tier 0 entry points", () => {
    expect(findTierViolations()).toEqual([]);
  });

  it("treats dynamic import() and import type as non-static", () => {
    const src = [
      'import { a } from "./static";',
      'import type { B } from "./typeOnly";',
      'export { c } from "./reexport";',
      'const lazy = () => import("./dynamic");',
      'type M = typeof import("./typeof");',
    ].join("\n");
    expect(staticImports(src)).toEqual(["./static", "./reexport"]);
  });
});
