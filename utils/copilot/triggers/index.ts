/**
 * Non-English trigger phrases per recipe (SPEC-COPILOT §5.1, §8). English triggers live
 * with each recipe. Drafts until reviewed by native speakers (i18n/review-status.json).
 */
import type { CopilotLocale } from "../types";
import { CA } from "./ca";
import { EN } from "./en";
import { ES } from "./es";
import { EU } from "./eu";
import { GL } from "./gl";
import { PT } from "./pt";

export const LOCALE_TRIGGERS: Partial<Record<CopilotLocale, Record<string, string[]>>> = {
  en: EN,
  es: ES,
  pt: PT,
  ca: CA,
  gl: GL,
  eu: EU,
};
