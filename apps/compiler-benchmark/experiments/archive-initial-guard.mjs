import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { format } from 'prettier';
import { lab, workspace } from './prepare.mjs';
import { guardInitialBindings } from './render-initial-guard.mjs';
const file = 'libs/component/src/lib/render/interpreter.ts',
  baseline = execFileSync('git', ['show', '2ee9bb74a:' + file], {
    cwd: workspace,
    encoding: 'utf8',
  }),
  current = await readFile(join(workspace, file), 'utf8');
assert.equal(
  current,
  await format(guardInitialBindings(baseline), {
    parser: 'typescript',
    singleQuote: true,
  }),
);
const eslint = new ESLint({ cwd: workspace }),
  [before, after, tests] = await Promise.all([
    eslint.lintText(baseline, { filePath: join(workspace, file) }),
    eslint.lintText(current, { filePath: join(workspace, file) }),
    eslint.lintFiles([
      join(
        workspace,
        'libs/component/src/lib/render/initial-binding-error.spec.ts',
      ),
    ]),
  ]);
const errors = (results) =>
  results.flatMap((result) =>
    result.messages
      .filter((message) => message.severity === 2)
      .map((message) => ({ ruleId: message.ruleId, message: message.message })),
  );
assert.deepEqual(errors(after), errors(before));
assert.equal(errors(tests).length, 0);
const evidence = {};
for (const name of [
  'initial-binding-error-before',
  'initial-guard-validation',
  'initial-guard-compiler',
  'initial-guard-component',
])
  evidence[name] = JSON.parse(
    await readFile(join(lab, 'tests', name + '.json'), 'utf8'),
  );
assert.equal(evidence['initial-binding-error-before'].numFailedTests, 2);
assert(
  evidence['initial-guard-validation'].every((check) => check.exitCode === 0),
);
assert.equal(evidence['initial-guard-compiler'].numPassedTests, 120);
assert.equal(evidence['initial-guard-component'].numPassedTests, 612);
assert(
  evidence['initial-guard-compiler'].success &&
    evidence['initial-guard-component'].success,
);
const methods = {};
for (const name of ['render-initial-guard.mjs', 'archive-initial-guard.mjs'])
  methods[name] = await readFile(new URL(name, import.meta.url), 'utf8');
await writeFile(
  join(
    workspace,
    'docs/benchmarks/2026-11-18-initial-binding-error-summary.json',
  ),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      foundation: '2ee9bb74a',
      decision:
        'retain: stop an initially failed native binding before rethrowing its original error; later errors keep propagating',
      sourceSha256: createHash('sha256').update(current).digest('hex'),
      baselineSha256: createHash('sha256').update(baseline).digest('hex'),
      evidence,
      lint: { before, after, tests, addedErrors: 0 },
      regressionsSource: await readFile(
        join(
          workspace,
          'libs/component/src/lib/render/initial-binding-error.spec.ts',
        ),
        'utf8',
      ),
      methods,
      limitations: [
        'This report proves subscription cleanup through subsequent source updates, not a quantified retained-heap reduction.',
        'The common cleanup-only variant in the styles campaign isolates happy-path timing/size overhead; that campaign is still in progress.',
        'No Core signal/effect API is changed. The existing render callback retains its closure; the constructor frame uses one shared pointer and saves/restores state across nested creation.',
        'Three existing interpreter lint errors remain. NX boundary checking is skipped without a cached ProjectGraph.',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Archived initial binding failure regression and integrated validation.',
);
