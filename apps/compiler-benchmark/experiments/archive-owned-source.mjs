import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
import { lab, workspace } from './prepare.mjs';
import { attrsFixture } from './attrs-fixtures.mjs';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const jobs = [
  ...(await read('attrs-owned-jobs.json')),
  ...(await read('attrs-owned-confirm-jobs.json')),
];
assert.equal(jobs.length, 4);
const tests = {};
for (const name of [
  'attrs-owned-source-before',
  'attrs-owned-compiler',
  'attrs-owned-component',
  'attrs-owned-validation',
  'attrs-owned-lint',
])
  tests[name] = await read('tests/' + name + '.json');
assert.equal(tests['attrs-owned-source-before'].numFailedTests, 2);
assert.equal(tests['attrs-owned-compiler'].numPassedTests, 120);
assert(tests['attrs-owned-compiler'].success);
assert.equal(tests['attrs-owned-component'].numPassedTests, 609);
assert(tests['attrs-owned-component'].success);
assert(tests['attrs-owned-validation'].every((check) => check.exitCode === 0));
assert.deepEqual(
  tests['attrs-owned-lint'].currentErrors,
  tests['attrs-owned-lint'].baselineErrors,
);
assert.equal(tests['attrs-owned-lint'].testErrors.length, 0);
const cohorts = {},
  runners = {},
  fixtures = [],
  main = await readFile(
    join(workspace, 'apps/compiler-benchmark/main.ts'),
    'utf8',
  );
let navigations = 0;
for (const job of jobs) {
  assert.equal(job.exitCode, 0);
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
  }
}
assert.equal(navigations, 104);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const paired = {};
for (const job of jobs.filter((job) => !job.page)) {
  const data = cohorts[job.name];
  paired[job.name] = [...new Set(data.raw.map((row) => row.kind))].map(
    (kind) => {
      const pairs = data.raw
        .filter(
          (row) => row.kind === kind && row.label === 'attrs-owned-reference',
        )
        .map((reference) => {
          const candidate = data.raw.find(
            (row) =>
              row.kind === kind &&
              row.run === reference.run &&
              row.label === 'attrs-owned-safe',
          );
          assert(candidate);
          return {
            run: reference.run,
            mountDeltaMs: candidate.mount - reference.mount,
            heapDeltaMiB: candidate.heapMiB - reference.heapMiB,
          };
        });
      return {
        kind,
        pairs,
        medianMountDeltaMs: median(pairs.map((pair) => pair.mountDeltaMs)),
        medianHeapDeltaMiB: median(pairs.map((pair) => pair.heapDeltaMiB)),
        fasterPairs: pairs.filter((pair) => pair.mountDeltaMs < 0).length,
      };
    },
  );
}
const forced = cohorts['attrs-owned-forced'];
assert.equal(forced.builds['attrs-owned-reference'].mode, 'runtime');
assert.equal(forced.builds['attrs-owned-safe'].mode, 'lean');
assert(
  forced.contracts[0].variants.every((row) => row.comments.forComments === 202),
);
const runtime = 'libs/component/src/lib/render/interpreter.ts',
  source = await readFile(join(workspace, runtime), 'utf8'),
  measured = await readFile(
    join(lab, 'roots/attrs-owned-safe', runtime),
    'utf8',
  );
assert.equal(
  source,
  await format(measured, { parser: 'typescript', singleQuote: true }),
);
for (const file of [
  'libs/compiler/src/compiler.ts',
  'libs/component/src/lib/render/compiled-template.ts',
])
  assert.equal(
    hash(await readFile(join(workspace, file))),
    hash(await readFile(join(lab, 'roots/attrs-owned-safe', file))),
  );
const methods = {};
for (const name of [
  'owned-source-fallback.mjs',
  'archive-owned-source.mjs',
  'run-micro.mjs',
  'run-page.mjs',
  'validate-attrs-watched.mjs',
  'validate-attrs-lint.mjs',
  'attrs-properties.contracts.ts',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { source, sha256: hash(source) };
}
const result = {
  createdAt: new Date().toISOString(),
  foundation: '0a078e8d0',
  decision:
    'retain the generic template for source-watched plans when lean inputs are unavailable; do not enter the untracked owned compiled renderer',
  navigations,
  jobs,
  cohorts,
  paired,
  runners,
  fixtures,
  tests,
  methods,
  measuredRuntimePatch: JSON.parse(
    await readFile(join(lab, 'roots/attrs-owned-safe/candidate.json'), 'utf8'),
  ).changes.find((change) => change.file === runtime),
  integration: {
    passed: true,
    runtimeSha256: hash(source),
    measuredRuntimeSha256: hash(measured),
  },
  limitations: [
    'The forced object-input cohort compares uncompiled generic rendering to a lean plan that correctly falls back. It measures the cost of the retained fallback; it is not a claimed optimization gain.',
    'The reference page and ordinary lean controls compare the published 0a078e8d0 runtime to the one-guard fix using the same compiler and sources. The earlier 232-navigation campaign remains separate historical evidence.',
    'Object and callback inputs have red/green regression cases. Development, SSR, hydration and diagnostic exclusion remain covered by the component/compiler suites.',
    'Fresh browser contexts, minified production builds, eight navigations per variant/case in the first cohorts and twenty per variant in the indexed confirmation. Timings ran separately from library tests and independent builds.',
  ],
};
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-18-owned-source-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8')),
  item = manifest.items.find((item) => item.id === 'coverage-style-attrs');
item.followUpEvidence = ['2026-11-18-owned-source-summary.json'];
item.coverage =
  item.coverage.replace(/ Owned-input source tracking.*$/, '') +
  ' Owned-input source tracking is additionally protected by a generic fallback, two red/green cases, 120 current compiler tests and 104 follow-up navigations, including 40 targeted indexed confirmations.';
manifest.updatedAt = new Date().toISOString();
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  'Archived owned-source fallback contracts and 104 follow-up navigations.',
);
