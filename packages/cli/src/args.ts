/**
 * Argument parsing, split out so it can be tested — `index.ts` ends in `await main(...)`, so
 * importing it to reach a helper would run the CLI.
 */

/**
 * The suli flags that take no value.
 *
 * Needed because `--flag value` and a bare `--flag` cannot be told apart without knowing the flag:
 * the token after `--json` is a positional, the token after `--title` is not.
 */
export const VALUELESS = new Set(["--json", "--help", "--embed"]);

/** A flag's value, in either spelling: `--name value` or `--name=value`. */
export function flag(args: string[], name: string): string | null {
  const joined = args.find((a) => a.startsWith(`${name}=`));
  if (joined) return joined.slice(name.length + 1) || null;
  const i = args.indexOf(name);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : null;
}

/**
 * The positional arguments, with each flag and the value it consumed removed.
 *
 * Filtering on `startsWith("--")` alone keeps the value: in `upload ./site --title Launch` the
 * title would be read as a second path.
 */
export function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      out.push(a);
      continue;
    }
    // `--name=value` carries its own value; a bare flag that takes one eats the next token.
    if (!a.includes("=") && !VALUELESS.has(a) && args[i + 1] && !args[i + 1].startsWith("--")) i++;
  }
  return out;
}
