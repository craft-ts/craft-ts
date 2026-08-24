import { CRAFT_DEPLOYMENT_PROVIDERS } from '@craft-ts/deploy';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';

const SPEC = { values: [], flags: ['json', 'help'] } as const;

export const PROVIDERS_HELP = `craft-ts providers — list the deployment providers and their capabilities

Options:
  --json               Emit the capability matrix as JSON`;

/**
 * Prints the capability matrix. A provider listed here is documented, not
 * necessarily implemented: the CLI delegates every mutation to a provider
 * package installed separately.
 */
export function runProvidersCommand(
  argv: readonly string[],
  io: CraftCliIo,
): number {
  const parsed = parseArguments(argv, SPEC);
  if (parsed.flags.has('help')) {
    io.write(PROVIDERS_HELP);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    io.writeError(`Unknown option(s): ${parsed.unknown.join(', ')}`);
    io.writeError(PROVIDERS_HELP);
    return 1;
  }

  if (parsed.flags.has('json')) {
    io.write(JSON.stringify(CRAFT_DEPLOYMENT_PROVIDERS, null, 2));
    return 0;
  }

  for (const provider of CRAFT_DEPLOYMENT_PROVIDERS) {
    io.write(provider.name);
    io.write(`  capabilities: ${provider.capabilities.join(', ')}`);
    io.write(`  platforms:    ${provider.platforms.join(', ')}`);
    io.write(`  artifact:     ${provider.artifact}`);
    io.write(`  preview:      ${provider.previewCommand ?? 'none'}`);
    io.write(`  credentials:  ${provider.credentials}`);
    for (const limit of provider.limits) {
      io.write(`  limit:        ${limit}`);
    }
    io.write('');
  }
  return 0;
}
