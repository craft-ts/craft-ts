import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lab, workspace } from './prepare.mjs';
import { attrsFixture } from './attrs-fixtures.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const jobs = await read('styles-final-jobs.json');
assert.equal(jobs.length, 8);
assert(jobs.every((job) => job.exitCode === 0));
const tests = {};
for (const name of [
  'styles-compiler',
  'styles-component',
  'styles-validation',
  'styles-islands-contracts',
  'styles-island-getters-before',
  'styles-island-getters-after',
  'styles-final-compiler',
  'styles-final-component',
  'styles-final-validation',
  'styles-integrated-compiler',
  'styles-integrated-component',
  'styles-integrated-validation',
  'styles-integrated-equivalence',
  'styles-lint',
])
  tests[name] = await read('tests/' + name + '.json');
assert.equal(tests['styles-island-getters-before'].numFailedTests, 3);
assert.equal(tests['styles-island-getters-after'].numPassedTests, 3);
for (const prefix of ['styles-final', 'styles-integrated']) {
  assert(tests[prefix + '-compiler'].success);
  assert.equal(tests[prefix + '-compiler'].numPassedTests, 139);
  assert(tests[prefix + '-component'].success);
  assert.equal(tests[prefix + '-component'].numPassedTests, 612);
}
assert(
  tests['styles-final-validation'].results.every(
    (check) => check.exitCode === 0,
  ),
);
assert(
  tests['styles-integrated-validation'].every((check) => check.exitCode === 0),
);
assert(tests['styles-integrated-equivalence'].passed);
assert.equal(tests['styles-integrated-equivalence'].comparisons.length, 80);
assert.deepEqual(
  tests['styles-lint'].currentErrors,
  tests['styles-lint'].baselineErrors,
);
assert.equal(tests['styles-lint'].testErrors.length, 0);
const cohorts = {},
  runners = {},
  fixtures = [],
  artifacts = {},
  main = await readFile(
    join(workspace, 'apps/compiler-benchmark/main.ts'),
    'utf8',
  );
let navigations = 0;
for (const job of jobs) {
  if (job.page) {
    const report = await read(job.name + '/report.json'),
      provenance = await read(job.name + '/provenance.json');
    assert.equal(report.equivalence['2'].steps, 47);
    for (const build of Object.values(provenance.builds))
      delete build.candidate;
    cohorts[job.name] = { report, provenance };
    navigations += Object.values(report.cases[0].samples).reduce(
      (n, rows) => n + rows.length,
      0,
    );
  } else {
    const result = await read(job.name + '/results.json');
    assert(result.contracts.every((contract) => contract.passed));
    cohorts[job.name] = result;
    navigations += result.raw.length;
    const source = await readFile(join(lab, job.name, 'runner.mjs'), 'utf8');
    runners[job.name] = { source, sha256: hash(source) };
    const fixture = attrsFixture(source, main, job.environment);
    fixtures.push({ name: job.name, source: fixture, sha256: hash(fixture) });
    artifacts[job.name] = {};
    for (const id of job.ids) {
      const dir = join(lab, job.name, 'dist', id, 'assets');
      artifacts[job.name][id] = await Promise.all(
        (await readdir(dir))
          .filter((file) => file.endsWith('.js'))
          .map(async (file) => ({
            file,
            sha256: hash(await readFile(join(dir, file))),
          })),
      );
    }
  }
}
assert.equal(navigations, 344);
const confirmation = {
  report: await read('styles-final-page-confirm/report.json'),
  provenance: await read('styles-final-page-confirm/provenance.json'),
};
for (const build of Object.values(confirmation.provenance.builds))
  delete build.candidate;
