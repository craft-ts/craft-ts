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
  ...Object.fromEntries(
    [
      'LOCAL_FIXTURE',
      'IMPORTED_FIXTURE',
      'SCALAR_FIXTURE',
      'WIDE_INDEX',
      'SERVICE_FIXTURE',
      'FUSION_FIXTURE',
      'MULTIPLE_ROOTS',
      'ATTRS_FIXTURE',
      'H_FIXTURE',
      'EAGER_ATTRS',
    ].map((key) => ['CAMPAIGN_' + key, 'false']),
  ),
};
const two = ['attrs-reference', 'attrs-final'];
const three = [...two, 'attrs-final-no-lists'];
const noLists = JSON.stringify({ 'attrs-final-no-lists': { lists: false } });
const jobs = [
  {
    name: 'attrs-final-eager',
    ids: [...two, 'attrs-legacy-runtime'],
    env: { CAMPAIGN_EAGER_ATTRS: 'true' },
  },
  {
    name: 'attrs-final-lean',
    ids: three,
    env: { CAMPAIGN_ATTRS_FIXTURE: 'true', CAMPAIGN_COMPILER_OPTIONS: noLists },
  },
  {
    name: 'attrs-final-h',
    ids: three,
    env: { CAMPAIGN_H_FIXTURE: 'true', CAMPAIGN_COMPILER_OPTIONS: noLists },
  },
  {
    name: 'attrs-final-standard',
    ids: two,
    env: { CAMPAIGN_MODE: 'compiled', CAMPAIGN_ATTRS_FIXTURE: 'true' },
  },
  {
    name: 'attrs-final-page',
    ids: two,
    page: true,
    env: {
      PAGE_RUNS: '8',
      PAGE_ITERATIONS: '3',
      PAGE_SCALES: '2',
      PAGE_COMPILER_OPTIONS: '{}',
    },
  },
  {
    name: 'attrs-final-ordinary-lean',
    ids: two,
    env: { COMPILER_CASES: 'rows,indexed,nested,fields' },
  },
  {
    name: 'attrs-final-ordinary-standard',
    ids: two,
    env: { CAMPAIGN_MODE: 'compiled', COMPILER_CASES: 'rows,indexed' },
  },
  {
    name: 'attrs-final-ordinary-runtime',
    ids: two,
    env: { CAMPAIGN_MODE: 'runtime', COMPILER_CASES: 'rows,indexed' },
  },
];
const completed = [];
// Run the complete page contract first: it previously exposed a shortcut-hole
// regression that ordinary rows could not detect. Keep that failed screen intact.
jobs.unshift(
  ...jobs.splice(
    jobs.findIndex((job) => job.page),
    1,
  ),
);
for (const job of jobs)
  job.name = job.name.replace('attrs-final-', 'attrs-corrected-');
for (const job of jobs) {
  const environment = { ...common, ...job.env, CAMPAIGN_OUTPUT: job.name };
  const env = { ...process.env, ...environment };
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
    join(lab, 'attrs-watched-jobs.json'),
    JSON.stringify(completed, null, 2) + '\n',
  );
}
console.log('Corrected attrs/h and ordinary-runtime cohorts complete.');
