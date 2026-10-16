export interface IiifCanvasDraft {
  index: number;
  canvasId: string;
  label: string;
  width?: number;
  height?: number;
  /** IIIF Image API base URL (no trailing slash). */
  imageService?: string;
  /** Direct image URL when no image service is declared. */
  imageUrl?: string;
}

export interface IiifWitnessDraft {
  manifestId: string;
  manifestUrl?: string;
  label: string;
  rights?: string;
  attribution?: string;
  metadata: Record<string, string>;
  canvases: IiifCanvasDraft[];
}

type Json = Record<string, unknown>;

const RE_TRAILING_SLASH = /\/+$/;
const RE_P3_CONTEXT = /iiif\.io\/api\/presentation\/3/;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** Resolve a IIIF language map (`{ en: ["Title"] }`) or plain string to text. */
export function iiifText(value: unknown, preferred: string = "en"): string {
  if (typeof value === "string") return value;
  if (!isObject(value)) return "";
  const pick = (key: string): string | null => {
    const entry = value[key];
    if (!Array.isArray(entry) || entry.length === 0) return null;
    return entry.filter((s) => typeof s === "string").join(" ");
  };
  const direct = pick(preferred) ?? pick("none") ?? pick("@none");
  if (direct) return direct;
  for (const key of Object.keys(value)) {
    const found = pick(key);
    if (found) return found;
  }
  return "";
}

function idOf(node: Json): string {
  const id = node.id ?? node["@id"];
  return typeof id === "string" ? id : "";
}

function serviceBase(body: Json): string | undefined {
  for (const raw of asArray(body.service)) {
    if (!isObject(raw)) continue;
    const id = idOf(raw);
    if (id) return id.replace(RE_TRAILING_SLASH, "");
  }
  return undefined;
}

function paintingBodies(canvas: Json): Json[] {
  const bodies: Json[] = [];
  for (const page of asArray(canvas.items)) {
    if (!isObject(page)) continue;
    for (const annotation of asArray(page.items)) {
      if (!isObject(annotation)) continue;
      if (annotation.motivation !== undefined && annotation.motivation !== "painting") continue;
      for (const body of asArray(annotation.body)) {
        if (!isObject(body)) continue;
        if (body.type === "Choice") {
          for (const item of asArray(body.items)) {
            if (isObject(item)) bodies.push(item);
          }
        } else {
          bodies.push(body);
        }
      }
    }
  }
  return bodies;
}

function parseCanvas(canvas: Json, index: number): IiifCanvasDraft {
  const draft: IiifCanvasDraft = {
    index,
    canvasId: idOf(canvas),
    label: iiifText(canvas.label) || String(index + 1),
  };
  if (typeof canvas.width === "number") draft.width = canvas.width;
  if (typeof canvas.height === "number") draft.height = canvas.height;

  const body = paintingBodies(canvas).find((b) => b.type === "Image" || b.type === undefined);
  if (body) {
    const service = serviceBase(body);
    if (service) draft.imageService = service;
    const url = idOf(body);
    if (url) draft.imageUrl = url;
    if (draft.width === undefined && typeof body.width === "number") draft.width = body.width;
    if (draft.height === undefined && typeof body.height === "number") draft.height = body.height;
  }
  return draft;
}

/** Parse a IIIF Presentation 3 manifest into a witness draft. */
export function parseIiifManifest(json: unknown, manifestUrl?: string): IiifWitnessDraft {
  if (!isObject(json) || json.type !== "Manifest") {
    throw new Error("Not a IIIF Presentation 3 manifest (expected type \"Manifest\").");
  }
  const context = asArray(json["@context"]).filter((c) => typeof c === "string") as string[];
  if (context.length > 0 && !context.some((c) => RE_P3_CONTEXT.test(c))) {
    throw new Error("Unsupported IIIF Presentation version (expected 3).");
  }

  const metadata: Record<string, string> = {};
  for (const entry of asArray(json.metadata)) {
    if (!isObject(entry)) continue;
    const key = iiifText(entry.label);
    if (key) metadata[key] = iiifText(entry.value);
  }

  const canvases = asArray(json.items)
    .filter((c): c is Json => isObject(c) && c.type === "Canvas")
    .map((c, i) => parseCanvas(c, i));

  const required = isObject(json.requiredStatement) ? json.requiredStatement : null;

  return {
    manifestId: idOf(json),
    ...(manifestUrl ? { manifestUrl } : {}),
    label: iiifText(json.label),
    ...(typeof json.rights === "string" ? { rights: json.rights } : {}),
    ...(required ? { attribution: iiifText(required.value) } : {}),
    metadata,
    canvases,
  };
}

export interface FetchIiifOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Fetch and parse a IIIF Presentation 3 manifest (Node and web). */
export async function fetchIiifManifest(
  url: string,
  options: FetchIiifOptions = {},
): Promise<IiifWitnessDraft> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(url, {
    headers: { Accept: "application/ld+json, application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`IIIF manifest request failed (${response.status}).`);
  }
  return parseIiifManifest(await response.json(), url);
}

/** IIIF Image API 3 URL for a canvas at a target width. */
export function iiifImageUrl(canvas: IiifCanvasDraft, width?: number): string | undefined {
  if (!canvas.imageService) return canvas.imageUrl;
  const size = width ? `${width},` : "max";
  return `${canvas.imageService}/full/${size}/0/default.jpg`;
}
