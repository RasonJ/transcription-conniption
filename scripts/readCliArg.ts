/**
 * Reads command-line arguments supporting both `--key value` and `--key=value`.
 * When using space-separated form, the next argv must not start with `-`
 * (avoids treating a following flag as a value).
 */
export function readCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const prefix = `${flag}=`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length && !args[i + 1].startsWith("-")) {
      return args[i + 1];
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }

  return undefined;
}

/** True when `flag` appears as a bare argv token (not `--flag=value`). */
export function hasCliFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}
