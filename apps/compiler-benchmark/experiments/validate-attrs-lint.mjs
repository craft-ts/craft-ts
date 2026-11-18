import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';
import { lab, workspace } from './prepare.mjs';
const eslint = new ESLint({ cwd: workspace });
const checks = [];
for (const file of [
  'libs/compiler/src/compiler.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
]) {
  const before = execFileSync('git', ['show', '8e5543797:' + file], {
      cwd: workspace,
      encoding: 'utf8',
    }),
    after = await readFile(join(workspace, file), 'utf8');
  const [baseline, current] = await Promise.all([
    eslint.lintText(before, { filePath: join(workspace, file) }),
    eslint.lintText(after, { filePath: join(workspace, file) }),
  ]);
  checks.push({ file, baseline, current });
}
const tests = await eslint.lintFiles([
  join(workspace, 'libs/compiler/src/attrs-properties.spec.ts'),
]);
const errors = (results) =>
  results.flatMap((result) =>
    result.messages
      .filter((message) => message.severity === 2)
      .map((message) => ({ ruleId: message.ruleId, message: message.message })),
  );
await writeFile(
  join(lab, 'tests/attrs-lint.json'),
  JSON.stringify(
    {
      checks,
      tests,
      baselineErrors: checks.flatMap((check) => errors(check.baseline)),
      currentErrors: checks.flatMap((check) => errors(check.current)),
      testErrors: errors(tests),
    },
    null,
    2,
  ) + '\n',
);
for (const check of checks)
  assert.deepEqual(errors(check.current), errors(check.baseline), check.file);
assert.equal(errors(tests).length, 0);
console.log(
  'No added compiler/runtime lint errors; new tests have zero lint errors.',
);
