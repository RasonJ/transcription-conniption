/**
 * Native / Node / Jest loader for the HSMS lemma dictionary.
 *
 * The JSON is required inside the function body, so with Metro `inlineRequires` it is not
 * evaluated until the concordance or copilot first asks for lemmas. Web uses
 * `lemmaDictionaryLoader.web.ts`, which fetches the front-coded asset instead, so the JSON
 * never enters the web bundle.
 */

export type LemmaTable = ReadonlyMap<string, string>;
/** Surface → EAGLES-style POS tag (e.g. VMN0000). */
export type PosTable = ReadonlyMap<string, string>;

function toMap(data: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(data));
}

export function loadLemmaTableSync(): LemmaTable | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const data = require("./generated/hsmsLemmaIndex.json") as Record<string, string>;
  return toMap(data);
}

export function loadPosTableSync(): PosTable | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require("./generated/hsmsPosIndex.json") as Record<string, string>;
    return toMap(data);
  } catch {
    return null;
  }
}

export async function loadLemmaTable(): Promise<LemmaTable> {
  return loadLemmaTableSync() ?? new Map();
}

export async function loadPosTable(): Promise<PosTable> {
  return loadPosTableSync() ?? new Map();
}
