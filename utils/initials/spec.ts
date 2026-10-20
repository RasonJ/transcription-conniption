import type { InitialGrade, InitialSpec, InitialTradition } from "./scene";

export function gradeFromDepth(
  depth: number,
  flags?: { illuminated?: boolean; historiated?: boolean; unexecuted?: boolean; supplied?: boolean },
): InitialGrade {
  if (flags?.supplied) return "supplied";
  if (flags?.unexecuted) return "unexecuted";
  if (flags?.historiated) return "historiated";
  if (flags?.illuminated) return "illuminated";
  if (depth <= 2) return "minor";
  if (depth <= 5) return "major";
  return "principal";
}

export function resolveInitialSpec(input: {
  letter: string;
  depth: number;
  tradition: InitialTradition;
  sequence: number;
  seed: string;
  supplied?: boolean;
  unexecuted?: boolean;
  illuminated?: boolean;
  historiated?: boolean;
}): InitialSpec {
  const grade = gradeFromDepth(input.depth, {
    supplied: input.supplied,
    unexecuted: input.unexecuted,
    illuminated: input.illuminated,
    historiated: input.historiated,
  });
  return {
    letter: input.letter,
    depth: Math.max(1, input.depth),
    grade,
    tradition: input.tradition,
    sequence: input.sequence,
    seed: input.seed,
    isSupplied: grade === "supplied",
    isUnexecuted: grade === "unexecuted",
  };
}
