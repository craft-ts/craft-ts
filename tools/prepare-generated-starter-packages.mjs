#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { appendJsExtensions, releasePackages } from './release.mjs';

const root = resolve(import.meta.dirname, '..');
const artifactRoot = resolve(
  process.env.CRAFT_GENERATED_STARTER_ARTIFACTS ??
    join(root, 'tmp/generated-starter-packages'),
);
mkdirSync(artifactRoot, { recursive: true });

execFileSync(
  'npx',
  [
    'nx',
    'run-many',
    '-t',
    'build',
    '-p',
    ...releasePackages.map(({ project }) => project),
    '--skipSync',
    '--outputStyle=stream',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NX_DAEMON: 'false' },
  },
);

const manifest = {};
for (const pkg of releasePackages) {
  const packageRoot = resolve(root, pkg.distRoot);
  appendJsExtensions(packageRoot);
  const output = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', artifactRoot],
    { cwd: packageRoot, encoding: 'utf8' },
  );
  const [packed] = JSON.parse(output);
  manifest[pkg.name] = packed.filename;
}

writeFileSync(
  join(artifactRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Prepared ${releasePackages.length} generated-starter packages in ${artifactRoot}`,
);
