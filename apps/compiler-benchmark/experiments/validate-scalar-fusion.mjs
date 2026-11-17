import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lab, workspace } from './prepare.mjs';
const run = promisify(execFile),
  root = join(lab, 'roots/scalar-fusion-gated');
const checks = [
  {
    name: 'compiler',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/compiler/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/scalar-fusion-compiler.json'),
    ],
  },
  {
    name: 'component',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/component/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/scalar-fusion-component.json'),
    ],
  },
  {
    name: 'spec-typecheck',
    bin: 'tsc',
    args: [
      '-p',
      'libs/compiler/tsconfig.spec.json',
      '--noEmit',
      '--composite',
      'false',
      '--incremental',
      'false',
    ],
  },
  {
    name: 'component-typecheck',
    bin: 'tsc',
    args: [
      '-p',
      'libs/component/tsconfig.lib.json',
      '--noEmit',
      '--composite',
      'false',
      '--incremental',
      'false',
    ],
  },
];
const validation = await Promise.all(
  checks.map(async (check) => {
    try {
      return {
        ...check,
        exitCode: 0,
        ...(await run(
          join(workspace, 'node_modules/.bin', check.bin),
          check.args,
          { cwd: root, maxBuffer: 8 * 1024 * 1024 },
        )),
      };
    } catch (error) {
      return {
        ...check,
        exitCode: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
  }),
);
await writeFile(
  join(lab, 'tests/scalar-fusion-validation.json'),
  JSON.stringify(validation, null, 2) + '\n',
);
for (const check of validation)
  assert.equal(
    check.exitCode,
    0,
    check.name + '\n' + check.stdout + '\n' + check.stderr,
  );
console.log('Scalar fusion: compiler/component suites and TypeScript passed.');
