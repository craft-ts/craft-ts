import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lab, workspace } from './prepare.mjs';
const run = promisify(execFile),
  integrated = process.env.ATTRS_INTEGRATED === 'true',
  prefix = integrated ? 'attrs-integrated' : 'attrs-watched',
  root = integrated ? workspace : join(lab, 'roots/attrs-final');
const checks = [
  {
    name: 'compiler',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/compiler/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/' + prefix + '-compiler.json'),
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
      '--outputFile=' + join(lab, 'tests/' + prefix + '-component.json'),
    ],
  },
  {
    name: 'library-typecheck',
    bin: 'tsc',
    args: [
      '-p',
      'libs/compiler/tsconfig.lib.json',
      '--noEmit',
      '--composite',
      'false',
      '--incremental',
      'false',
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
  join(lab, 'tests/' + prefix + '-validation.json'),
  JSON.stringify(validation, null, 2) + '\n',
);
for (const check of validation)
  assert.equal(
    check.exitCode,
    0,
    check.name + '\n' + check.stdout + '\n' + check.stderr,
  );
console.log(
  'Watched preparation: compiler/component suites and TypeScript passed.',
);
