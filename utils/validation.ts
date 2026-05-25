import type { ValidationError } from "../constants/manuscript";
import { lintHsmsTranscription } from "./hsmsLinter";

/** @deprecated Prefer `lintHsmsTranscription` for full `LintReport`; returns flat issue list. */
export function validateTranscription(rawText: string): ValidationError[] {
  return lintHsmsTranscription(rawText).issues;
}
