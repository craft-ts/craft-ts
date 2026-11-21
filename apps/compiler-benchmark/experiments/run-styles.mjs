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
  CAMPAIGN_MODES: '{}',
  CAMPAIGN_STYLE_FIXTURE: 'false',
  CAMPAIGN_COMPILER_OPTIONS: JSON.stringify({
    'style-no-lists': { lists: false },
  }),
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
      'OWNED_INPUT',
    ].map((key) => ['CAMPAIGN_' + key, 'false']),
  ),
};
const two = ['style-reference', 'style-bindings'],
  four = [
    'style-reference',
    'style-islands',
    'style-bindings',
    'style-no-lists',
  ];
const jobs = [
  {
    name: 'styles-page',
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
    name: 'styles-root-dynamic',
    ids: [...four, 'style-legacy-runtime'],
    env: { CAMPAIGN_STYLE_FIXTURE: 'root-dynamic' },
  },
  {
    name: 'styles-nested-static',
    ids: four,
    env: { CAMPAIGN_STYLE_FIXTURE: 'nested-static' },
  },
  {
    name: 'styles-nested-dynamic',
    ids: four,
    env: { CAMPAIGN_STYLE_FIXTURE: 'nested-dynamic' },
  },
  {
    name: 'styles-root-static',
    ids: two,
    env: { CAMPAIGN_STYLE_FIXTURE: 'root-static' },
  },
  {
    name: 'styles-ordinary-lean',
    ids: two,
    env: { COMPILER_CASES: 'rows,indexed,nested,fields' },
  },
  {
    name: 'styles-ordinary-standard',
    ids: two,
    env: { COMPILER_CASES: 'rows,indexed', CAMPAIGN_MODE: 'compiled' },
  },
  {
    name: 'styles-ordinary-runtime',
    ids: two,
    env: { COMPILER_CASES: 'rows,indexed', CAMPAIGN_MODE: 'runtime' },
  },
];
const completed = [];
const final = process.argv.includes('--final');
if (final) {
  const ids = {
    'style-reference': 'style-cleanup',
    'style-bindings': 'style-final',
    'style-islands': 'style-final-islands',
    'style-no-lists': 'style-final-no-lists',
    'style-legacy-runtime': 'style-final-legacy',
  };
  common.CAMPAIGN_COMPILER_OPTIONS = JSON.stringify({
    'style-final-no-lists': { lists: false },
  });
  for (const job of jobs) {
    job.ids = job.ids.map((id) => ids[id]);
    if (job.page || job.name.includes('ordinary'))
      job.ids.unshift('style-reference');
    if (job.name === 'styles-nested-static') job.ids.push('style-final-legacy');
    job.name = job.name.replace('styles-', 'styles-final-');
  }
}
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
    join(lab, final ? 'styles-final-jobs.json' : 'styles-jobs.json'),
    JSON.stringify(completed, null, 2) + '\n',
  );
}
