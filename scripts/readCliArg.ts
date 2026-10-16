/**
 * Reads command-line arguments supporting both `--key value` and `--key=value`.
 * When using space-separated form, the next argv must not start with `-`
 * (avoids treating a following flag as a value).
 */
export function readCliArg(flag: string): string | undefined {
  return readAllCliArgs(flag)[0];
}

/** All values for a repeated flag (e.g. `--in a --in b` or `--in=a,b`). */
export function readAllCliArgs(flag: string): string[] {
  const args = process.argv.slice(2);
  const prefix = `${flag}=`;
  const values: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length && !args[i + 1].startsWith("-")) {
      values.push(...splitCliList(args[i + 1]));
      i++;
      continue;
    }
    if (arg.startsWith(prefix)) {
      values.push(...splitCliList(arg.slice(prefix.length)));
    }
  }

  return values;
}

function splitCliList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** True when `flag` appears as a bare argv token (not `--flag=value`). */
export function hasCliFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}
