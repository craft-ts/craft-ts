import { runCheckCommand } from './commands/check.js';
import { runDeployCommand } from './commands/deploy.js';
import { runManifestCommand } from './commands/manifest.js';
import { runProvidersCommand } from './commands/providers.js';
import { processIo, type CraftCliIo } from './io.js';

export const CRAFT_CLI_HELP = `craft-ts — deployment tooling for CraftTS applications

Usage: craft-ts <command> [options]

Commands:
  check                Validate a deployment manifest before building
  manifest             Resolve the manifest to its provider-neutral artefact form
  providers            List the deployment providers and their capabilities
  deploy preview       Show what a provider would change, without changing it
  deploy               Apply that plan, once \`--yes\` approves it

Run \`craft-ts <command> --help\` for the options of a command.

Deployment vocabulary:
  runtime              Execution shape of the bundle: static, node, worker, lambda
  platform             Technical platform executing it: cloudflare, aws, docker, …
  provider             Integration that builds, publishes or provisions it`;

/**
 * Entry point of the CLI, kept free of `process` so tests drive it with a
 * captured `io` and an arbitrary working directory.
 */
export async function runCraftCli(
  argv: readonly string[],
  io: CraftCliIo = processIo(),
): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help') {
    io.write(CRAFT_CLI_HELP);
    return command === undefined ? 1 : 0;
  }

  if (command === 'check') return await runCheckCommand(rest, io);
  if (command === 'manifest') return await runManifestCommand(rest, io);
  if (command === 'providers') return runProvidersCommand(rest, io);
  if (command === 'deploy') return await runDeployCommand(rest, io);

  io.writeError(`Unknown command: ${command}`);
  io.writeError(CRAFT_CLI_HELP);
  return 1;
}
