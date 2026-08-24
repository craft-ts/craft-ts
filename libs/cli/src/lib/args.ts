export type ParsedArguments = Readonly<{
  command: string | null;
  values: Readonly<Record<string, string>>;
  flags: ReadonlySet<string>;
  /** Options the command does not know about. */
  unknown: readonly string[];
}>;

export type OptionSpec = Readonly<{
  /** Options taking a value, e.g. `--config <path>`. */
  values: readonly string[];
  /** Options used as switches, e.g. `--json`. */
  flags: readonly string[];
}>;

/**
 * Minimal option parser.
 *
 * Unknown options are collected instead of ignored: a typo in a deployment
 * command must fail loudly rather than silently check something else.
 */
export function parseArguments(
  argv: readonly string[],
  spec: OptionSpec,
): ParsedArguments {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const unknown: string[] = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (!argument.startsWith('-')) {
      command ??= argument;
      continue;
    }
    const name = argument.replace(/^--?/, '');
    if (spec.flags.includes(name)) {
      flags.add(name);
      continue;
    }
    if (spec.values.includes(name)) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        unknown.push(`${argument} (missing value)`);
        continue;
      }
      values[name] = next;
      index += 1;
      continue;
    }
    unknown.push(argument);
  }

  return { command, values, flags, unknown };
}
