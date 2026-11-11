/** Tiny argv parser: `--flag`, `--key value`, `--key=value`, positionals. */
export interface ParsedArgs {
  flags: Map<string, string | true>;
  positionals: string[];
}

export function parseArgs(argv: string[], valued: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      positionals.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (eq > 0) flags.set(name, a.slice(eq + 1));
    else if (valued.includes(name)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
      flags.set(name, v);
      i++;
    } else flags.set(name, true);
  }
  return { flags, positionals };
}

export function intFlag(args: ParsedArgs, name: string): number | undefined {
  const v = args.flags.get(name);
  if (v === undefined) return undefined;
  if (v === true || !/^\d+$/.test(v)) throw new Error(`--${name} must be a non-negative integer`);
  return Number(v);
}
