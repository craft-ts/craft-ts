import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lab, workspace } from './prepare.mjs';
import { attrsFixture } from './attrs-fixtures.mjs';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const jobs = await read('attrs-watched-jobs.json');
assert.equal(jobs.length, 8);
assert(jobs.every((job) => job.exitCode === 0));
const tests = {};
for (const name of [
  'attrs-contracts',
  'attrs-compiler-full',
  'attrs-null-before',
  'attrs-final-artifacts',
  'attrs-integrated-compiler',
  'attrs-integrated-component',
  'attrs-integrated-validation',
  'attrs-watched-compiler',
  'attrs-watched-component',
  'attrs-page-order-before',
  'attrs-body-reads-before',
  'attrs-integrated-equivalence',
  'attrs-lint',
])
  tests[name] = await read('tests/' + name + '.json');
assert(
  tests['attrs-integrated-compiler'].success &&
    tests['attrs-integrated-compiler'].numPassedTests === 118,
);
assert.equal(tests['attrs-integrated-component'].numPassedTests, 609);
assert(tests['attrs-integrated-component'].success);
assert(
  tests['attrs-integrated-validation'].every((check) => check.exitCode === 0),
);
assert.equal(tests['attrs-null-before'].numFailedTests, 2);
assert.equal(tests['attrs-body-reads-before'].numFailedTests, 5);
assert.equal(tests['attrs-page-order-before'].numFailedTests, 2);
assert(tests['attrs-final-artifacts'].passed);
assert(tests['attrs-integrated-equivalence'].passed);
assert.equal(tests['attrs-integrated-equivalence'].comparisons.length, 80);
assert.deepEqual(
  tests['attrs-lint'].currentErrors,
  tests['attrs-lint'].baselineErrors,
);
assert.equal(tests['attrs-lint'].testErrors.length, 0);
const componentEvidence = {
  path: '#tests.attrs-integrated-component',
  passed: 609,
  runtimeChanged: true,
};
const cohorts = {},
  runners = {},
  artifacts = {},
  fixtures = [];
