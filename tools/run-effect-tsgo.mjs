import { chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const effectTsgoPath = resolve(
  workspaceRoot,
  'node_modules/.bin/effect-tsgo',
);

// The native package currently published for macOS can lose its executable
// bit when npm installs it. Repair it just before spawning the official CLI.
if (process.platform !== 'win32') {
  const platformPackage = `@effect/tsgo-${process.platform}-${process.arch}`;
  const nativeBinary = resolve(
    workspaceRoot,
    'node_modules',
    platformPackage,
    'lib',
    'tsc',
  );
  if (existsSync(nativeBinary)) chmodSync(nativeBinary, 0o755);
}

const result = spawnSync(effectTsgoPath, process.argv.slice(2), {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
