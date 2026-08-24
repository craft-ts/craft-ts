import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  formatCraftDeploymentDiagnostic,
  resolveCraftDeploymentManifest,
  serializeCraftDeploymentManifest,
  validateCraftDeploymentDefinition,
} from '@craft-ts/deploy';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';
import { loadCraftDeploymentConfig } from '../load-config.js';

const SPEC = {
  values: ['config', 'root', 'out'],
  flags: ['help'],
} as const;

export const MANIFEST_HELP = `craft-ts manifest — resolve the deployment manifest to its artefact form

Options:
  --config <path>      Manifest to read (default: craft.deploy.* in the root)
  --root <dir>         Directory the manifest paths are relative to
  --out <file>         Write the resolved manifest instead of printing it`;

/**
 * Emits the resolved, provider-neutral manifest.
 *
 * Resolution applies every default of the tooling, so the file a provider
 * consumes never depends on the CraftTS version that produced it.
 */
export async function runManifestCommand(
  argv: readonly string[],
  io: CraftCliIo,
): Promise<number> {
  const parsed = parseArguments(argv, SPEC);
  if (parsed.flags.has('help')) {
    io.write(MANIFEST_HELP);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    io.writeError(`Unknown option(s): ${parsed.unknown.join(', ')}`);
    io.writeError(MANIFEST_HELP);
    return 1;
  }

  const rootDir = resolve(io.cwd, parsed.values['root'] ?? '.');
  const loaded = await loadCraftDeploymentConfig({
    rootDir,
    config: parsed.values['config'],
  });
  for (const diagnostic of loaded.diagnostics) {
    io.writeError(formatCraftDeploymentDiagnostic(diagnostic));
  }
  if (loaded.definition === null) return 1;

  const validation = validateCraftDeploymentDefinition(loaded.definition);
  for (const diagnostic of validation.diagnostics) {
    const text = formatCraftDeploymentDiagnostic(diagnostic);
    if (diagnostic.severity === 'error') io.writeError(text);
    else io.write(text);
  }
  if (!validation.definition) return 1;
  if (validation.diagnostics.some((d) => d.severity === 'error')) return 1;

  const serialized = serializeCraftDeploymentManifest(
    resolveCraftDeploymentManifest(validation.definition),
  );

  const out = parsed.values['out'];
  if (!out) {
    io.write(serialized.trimEnd());
    return 0;
  }

  const target = resolve(rootDir, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialized, 'utf8');
  io.write(`Wrote ${out}`);
  return 0;
}
