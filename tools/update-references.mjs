import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = join(root, '.references', 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error(`Missing reference manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

for (const [name, entry] of Object.entries(manifest)) {
  if (!entry || typeof entry !== 'object' || !entry.path) continue;

  const path = resolve(root, entry.path);
  if (!existsSync(join(path, '.git'))) {
    throw new Error(`Missing ${name} reference clone: ${path}`);
  }

  const status = execFileSync('git', ['status', '--short'], {
    cwd: path,
    encoding: 'utf8',
  }).trim();
  if (status) {
    throw new Error(`Modified reference clone; review it before updating: ${path}`);
  }

  execFileSync('git', ['fetch', '--depth', '1', 'origin', entry.requestedRef], {
    cwd: path,
    stdio: 'inherit',
  });
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], {
    cwd: path,
    stdio: 'inherit',
  });
  entry.resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path,
    encoding: 'utf8',
  }).trim();
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
