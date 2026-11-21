import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { workspace, lab } from './prepare.mjs';
const directory = join(lab, 'validation');
await mkdir(directory, { recursive: true });
const config = join(directory, 'tsconfig.collections.json');
const value = {
  extends: join(workspace, 'tsconfig.base.json'),
  compilerOptions: { noEmit: true, composite: false, types: ['node'] },
  include: [
    join(
      workspace,
      'apps/compiler-benchmark/experiments/collections.fixture.ts',
    ),
  ],
  references: [],
};
await writeFile(config, JSON.stringify(value, null, 2) + '\n');
const checks = [
  {
    name: 'typecheck',
    command: join(workspace, 'node_modules/.bin/tsc'),
    args: ['-p', config, '--noEmit'],
  },
  {
    name: 'initial-scheduler',
    command: process.execPath,
    args: [
      '--test',
      '--test-reporter=tap',
      join(
        workspace,
        'apps/compiler-benchmark/experiments/collections-initial-scheduler.test.mjs',
      ),
    ],
  },
];
const results = [];
for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: workspace,
    encoding: 'utf8',
  });
  results.push({
    ...check,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
const sourceSha256 = {};
for (const name of [
  'collections.fixture.ts',
  'collections-initial-scheduler.ts',
  'collections-initial-scheduler.test.mjs',
])
  sourceSha256[name] = createHash('sha256')
    .update(await readFile(new URL(name, import.meta.url)))
    .digest('hex');
await writeFile(
  join(directory, 'collections.json'),
  JSON.stringify({ config: value, sourceSha256, checks: results }, null, 2) +
    '\n',
);
for (const result of results)
  assert.equal(result.exitCode, 0, result.stdout + '\n' + result.stderr);
console.log(
  'Collection fixture typecheck and four scheduler contracts passed.',
);
