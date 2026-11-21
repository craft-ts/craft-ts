import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lab, workspace } from './prepare.mjs';
const common = {
  COMPILER_RUNS: '8',
  COMPILER_ROWS: '5000',
  COMPILER_CASES: 'rows',
  COMPILER_ITERATIONS: '5',
  CAMPAIGN_MODE: 'lean',
  CAMPAIGN_BLOCKED: 'true',
  CAMPAIGN_COMMENT_COUNTS: 'true',
  CAMPAIGN_COMPILER_OPTIONS: '{}',
  CAMPAIGN_LOCAL_FIXTURE: 'false',
  CAMPAIGN_IMPORTED_FIXTURE: 'false',
  CAMPAIGN_SCALAR_FIXTURE: 'false',
  CAMPAIGN_WIDE_INDEX: 'false',
  CAMPAIGN_SERVICE_FIXTURE: 'false',
  CAMPAIGN_FUSION_FIXTURE: 'false',
  CAMPAIGN_MULTIPLE_ROOTS: 'false',
  CAMPAIGN_ATTRS_FIXTURE: 'false',
  CAMPAIGN_H_FIXTURE: 'false',
};
const three = ['attrs-reference', 'attrs-properties', 'attrs-no-lists'],
  two = three.slice(0, 2);
const jobs = [
  {
    name: 'attrs-lean',
    ids: three,
    env: {
      CAMPAIGN_ATTRS_FIXTURE: 'true',
      CAMPAIGN_COMPILER_OPTIONS: JSON.stringify({
        'attrs-no-lists': { lists: false },
      }),
    },
  },
  {
    name: 'h-lean',
    ids: three,
    env: {
      CAMPAIGN_H_FIXTURE: 'true',
      CAMPAIGN_COMPILER_OPTIONS: JSON.stringify({
        'attrs-no-lists': { lists: false },
      }),
    },
  },
  {
    name: 'attrs-standard',
    ids: two,
    env: { CAMPAIGN_MODE: 'compiled', CAMPAIGN_ATTRS_FIXTURE: 'true' },
  },
  {
    name: 'attrs-page',
    ids: two,
    page: true,
    env: {
      PAGE_RUNS: '8',
      PAGE_ITERATIONS: '3',
      PAGE_SCALES: '2',
      PAGE_COMPILER_OPTIONS: '{}',
    },
  },
];
const completed = [];
for (const job of jobs) {
  const environment = { ...common, ...job.env, CAMPAIGN_OUTPUT: job.name },
    env = { ...process.env, ...environment };
  delete env.COMPILER_OUTPUT;
  const started = new Date().toISOString();
  const result = spawnSync(
    process.execPath,
    [
      join(
        workspace,
        'apps/compiler-benchmark/experiments',
        job.page ? 'run-page.mjs' : 'run-micro.mjs',
      ),
      ...job.ids,
    ],
    { cwd: workspace, env, stdio: 'inherit' },
  );
  assert.equal(result.status, 0, job.name + ' failed');
  if (!job.page)
    await copyFile(join(lab, 'micro.mjs'), join(lab, job.name, 'runner.mjs'));
  completed.push({
    ...job,
    environment,
    started,
    finished: new Date().toISOString(),
    exitCode: result.status,
  });
  await writeFile(
    join(lab, 'attrs-properties-jobs.json'),
    JSON.stringify(completed, null, 2) + '\n',
  );
}
console.log('Attrs/h timing cohorts complete.');
