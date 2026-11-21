import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';
import { lab, workspace } from './prepare.mjs';
import { attrsFixture } from './attrs-fixtures.mjs';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const integrated = await import(
    pathToFileURL(join(workspace, 'dist/libs/compiler/src/compiler.js'))
  ),
  measured = await import(
    pathToFileURL(
      join(lab, 'roots/attrs-final/dist/libs/compiler/src/compiler.js'),
    )
  );
const jobs = JSON.parse(
  await readFile(join(lab, 'attrs-watched-jobs.json'), 'utf8'),
);
const main = await readFile(
    join(workspace, 'apps/compiler-benchmark/main.ts'),
    'utf8',
  ),
  inputs = [];
for (const file of [
  'apps/compiler-benchmark/main.ts',
  ...(await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => 'apps/framework-benchmark/src/craft-page/' + file),
])
  inputs.push({ file, source: await readFile(join(workspace, file), 'utf8') });
for (const job of jobs.filter((job) => !job.page)) {
  const runner = await readFile(join(lab, job.name, 'runner.mjs'), 'utf8');
  inputs.push({
    file: 'apps/compiler-benchmark/main.ts',
    fixture: job.name,
    source: attrsFixture(runner, main, job.environment),
  });
}
const comparisons = [];
for (const input of inputs)
  for (const options of [
    { lean: false },
    { lean: true },
    { lean: true, lists: false },
    { lean: true, dom: 'clone' },
  ]) {
    const id = join(workspace, input.file),
      before = measured.compileModule(input.source, id, options),
      after = integrated.compileModule(input.source, id, options);
    assert.equal(after.code, before.code, input.fixture ?? input.file);
    assert.deepEqual(after.components, before.components);
    comparisons.push({
      file: input.file,
      fixture: input.fixture,
      options,
      sourceSha256: hash(input.source),
      generatedSha256: hash(after.code),
      passed: true,
    });
  }
const matchingRuntime = {};
for (const file of [
  'libs/core/src/lib/craft-service.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
]) {
  const source = await readFile(join(workspace, file), 'utf8'),
    reference = await readFile(join(lab, 'roots/attrs-final', file), 'utf8');
  assert.equal(
    source,
    await format(reference, { parser: 'typescript', singleQuote: true }),
    file,
  );
  matchingRuntime[file] = {
    integratedSha256: hash(source),
    measuredSha256: hash(reference),
  };
}
await writeFile(
  join(lab, 'tests/attrs-integrated-equivalence.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      comparisons,
      matchingRuntime,
      integratedCompilerSha256: hash(
        await readFile(join(workspace, 'libs/compiler/src/compiler.ts')),
      ),
      measuredCompilerSha256: hash(
        await readFile(
          join(lab, 'roots/attrs-final/libs/compiler/src/compiler.ts'),
        ),
      ),
      passed: true,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  comparisons.length +
    ' integrated generated outputs match the measured compiler byte for byte.',
);
