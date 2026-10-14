#!/usr/bin/env node

import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

import {
  appendJsExtensions,
  assertRelativeImportsResolve,
  releasePackages,
} from './release.mjs';

const root = resolve(import.meta.dirname, '..');

// A package without a `project.json` is built by Nx through its own
// `package.json` script, i.e. through `pnpm run`. pnpm then reinstalls the
// whole workspace and turns `node_modules` into its own layout (different
// versions than the npm lockfile), which breaks the tests that run after this
// step. Those packages are still checked when the release packs them.
const hasNxBuildTarget = (pkg) =>
  existsSync(
    join(root, pkg.sourceManifest.replace(/package\.json$/, 'project.json')),
  );
const buildable = releasePackages.filter(hasNxBuildTarget);

if (process.argv.includes('--build')) {
  execFileSync(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      `--projects=${buildable.map((pkg) => pkg.project).join(',')}`,
      '--skipSync',
      '--outputStyle=stream',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NX_DAEMON: 'false' },
    },
  );
}

const scratch = mkdtempSync(join(tmpdir(), 'craft-package-imports-'));
let failed = false;
try {
  for (const pkg of releasePackages) {
    if (process.argv.includes('--build') && !hasNxBuildTarget(pkg)) {
      console.log(`${pkg.name}: skipped, checked when the release packs it.`);
      continue;
    }
    const source = resolve(root, pkg.distRoot);
    if (!existsSync(source)) {
      console.error(`${pkg.name}: ${pkg.distRoot} is missing, build it first.`);
      failed = true;
      continue;
    }
    // Work on a copy so the check never rewrites the real build output.
    const copy = join(scratch, pkg.key);
    cpSync(source, copy, { recursive: true });
    appendJsExtensions(copy);
    try {
      assertRelativeImportsResolve(copy, pkg.name);
      console.log(`${pkg.name}: relative imports resolve.`);
    } catch (error) {
      console.error(error.message);
      failed = true;
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
