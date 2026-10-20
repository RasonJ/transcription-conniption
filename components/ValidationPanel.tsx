import type { ValidationError } from "@/constants/manuscript";
import { IssuesPanel } from "@/components/IssuesPanel";
import React from "react";

type Props = {
  errors: ValidationError[];
  onJumpToLine?: (lineIndex: number) => void;
};

/** Full issues list (SPEC-VALIDATION VAL-25 sheet variant). */
export function ValidationPanel({ errors, onJumpToLine }: Props) {
  return <IssuesPanel variant="sheet" errors={errors} onJumpToLine={onJumpToLine} />;
}
