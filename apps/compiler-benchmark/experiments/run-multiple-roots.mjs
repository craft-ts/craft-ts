import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lab, workspace } from './prepare.mjs';
const reference = 'multiple-roots-reference',
  candidate = 'multiple-roots';
const common = {
  COMPILER_RUNS: '8',
  COMPILER_ROWS: '5000',
  COMPILER_CASES: 'rows',
  COMPILER_ITERATIONS: '5',
  CAMPAIGN_BLOCKED: 'true',
  CAMPAIGN_MODE: 'lean',
  CAMPAIGN_COMPILER_OPTIONS: '{}',
  CAMPAIGN_MULTIPLE_ROOTS: 'false',
  CAMPAIGN_LOCAL_FIXTURE: 'false',
  CAMPAIGN_IMPORTED_FIXTURE: 'false',
  CAMPAIGN_SCALAR_FIXTURE: 'false',
  CAMPAIGN_WIDE_INDEX: 'false',
  CAMPAIGN_SERVICE_FIXTURE: 'false',
  CAMPAIGN_FUSION_FIXTURE: 'false',
  CAMPAIGN_COMMENT_COUNTS: 'true',
};
const jobs = [
  {
    name: 'multiple-roots-lean',
    ids: [reference, candidate, 'multiple-roots-no-list'],
    env: {
      CAMPAIGN_MULTIPLE_ROOTS: 'true',
      CAMPAIGN_COMPILER_OPTIONS: JSON.stringify({
        'multiple-roots-no-list': { lists: false },
      }),
    },
  },
  {
    name: 'multiple-roots-standard',
    ids: [reference, candidate],
    env: { CAMPAIGN_MODE: 'compiled', CAMPAIGN_MULTIPLE_ROOTS: 'true' },
  },
  {
    name: 'multiple-roots-clone',
    ids: [candidate, 'multiple-roots-clone'],
    env: {
      CAMPAIGN_MULTIPLE_ROOTS: 'true',
      CAMPAIGN_COMPILER_OPTIONS: JSON.stringify({
        'multiple-roots-clone': { dom: 'clone' },
      }),
    },
  },
  {
    name: 'multiple-roots-ordinary',
    ids: [reference, candidate],
    env: { COMPILER_CASES: 'rows,indexed,nested,fields' },
  },
  {
    name: 'multiple-roots-page',
    ids: [reference, candidate],
    page: true,
    env: {
      PAGE_RUNS: '8',
      PAGE_ITERATIONS: '3',
      PAGE_SCALES: '2',
      PAGE_COMPILER_OPTIONS: '{}',
    },
  },
  {
    name: 'multiple-roots-standard-ordinary',
    ids: [reference, candidate],
    env: { CAMPAIGN_MODE: 'compiled', COMPILER_CASES: 'rows,indexed' },
  },
  {
    name: 'multiple-roots-runtime',
    ids: [reference, candidate],
    env: { CAMPAIGN_MODE: 'runtime', COMPILER_CASES: 'rows,indexed' },
  },
];
const completed = [];
for (const job of jobs) {
  const environment = { ...common, ...job.env, CAMPAIGN_OUTPUT: job.name };
  // The runners resolve their own output unless the caller supplied this override.
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
    join(lab, 'multiple-roots-jobs.json'),
    JSON.stringify(completed, null, 2) + '\n',
  );
}
console.log('All seven multiple-root timing cohorts finished.');
