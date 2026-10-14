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

if (process.argv.includes('--build')) {
  execFileSync(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      `--projects=${releasePackages.map((pkg) => pkg.project).join(',')}`,
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
