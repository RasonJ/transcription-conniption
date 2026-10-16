import type { ParsedManuscript } from "../constants/manuscript";
import { compileManuscriptTree } from "../utils/compiler";

export const COPILOT_SAMPLE = `{RMK: Test Author.}
{RMK: Copilot Witness.}
[fol. 1r]
{CB1.
1 {IN3.} Auer (^borrado) del (editor) texto %2
2 {RUB. De auro puro.}
3 {GL. nota marginal sobre oro}
4 {AD. adicion posterior tardia}
5 palabra [^2#vna] y [^3#dos] mas <<a>> [^ins] [*^2#rec] [??] [???] %3
6 {LAT. Deus et homo} en romance
}
[fol. 1v]
{CB1.
1 {IN2.} Bien dicho (^otro) y (^mas) [*recon] plain
2 {GL. otra glosa}
}
`;

export function parseCopilotSample(): ParsedManuscript {
  return compileManuscriptTree(COPILOT_SAMPLE);
}
