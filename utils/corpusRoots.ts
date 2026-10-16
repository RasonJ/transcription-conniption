import path from "node:path";

/**
 * Default sibling corpora for library catalog + copilot vocabulary.
 * Override with `--in` / `OSTA_TRANSCRIPTIONS_PATH` / `LIBRARY_CORPUS_PATHS`.
 */
export const DEFAULT_SIBLING_CORPUS_DIRS = [
  "OSTA/transcriptions",
  "estilometria-celestina",
] as const;

/** Resolve absolute corpus roots relative to the app project root. */
export function resolveDefaultCorpusRoots(projectRoot: string): string[] {
  const parent = path.resolve(projectRoot, "..");
  return DEFAULT_SIBLING_CORPUS_DIRS.map((rel) => path.resolve(parent, rel));
}

/**
 * Parse `LIBRARY_CORPUS_PATHS` (path-separator or comma separated) plus optional
 * legacy `OSTA_TRANSCRIPTIONS_PATH` into absolute directories.
 */
export function resolveCorpusRootsFromEnv(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] | null {
  const multi = env.LIBRARY_CORPUS_PATHS?.trim();
  if (multi) {
    const parts = multi
      .split(/[;,|]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => path.resolve(p));
    if (parts.length > 0) {
      return parts;
    }
  }

  const osta = env.OSTA_TRANSCRIPTIONS_PATH?.trim();
  if (osta) {
    return [path.resolve(osta), ...resolveDefaultCorpusRoots(projectRoot).slice(1)];
  }

  return null;
}

/** CLI `--in` values, else env, else sibling defaults that exist on disk. */
export function resolveCorpusRoots(options: {
  projectRoot: string;
  cliIns?: string[];
  exists: (dir: string) => boolean;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const fromCli = (options.cliIns ?? [])
    .map((p) => path.resolve(p))
    .filter(Boolean);
  if (fromCli.length > 0) {
    return fromCli;
  }

  const fromEnv = resolveCorpusRootsFromEnv(options.projectRoot, options.env);
  if (fromEnv?.length) {
    return fromEnv;
  }

  return resolveDefaultCorpusRoots(options.projectRoot).filter((dir) => options.exists(dir));
}
