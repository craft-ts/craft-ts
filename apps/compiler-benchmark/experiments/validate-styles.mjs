import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lab, workspace } from './prepare.mjs';
const run = promisify(execFile),
  final = process.argv.includes('--final'),
  prefix = final ? 'styles-final' : 'styles',
  primary = final ? 'style-final' : 'style-bindings',
  ids = final
    ? [
        'style-reference',
        'style-cleanup',
        'style-final-islands',
        'style-final',
        'style-final-no-lists',
        'style-final-legacy',
      ]
    : [
        'style-reference',
        'style-islands',
        'style-bindings',
        'style-no-lists',
        'style-legacy-runtime',
      ];
const checks = ids.map((id) => ({
  id,
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
}));
for (const pkg of ['compiler', 'component'])
  checks.push({
    id: primary,
    name: pkg + '-typecheck',
    bin: 'tsc',
    args: [
      '-p',
      `libs/${pkg}/tsconfig.${pkg === 'compiler' ? 'spec' : 'lib'}.json`,
      '--noEmit',
      '--composite',
      'false',
      '--incremental',
      'false',
    ],
  });
checks.push({
  id: primary,
  name: 'compiler-suite',
  bin: 'vitest',
  args: [
    'run',
    '--config',
    'libs/compiler/vitest.config.ts',
    '--reporter=json',
    '--outputFile=' + join(lab, 'tests/' + prefix + '-compiler.json'),
  ],
});
if (final)
  checks.push({
    id: primary,
    name: 'component-suite',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/component/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/' + prefix + '-component.json'),
    ],
  });
const results = await Promise.all(
  checks.map(async (check) => {
    try {
      return {
        ...check,
        exitCode: 0,
        ...(await run(
          join(workspace, 'node_modules/.bin', check.bin),
          check.args,
          { cwd: join(lab, 'roots', check.id), maxBuffer: 8 * 1024 * 1024 },
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
const sources = {};
for (const id of ids) {
  sources[id] = {};
  for (const file of [
    'libs/compiler/src/compiler.ts',
    'libs/component/src/lib/render/interpreter.ts',
    'libs/component/src/lib/render/compiled-template.ts',
  ])
    sources[id][file] = createHash('sha256')
      .update(await readFile(join(lab, 'roots', id, file)))
      .digest('hex');
}
await writeFile(
  join(lab, 'tests/' + prefix + '-validation.json'),
  JSON.stringify(
    { checkedAt: new Date().toISOString(), results, sources },
    null,
    2,
  ) + '\n',
);
for (const check of results)
  assert.equal(
    check.exitCode,
    0,
    check.id + '/' + check.name + '\n' + check.stdout + '\n' + check.stderr,
  );
const tests = JSON.parse(
  await readFile(join(lab, 'tests/' + prefix + '-compiler.json'), 'utf8'),
);
assert(tests.success && tests.numPassedTests === (final ? 139 : 136));
console.log(
  ids.length +
    ' style candidates typecheck; ' +
    tests.numPassedTests +
    ' compiler tests pass.',
);
