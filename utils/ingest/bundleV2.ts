import type { HsmsBundleFile } from "../hsmsBundle";
import { hashWitnessText } from "./sidecarAlign";
import type { FolioId, HsmsFacsSidecar } from "./types";

export const HSMS_BUNDLE_V1_FORMAT = "hsms-scriptorium-bundle/1";
export const HSMS_BUNDLE_V2_FORMAT = "hsms-scriptorium-bundle/2";

export interface BundleV2Metadata {
  title: string;
  shelfmark?: string;
  institution?: string;
  dateRange?: string;
  language?: string;
  rights?: string;
  sourceUrl?: string;
}

export interface BundleV2IiifRef {
  manifestUrl?: string;
  canvases?: Record<FolioId, { canvasId: string; imageService: string }>;
}

export interface BundleV2EmbeddedImage {
  mime: string;
  base64: string;
}

export interface HsmsBundleV2Manifest {
  format: typeof HSMS_BUNDLE_V2_FORMAT;
  exportedAt: string;
  witness: {
    /** Contents of witness.txt. */
    text: string;
    hash: string;
    sourceFileName?: string;
  };
  metadata: BundleV2Metadata;
  sidecar?: HsmsFacsSidecar;
  iiif?: BundleV2IiifRef;
  /** Optional offline images at a chosen resolution, keyed by folio id. */
  embeddedImages?: { maxEdgePx: number; folios: Record<FolioId, BundleV2EmbeddedImage> };
}

export interface HsmsBundleV2 {
  manifest: HsmsBundleV2Manifest;
}

export type ParsedBundle =
  | { version: 1; bundle: HsmsBundleFile }
  | { version: 2; bundle: HsmsBundleV2 };

export function isBundleV1(value: unknown): value is HsmsBundleFile {
  const format = (value as HsmsBundleFile | null)?.manifest?.format;
  return format === HSMS_BUNDLE_V1_FORMAT;
}

export function isBundleV2(value: unknown): value is HsmsBundleV2 {
  const manifest = (value as HsmsBundleV2 | null)?.manifest;
  return (
    manifest?.format === HSMS_BUNDLE_V2_FORMAT &&
    typeof manifest.witness?.text === "string" &&
    typeof manifest.metadata?.title === "string"
  );
}

export function buildBundleV2(input: {
  text: string;
  metadata: BundleV2Metadata;
  sourceFileName?: string;
  sidecar?: HsmsFacsSidecar;
  iiif?: BundleV2IiifRef;
  embeddedImages?: HsmsBundleV2Manifest["embeddedImages"];
  exportedAt?: string;
}): HsmsBundleV2 {
  return {
    manifest: {
      format: HSMS_BUNDLE_V2_FORMAT,
      exportedAt: input.exportedAt ?? new Date().toISOString(),
      witness: {
        text: input.text,
        hash: hashWitnessText(input.text),
        ...(input.sourceFileName ? { sourceFileName: input.sourceFileName } : {}),
      },
      metadata: input.metadata,
      ...(input.sidecar ? { sidecar: input.sidecar } : {}),
      ...(input.iiif ? { iiif: input.iiif } : {}),
      ...(input.embeddedImages ? { embeddedImages: input.embeddedImages } : {}),
    },
  };
}

export function serializeBundleV2(bundle: HsmsBundleV2): string {
  return JSON.stringify(bundle);
}

/** Accepts v1 and v2 `.hsms` payloads; v1 is returned unchanged. */
export function parseBundleJson(json: string): ParsedBundle {
  const parsed: unknown = JSON.parse(json);
  if (isBundleV2(parsed)) return { version: 2, bundle: parsed };
  if (isBundleV1(parsed)) return { version: 1, bundle: parsed };
  throw new Error("Unsupported or unrecognized .hsms bundle format.");
}