assert.equal(confirmation.report.equivalence['2'].steps, 47);
assert.equal(
  Object.values(confirmation.report.cases[0].samples).reduce(
    (n, rows) => n + rows.length,
    0,
  ),
  40,
);
for (const name of [
  'styles-final-root-dynamic',
  'styles-final-nested-static',
]) {
  const variants = cohorts[name].contracts[0].variants;
  assert.equal(
    variants.find((row) => row.label === 'style-final').comments.forComments,
    2,
  );
  assert.equal(
    variants.find((row) => row.label === 'style-final-legacy').comments
      .forComments,
    202,
  );
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const paired = {};
for (const job of jobs.filter((job) => !job.page)) {
  const result = cohorts[job.name];
  paired[job.name] = [];
  for (const kind of new Set(result.raw.map((row) => row.kind)))
    for (const reference of job.ids.includes('style-reference')
      ? ['style-reference', 'style-cleanup']
      : ['style-cleanup'])
      for (const candidate of job.ids.filter(
        (id) => id !== reference && id !== 'style-reference',
      )) {
        const pairs = result.raw
          .filter((row) => row.kind === kind && row.label === reference)
          .map((base) => {
            const row = result.raw.find(
              (row) =>
                row.kind === kind &&
                row.run === base.run &&
                row.label === candidate,
            );
            assert(row);
            return {
              run: base.run,
              mountDeltaMs: row.mount - base.mount,
              heapDeltaMiB: row.heapMiB - base.heapMiB,
            };
          });
        paired[job.name].push({
          kind,
          reference,
          candidate,
          pairs,
          medianMountDeltaMs: median(pairs.map((row) => row.mountDeltaMs)),
          medianHeapDeltaMiB: median(pairs.map((row) => row.heapDeltaMiB)),
          fasterPairs: pairs.filter((row) => row.mountDeltaMs < 0).length,
        });
      }
}
const samples = confirmation.report.cases[0].samples;
const pagePairs = samples['style-cleanup'].map((row, index) => ({
  run: index,
  mountDeltaMs: samples['style-final'][index].mount - row.mount,
  heapDeltaMiB: samples['style-final'][index].heapMiB - row.heapMiB,
}));
confirmation.paired = {
  pairs: pagePairs,
  medianMountDeltaMs: median(pagePairs.map((row) => row.mountDeltaMs)),
  fasterPairs: pagePairs.filter((row) => row.mountDeltaMs < 0).length,
};
const coverage = [],
  before = await import(
    pathToFileURL(
      join(lab, 'roots/style-cleanup/dist/libs/compiler/src/compiler.js'),
    )
  ),
  after = await import(
    pathToFileURL(
      join(lab, 'roots/style-final/dist/libs/compiler/src/compiler.js'),
    )
  );
for (const file of [
  'apps/compiler-benchmark/main.ts',
  ...(await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => 'apps/framework-benchmark/src/craft-page/' + file),
]) {
  const source = await readFile(join(workspace, file), 'utf8'),
    previous = before.compileModule(source, join(workspace, file), {
      lean: true,
    }),
    current = after.compileModule(source, join(workspace, file), {
      lean: true,
    });
  coverage.push({
    file,
    sourceSha256: hash(source),
    before: previous.components,
    after: current.components,
    beforeGeneratedSha256: hash(previous.code),
    afterGeneratedSha256: hash(current.code),
    newlyCompiled: current.components
      .filter(
        (component) =>
          component.status === 'compiled' &&
          !previous.components.some(
            (old) =>
              old.component === component.component &&
              old.status === 'compiled',
          ),
      )
      .map((component) => component.component),
  });
}
assert.deepEqual(
  coverage.flatMap((module) => module.newlyCompiled),
  [],
);
const patches = {};
for (const file of [
  'libs/compiler/src/compiler.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
]) {
  const diff = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      '--',
      join(lab, 'roots/style-cleanup', file),
      join(lab, 'roots/style-final', file),
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(diff.status, 1);
  patches[file] = diff.stdout;
}
const methods = {};
for (const file of [
  'styles.mjs',
  'styles.contracts.ts',
  'tracked-style-holes.mjs',
  'run-styles.mjs',
  'validate-styles.mjs',
  'validate-styles-integration.mjs',
  'validate-styles-lint.mjs',
  'archive-styles.mjs',
  'run-micro.mjs',
  'run-page.mjs',
]) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  methods[file] = { source, sha256: hash(source) };
}
const initialJobs = await read('styles-initial-jobs.json');
let initialNavigations = 0;
const initialCohorts = {};
for (const job of initialJobs) {
  if (job.page) {
    initialCohorts[job.name] = await read(job.name + '/report.json');
    initialNavigations += Object.values(
      initialCohorts[job.name].cases[0].samples,
    ).reduce((n, rows) => n + rows.length, 0);
  } else {
    initialCohorts[job.name] = await read(job.name + '/results.json');
    initialNavigations += initialCohorts[job.name].raw.length;
  }
}
assert.equal(initialNavigations, 264);
const result = {
  createdAt: new Date().toISOString(),
  foundation: '2ee9bb74a',
  cleanupCommit: 'bea30d9db',
  decision:
    'retain lean function/generator style bindings and tracked generic styled children; root object/string styles and standard compilation retain generic fallback',
  navigations,
  confirmationNavigations: 40,
  jobs,
  cohorts,
  confirmation,
  paired,
  fixtures,
  artifacts,
  runners,
  coverage,
  patches,
  tests,
  integration: tests['styles-integrated-equivalence'],
  methods,
  superseded: {
    reason:
      'The first prototype passed 136 compiler tests and 609 component tests but lost native getter dependencies and leaked an initially failed native style binding. Three later contracts reject it.',
    navigations: 264,
    jobs: initialJobs,
    cohorts: initialCohorts,
    startup: {
      reason:
        'An earlier startup run completed page timing but stopped on island-candidate TypeScript errors before list timing.',
      report: await read('styles-startup-page.json'),
      log: await readFile(join(lab, 'styles-startup-failed.log'), 'utf8'),
    },
  },
  limitations: [
    'This extension is lean-only. Function literals and generator function literals use the existing style resolver and CSS security policy; style generators are not lowered. Unsupported styled descendants remain native generic nodes. Unsupported root object/string/opaque style expressions keep the whole component generic.',
    'ABI 3 identifies direct style bindings; ABI 4 adds tracked native-hole patching. Old ABI-2 runtimes ignore both and keep correct generic rendering. Owned inputs also retain generic rendering for these plans.',
    'Direct binding capture order is separate from binding application order: source expressions remain in source order, while style bindings apply after attributes and class for each element. Existing connected-DOM initial-mount limitations remain.',
    'Native child patching is tracked only for ABI-4 plans; independent binding effects stay detached. Getter dependencies that the generic component render would read remain live. The initial binding guard is also a generic-renderer fix and is measured separately through style-cleanup controls.',
    'No extra definition compiles on the twelve-module realistic page. Its primary cohort and the targeted 20-per-variant page confirmation are separate; no universal page speedup is claimed.',
    'The first favorable prototype screen is superseded by contracts. Fresh browser contexts, seeded adjacent microbenchmark blocks, minified production builds, eight navigations per variant/case and twenty for page confirmation. No independent builds/tests ran during timings. JS heap after GC excludes native DOM memory; build timings are cache/order sensitive.',
  ],
};
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-18-styles-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8')),
  item = manifest.items.find((item) => item.id === 'coverage-style-attrs');
Object.assign(item, {
  status: 'measured',
  decision: result.decision,
  evidence: '2026-11-18-styles-summary.json',
  previousEvidence: [
    '2026-11-18-attrs-properties-summary.json',
    '2026-11-18-owned-source-summary.json',
    '2026-11-18-initial-binding-error-summary.json',
  ],
  coverage:
    'Attrs/h and style coverage are measured and integrated with explicit generic fallbacks. Styles: 344 final timed navigations, 40 page confirmations, 139 compiler and 612 component tests, CSS policy/injection/order/cleanup/getter contracts, old-runtime fallback, ordinary three-mode controls and 80 integrated output comparisons. A 264-navigation prototype is rejected by three later contracts. Root object/string styles remain generic; no page coverage gain is claimed.',
});
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
manifest.progress.partialItems = manifest.items.filter(
  (item) => item.status === 'partial',
).length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  'Archived styles, native getter tracking and cleanup controls; other campaign items remain pending.',
);