let navigations = 0;
const main = await readFile(
  join(workspace, 'apps/compiler-benchmark/main.ts'),
  'utf8',
);
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
    runners[job.name] = { sha256: hash(source), source };
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
assert.equal(navigations, 232);
const eagerControl = cohorts['attrs-corrected-eager'].contracts[0].variants;
assert.equal(
  eagerControl.find((row) => row.label === 'attrs-final').comments.forComments,
  2,
);
assert.equal(
  eagerControl.find((row) => row.label === 'attrs-legacy-runtime').comments
    .forComments,
  202,
);
const foundation = {
  commit: '8e5543797',
  runtimePatches: '2026-11-17-compiler-ablations-summary.json#common',
  runtimeEquivalentTo: '70a51b49e',
  sourceHashes: {},
};
for (const file of [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/core/src/lib/craft-service.ts',
]) {
  const source = await readFile(join(lab, 'roots/attrs-reference', file));
  assert.equal(
    hash(source),
    hash(
      execFileSync('git', ['show', foundation.commit + ':' + file], {
        cwd: workspace,
      }),
    ),
  );
  foundation.sourceHashes[file] = hash(source);
}
const compilerFile = 'libs/compiler/src/compiler.ts';
const diff = spawnSync(
  'git',
  [
    'diff',
    '--no-index',
    '--',
    join(lab, 'roots/attrs-reference', compilerFile),
    join(lab, 'roots/attrs-final', compilerFile),
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
assert.equal(diff.status, 1);
const measuredRuntimePatches = {};
for (const file of [
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
]) {
  const patch = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      '--',
      join(lab, 'roots/attrs-reference', file),
      join(lab, 'roots/attrs-final', file),
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(patch.status, 1);
  measuredRuntimePatches[file] = patch.stdout;
}
const methods = {};
for (const name of [
  'attrs-properties.mjs',
  'attrs-properties.contracts.ts',
  'attrs-fixtures.mjs',
  'run-attrs-properties.mjs',
  'run-attrs-watched.mjs',
  'watched-bind.mjs',
  'validate-attrs-watched.mjs',
  'validate-attrs-artifacts.mjs',
  'validate-attrs-integration.mjs',
  'validate-attrs-lint.mjs',
  'archive-attrs-properties.mjs',
  'run-micro.mjs',
  'run-page.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const before = await import(
    pathToFileURL(
      join(lab, 'roots/attrs-reference/dist/libs/compiler/src/compiler.js'),
    )
  ),
  after = await import(
    pathToFileURL(
      join(lab, 'roots/attrs-final/dist/libs/compiler/src/compiler.js'),
    )
  ),
  coverage = [];
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
    beforeGeneratedSha256: hash(previous.code),
    afterGeneratedSha256: hash(current.code),
    before: previous.components,
    after: current.components,
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
  ['ProgressBar'],
);
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const paired = {};
for (const [name, data] of Object.entries(cohorts)) {
  if (!data.raw) continue;
  const reference = jobs.find((job) => job.name === name).ids[0],
    raw = [];
  for (const baseline of data.raw.filter((row) => row.label === reference))
    for (const label of jobs.find((job) => job.name === name).ids.slice(1)) {
      const candidate = data.raw.find(
        (row) =>
          row.label === label &&
          row.kind === baseline.kind &&
          row.count === baseline.count &&
          row.run === baseline.run,
      );
      assert(candidate);
      raw.push({
        run: baseline.run,
        kind: baseline.kind,
        count: baseline.count,
        reference,
        candidate: label,
        mountDeltaMs: candidate.mount - baseline.mount,
        heapDeltaMiB: candidate.heapMiB - baseline.heapMiB,
        actionDeltasMs: Object.fromEntries(
          Object.keys(baseline.actions).map((key) => [
            key,
            candidate.actions[key] - baseline.actions[key],
          ]),
        ),
      });
    }
  paired[name] = {
    raw,
    summary: [...new Set(raw.map((row) => row.candidate + '/' + row.kind))].map(
      (key) => {
        const rows = raw.filter(
            (row) => row.candidate + '/' + row.kind === key,
          ),
          label = rows[0].candidate;
        return {
          candidate: label,
          kind: rows[0].kind,
          mountDeltaMs: median(rows.map((row) => row.mountDeltaMs)),
          heapDeltaMiB: median(rows.map((row) => row.heapDeltaMiB)),
          mountFasterPairs: rows.filter((row) => row.mountDeltaMs < 0).length,
          pairs: rows.length,
        };
      },
    ),
  };
}
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  foundation,
  decision:
    'retain attrs/h coverage with tracked eager reads, ordered captures and ABI-2 fallback; style coverage remains pending',
  navigations,
  superseded: {
    frontendOnly: {
      status: 'superseded: five eager reads stay stale; never published',
      evidence: await read('attrs-initial-screen.json'),
    },
    watchedHole: {
      status: 'rejected by full-page DOM contract; never published',
      navigations: 88,
      jobs: await read('attrs-watched-failed-jobs.json'),
      candidate: await read('attrs-watched-failed-candidate.json'),
      log: await readFile(join(lab, 'attrs-watched-failed.log'), 'utf8'),
      cohorts: Object.fromEntries(
        await Promise.all(
          (await read('attrs-watched-failed-jobs.json')).map(async (job) => [
            job.name,
            await read(job.name + '/results.json'),
          ]),
        ),
      ),
    },
  },
  jobs,
  cohorts,
  paired,
  fixtures,
  coverage,
  measuredCompilerPatch: diff.stdout,
  measuredRuntimePatches,
  integration: tests['attrs-integrated-equivalence'],
  componentEvidence,
  tests,
  methods,
  runners,
  artifacts,
  limitations: [
    'Only explicit attrs object literals and supported literal h tags compile. Accessors, unknown records, spreads, computed names, collisions, reserved names and unsupported properties retain the generic renderer.',
    'The favorable attrs fixture adds nine literal nested attributes to the same ordinary row. The h fixture changes its root helper call only. Complete lean gains include template coverage and existing list specialization; lists:false controls isolate the former.',
    'The corrected runtime adds a watched lean subclass and accepts ABI-2 plans; old runtimes ignore these plans and fall back. Actual ordinary runtime/standard/lean artifacts and timing overhead are measured; no byte-identity claim is made for the corrected implementation.',
    'The page gains one definition, ProgressBar. It has 47 equivalent interaction snapshots. This cohort does not establish a universal page mount improvement.',
    'The compiler now declines null-props overloads that previously changed helper semantics. Two pre-fix failures are archived; no generic helper runtime behavior is changed.',
    'The integrated compiler passes 118 tests and the component suite passes 609 tests. Compiler library/spec and component TypeScript checks pass. Eighty generated outputs match the measured compiler; runtime sources match after formatting. Lint has zero added errors; the NX boundary rule is skipped without a cached ProjectGraph.',
    'Five initial eager-read failures, a callback-hole failure and an eager capture-order failure are preserved as red evidence. The initial compiler-only and first watched prototypes are superseded. Their favorable timing screens do not establish correctness.',
    'The compiler retains its documented initial connected-DOM observation limitation and lean ownership/rebind trade-offs. Eager source dependencies are tracked separately; deferred binding effects do not rerun pure reader factories. Generic positional hole patching preserves existing uncontrolled inputs when the child count changes.',
    'In the eager fixture, update-tenth deliberately bumps one signal read by all 5000 rows; it is an all-row source update, not the ordinary 500-row label action. Its legacy-runtime control uses the new compiler with the old runtime and must keep DOM equivalence.',
    'Style bindings, their CSS validation and property application order remain pending under the same campaign item. This attrs/h delivery does not close that item or the overall campaign.',
    'Production minification, fresh browser contexts, eight navigations per variant/case, seeded interleaving and balanced adjacent blocks for microbenchmarks. No concurrent tests/builds during cohorts. JS/DOM timings are not LCP/INP; retained JS heap after GC excludes native DOM memory. Build timings are cache/order sensitive.',
  ],
};
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((item) => item.id === 'coverage-style-attrs'),
  {
    status: 'partial',
    decision: result.decision,
    evidence: '2026-11-18-attrs-properties-summary.json',
    coverage:
      'Closed nested attrs and literal h helpers measured and integrated with eager-source tracking, ordered captures, safe old-runtime fallback, shadow/collision refusals and null-overload contracts. 232 final timed navigations plus two superseded screens (80 and 88), ordinary controls in three modes, 80 integrated output comparisons, 118 compiler and 609 component tests. Style binding coverage remains pending.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
manifest.progress.partialItems = manifest.items.filter(
  (item) => item.status === 'partial',
).length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-18-attrs-properties-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived attrs/h measurements and integration; style coverage and the full campaign remain incomplete.',
);
