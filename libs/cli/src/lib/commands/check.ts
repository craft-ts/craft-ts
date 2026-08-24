import { resolve } from 'node:path';
import {
  checkCraftDeployment,
  formatCraftDeploymentDiagnostic,
  type CraftDeploymentDiagnostic,
} from '@craft-ts/deploy';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';
import { loadCraftDeploymentConfig } from '../load-config.js';

const SPEC = {
  values: ['config', 'root', 'runtime', 'platform', 'provider'],
  flags: ['artifact', 'json', 'help'],
} as const;

export const CHECK_HELP = `craft-ts check — validate a deployment manifest before building

Options:
  --config <path>      Manifest to read (default: craft.deploy.* in the root)
  --root <dir>         Directory the manifest paths are relative to
  --runtime <name>     Assert the manifest declares this runtime
  --platform <name>    Assert the manifest declares this platform
  --provider <name>    Check the provider capabilities against the manifest
  --artifact           Also inspect the built artefact
  --json               Emit a machine-readable report`;

/**
 * Validates a manifest and reports what has to change before a deployment is
 * attempted. Nothing is written and no provider is contacted.
 */
export async function runCheckCommand(
  argv: readonly string[],
  io: CraftCliIo,
): Promise<number> {
  const parsed = parseArguments(argv, SPEC);
  if (parsed.flags.has('help')) {
    io.write(CHECK_HELP);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    io.writeError(`Unknown option(s): ${parsed.unknown.join(', ')}`);
    io.writeError(CHECK_HELP);
    return 1;
  }

  const rootDir = resolve(io.cwd, parsed.values['root'] ?? '.');
  const loaded = await loadCraftDeploymentConfig({
    rootDir,
    config: parsed.values['config'],
  });
  const json = parsed.flags.has('json');

  if (loaded.definition === null) {
    return report(io, json, loaded.file, null, loaded.diagnostics);
  }

  const result = checkCraftDeployment({
    rootDir,
    definition: loaded.definition,
    provider: parsed.values['provider'],
    runtime: parsed.values['runtime'],
    platform: parsed.values['platform'],
    artifact: parsed.flags.has('artifact'),
  });

  return report(io, json, loaded.file, result.manifest, [
    ...loaded.diagnostics,
    ...result.diagnostics,
  ]);
}

function report(
  io: CraftCliIo,
  json: boolean,
  file: string | null,
  manifest: unknown,
  diagnostics: readonly CraftDeploymentDiagnostic[],
): number {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  ).length;
  const warnings = diagnostics.length - errors;

  if (json) {
    io.write(
      JSON.stringify(
        { passed: errors === 0, manifest: manifest ?? null, diagnostics },
        null,
        2,
      ),
    );
    return errors === 0 ? 0 : 1;
  }

  if (file) io.write(`manifest: ${file}`);
  for (const diagnostic of diagnostics) {
    const text = formatCraftDeploymentDiagnostic(diagnostic);
    if (diagnostic.severity === 'error') io.writeError(text);
    else io.write(text);
  }

  if (errors === 0) {
    io.write(
      `Deployment check passed${warnings > 0 ? ` with ${warnings} warning(s)` : ''}.`,
    );
    return 0;
  }
  io.writeError(
    `Deployment check failed with ${errors} error(s)${warnings > 0 ? ` and ${warnings} warning(s)` : ''}.`,
  );
  return 1;
}
