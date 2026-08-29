import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = join(root, '.references', 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error(`Missing reference manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const metadataKeys = new Set(['schemaVersion', 'mode', 'effectEnabled']);

function subtreeSourceSha() {
  const message = execFileSync('git', ['log', '-n', '20', '--format=%B'], {
    cwd: root,
    encoding: 'utf8',
  });
  return message.match(/^git-subtree-split: ([0-9a-f]{40})$/m)?.[1];
}

if (
  execFileSync('git', ['status', '--short'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
) {
  throw new Error(
    'Working tree is not clean; commit or stash changes before updating vendored references.',
  );
}

for (const [name, entry] of Object.entries(manifest).filter(
  ([key, value]) =>
    !metadataKeys.has(key) &&
    value &&
    value.path &&
    value.url &&
    value.requestedRef,
)) {
  const path = resolve(root, entry.path);
  if (!existsSync(path))
    throw new Error(`Missing vendored ${name} reference: ${path}`);
  if (existsSync(join(path, '.git'))) {
    throw new Error(
      `Nested Git clone found at ${path}; migrate this reference to git subtree first.`,
    );
  }

  const before = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  execFileSync(
    'git',
    [
      'subtree',
      'pull',
      `--prefix=${entry.path}`,
      entry.url,
      entry.requestedRef,
      '--squash',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  const after = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  if (after === before) continue;
  const sha = subtreeSourceSha();
  if (sha) entry.resolvedSha = sha;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('git', ['add', '--', '.references/manifest.json'], {
    cwd: root,
  });
  execFileSync('git', ['commit', '--amend', '--no-edit'], {
    cwd: root,
    stdio: 'inherit',
  });
}
