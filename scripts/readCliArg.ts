/** Read `--flag value` or `--flag=value` from process.argv. */
export function readCliArg(flag: string): string | undefined {
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) {
    return prefixed.slice(flag.length + 1);
  }
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}
