import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFile, access, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
const foundation = '0a078e8d0';
for (const id of ['attrs-owned-reference', 'attrs-owned-safe']) {
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await prepareCandidate(
      id,
      [
        'libs/compiler/src/compiler.ts',
        'libs/compiler/src/vite.ts',
        'libs/component/src/lib/render/compiled-template.ts',
        'libs/component/src/lib/render/interpreter.ts',
        'libs/core/src/lib/craft-service.ts',
      ].map((file) => ({
        file,
        change: () => {
          const source = execFileSync(
            'git',
            ['show', foundation + ':' + file],
            { cwd: workspace, encoding: 'utf8' },
          );
          return id.endsWith('-safe') && file.endsWith('/interpreter.ts')
            ? replaceOnce(
                source,
                '    !plan ||\n    plan.events?.length ||',
                '    !plan ||\n    plan.watchBind ||\n    plan.events?.length ||',
              )
            : source;
        },
      })),
    );
  }
  await writeFile(
    join(root, 'libs/compiler/src/import-graph.ts'),
    execFileSync(
      'git',
      ['show', foundation + ':libs/compiler/src/import-graph.ts'],
      { cwd: workspace },
    ),
  );
}
if (!process.argv.includes('--measure')) process.exit(0);
const ids = ['attrs-owned-reference', 'attrs-owned-safe'];
const common = {
  COMPILER_RUNS: '8',
  COMPILER_ROWS: '5000',
  COMPILER_CASES: 'rows,indexed',
  COMPILER_ITERATIONS: '5',
  CAMPAIGN_MODE: 'lean',
  CAMPAIGN_BLOCKED: 'true',
  CAMPAIGN_COMMENT_COUNTS: 'true',
  CAMPAIGN_COMPILER_OPTIONS: '{}',
  CAMPAIGN_MODES: '{}',
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
const jobs = [
  {
    name: 'attrs-owned-page',
    page: true,
    env: {
      PAGE_RUNS: '8',
      PAGE_ITERATIONS: '3',
      PAGE_SCALES: '2',
      PAGE_COMPILER_OPTIONS: '{}',
    },
  },
  { name: 'attrs-owned-ordinary', env: {} },
  {
    name: 'attrs-owned-forced',
    env: {
      COMPILER_CASES: 'rows',
      CAMPAIGN_EAGER_ATTRS: 'true',
      CAMPAIGN_OWNED_INPUT: 'true',
      CAMPAIGN_MODES: JSON.stringify({ 'attrs-owned-reference': 'runtime' }),
    },
  },
];
const completed = [];
const confirmation = process.argv.includes('--confirm');
const selected = confirmation
  ? [
      {
        name: 'attrs-owned-confirm',
        env: { COMPILER_RUNS: '20', COMPILER_CASES: 'indexed' },
      },
    ]
  : jobs;
for (const job of selected) {
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
      ...ids,
    ],
    { cwd: workspace, env, stdio: 'inherit' },
  );
  assert.equal(result.status, 0, job.name);
  if (!job.page)
    await copyFile(join(lab, 'micro.mjs'), join(lab, job.name, 'runner.mjs'));
  completed.push({
    ...job,
    ids,
    environment,
    started,
    finished: new Date().toISOString(),
    exitCode: result.status,
  });
  await writeFile(
    join(
      lab,
      confirmation ? 'attrs-owned-confirm-jobs.json' : 'attrs-owned-jobs.json',
    ),
    JSON.stringify(completed, null, 2) + '\n',
  );
}
