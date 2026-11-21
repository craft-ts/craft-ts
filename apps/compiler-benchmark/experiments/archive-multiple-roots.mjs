import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lab, workspace } from './prepare.mjs';
const read = async (file) =>
  JSON.parse(await readFile(join(lab, file), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const jobs = await read('multiple-roots-jobs.json');
assert.equal(jobs.length, 7);
assert(jobs.every((job) => job.exitCode === 0));
const tests = {};
for (const name of [
  'multiple-roots-initial',
  'multiple-roots-revised',
  'multiple-roots-compiler-first',
  'multiple-roots-validation-first',
  'multiple-roots-compiler',
  'multiple-roots-component',
  'multiple-roots-validation',
  'baseline-dom-observation',
  'candidate-dom-observation',
  'baseline-dom-observation-values',
  'candidate-dom-observation-values',
])
  tests[name] = await read('tests/' + name + '.json');
assert(
  tests['multiple-roots-compiler'].success &&
    tests['multiple-roots-compiler'].numPassedTests === 117,
);
assert(
  tests['multiple-roots-component'].success &&
    tests['multiple-roots-component'].numPassedTests === 609,
);
assert(
  tests['multiple-roots-validation'].every((check) => check.exitCode === 0),
);
assert.equal(
  tests['multiple-roots-validation-first'].find(
    (check) => check.name === 'component-typecheck',
  ).exitCode,
  0,
);
assert.equal(tests['multiple-roots-revised'].numFailedTests, 1);
const cohorts = {},
  runners = {},
  artifacts = {};
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
      (sum, rows) => sum + rows.length,
      0,
    );
  } else {
    const result = await read(job.name + '/results.json');
    assert(result.contracts.every((contract) => contract.passed));
    cohorts[job.name] = result;
    navigations += result.raw.length;
    const source = await readFile(join(lab, job.name, 'runner.mjs'), 'utf8');
    runners[job.name] = { sha256: hash(source), source };
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
assert.equal(navigations, 200);
const files = [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/core/src/lib/craft-service.ts',
];
const foundation = {
  commit: '70a51b49e',
  patches: '2026-11-17-compiler-ablations-summary.json#common',
  sources: {},
};
const changes = [];
for (const file of files) {
  const before = join(lab, 'roots/multiple-roots-reference', file),
    after = join(lab, 'roots/multiple-roots', file);
  const content = await readFile(before);
  assert.equal(
    hash(content),
    hash(
      execFileSync('git', ['show', foundation.commit + ':' + file], {
        cwd: workspace,
      }),
    ),
  );
  foundation.sources[file] = hash(content);
  const expected = hash(await readFile(after));
  for (const id of ['multiple-roots-no-list', 'multiple-roots-clone'])
    assert.equal(hash(await readFile(join(lab, 'roots', id, file))), expected);
  const diff = spawnSync('git', ['diff', '--no-index', '--', before, after], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert([0, 1].includes(diff.status));
  if (diff.status)
    changes.push({
      file,
      sha256: expected,
      patch: diff.stdout
        .replaceAll(
          join(lab, 'roots/multiple-roots-reference') + '/',
          'reference/',
        )
        .replaceAll(join(lab, 'roots/multiple-roots') + '/', 'multiple-roots/'),
    });
}
const methods = {};
for (const name of [
  'multiple-roots.mjs',
  'multiple-roots.contracts.ts',
  'dom-observation.contracts.ts',
  'validate-multiple-roots.mjs',
  'run-multiple-roots.mjs',
  'archive-multiple-roots.mjs',
  'run-micro.mjs',
  'run-page.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const reference = await import(
    pathToFileURL(
      join(
        lab,
        'roots/multiple-roots-reference/dist/libs/compiler/src/compiler.js',
      ),
    )
  ),
  candidate = await import(
    pathToFileURL(
      join(lab, 'roots/multiple-roots/dist/libs/compiler/src/compiler.js'),
    )
  );
const coverage = [];
for (const file of [
  'apps/compiler-benchmark/main.ts',
  ...(await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => 'apps/framework-benchmark/src/craft-page/' + file),
]) {
  const source = await readFile(join(workspace, file), 'utf8'),
    before = reference.compileModule(source, file, { lean: true }),
    after = candidate.compileModule(source, file, { lean: true });
  const newlyCompiled = after.components
    .filter(
      (component) =>
        component.status === 'compiled' &&
        !before.components.some(
          (previous) =>
            previous.component === component.component &&
            previous.status === 'compiled',
        ),
    )
    .map((component) => component.component);
  coverage.push({
    file,
    sourceSha256: hash(source),
    beforeGeneratedSha256: hash(before.code),
    afterGeneratedSha256: hash(after.code),
    before: before.components,
    after: after.components,
    newlyCompiled,
  });
}
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const paired = {};
for (const [name, data] of Object.entries(cohorts)) {
  if (!data.raw) continue;
  const first = jobs.find((job) => job.name === name).ids[0];
  const raw = [];
  for (const before of data.raw.filter((row) => row.label === first))
    for (const label of jobs.find((job) => job.name === name).ids.slice(1)) {
      const after = data.raw.find(
        (row) =>
          row.label === label &&
          row.kind === before.kind &&
          row.count === before.count &&
          row.run === before.run,
      );
      assert(after);
      raw.push({
        case: before.kind,
        count: before.count,
        run: before.run,
        reference: first,
        candidate: label,
        mountDeltaMs: after.mount - before.mount,
        heapDeltaMiB: after.heapMiB - before.heapMiB,
        actionDeltasMs: Object.fromEntries(
          Object.keys(before.actions).map((action) => [
            action,
            after.actions[action] - before.actions[action],
          ]),
        ),
      });
    }
  paired[name] = {
    raw,
    summary: [...new Set(raw.map((row) => row.case + '|' + row.candidate))].map(
      (key) => {
        const rows = raw.filter(
          (row) => row.case + '|' + row.candidate === key,
        );
        return {
          case: rows[0].case,
          candidate: rows[0].candidate,
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
    'restricted measured prototype, not integrated: connected-DOM observation differs and ordinary-case overhead needs removal',
  navigations,
  jobs,
  cohorts,
  paired,
  coverage,
  changes,
  methods,
  runners,
  artifacts,
  tests,
  limitations: [
    'Fixed, nonempty ranges only: element/text roots and nested static arrays. Empty roots, root structural nodes, spreads and unsupported native elements retain generic rendering.',
    'Default component owners, replay identities and root scopes are tested; lean retains its previously documented ownership/replay trade-offs. The lean entry cache is used only for single-root views; multiple-root entries move their full range.',
    'The favorable fixture has three roots per row: a div, separator text and an index span. All variants render the same nodes. Its complete lean gain combines new template coverage and proven list specialization; the lists:false control separates those changes.',
    'DOM observation contracts intentionally reproduce non-equivalence. Both existing compiler modes already read a disconnected tree for a one-root case with two children; the new multiple-root case also differs. Passing characterization tests do not prove transparency.',
    'Nine initial failures concern fixtures revised before timing: attribute-order comparisons, unnamed ifNode, selector scope, and two owner checks changed from plain callbacks to generator callbacks after plain-callback injection failed on rerun. No production injection fix is claimed here. The remaining DOM-observation failure is preserved and then characterized explicitly.',
    'The first complete compiler run had one obsolete expectation that two roots must fall back. The prototype replaces that fixture with an empty-root fallback and adds positive range/text-root contracts; the final complete suite passes 117 tests. Component and its typecheck passed before this test-only revision; runtime hashes are unchanged.',
    'No production compiler/runtime support for multiple roots is added. The production README documents the independently reproduced existing mount-observation limitation.',
    'Fresh contexts, eight navigations per variant/case, minified production builds, seeded interleaving, adjacent balanced microbench blocks. No concurrent test or build jobs during timing cohorts. Build durations are order/cache sensitive.',
    'Mount/actions measure synchronous JS/DOM work, not LCP/INP; retained JS heap after forced GC excludes native DOM memory. Comparisons across separate cohorts are not causal deltas.',
  ],
};
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((item) => item.id === 'coverage-multiple-roots'),
  {
    status: 'measured',
    decision: result.decision,
    evidence: '2026-11-17-multiple-roots-summary.json',
    coverage:
      'Nonempty fixed element/text ranges, nested arrays, scopes, replay identities, owners, range reorders, rebinds, events/holes, cloning and cleanup failures are tested. Favorable standard/lean/list-ablation/clone cohorts, ordinary standard/lean controls, realistic page and no-plugin controls are measured. A connected-DOM counterexample is reproduced against both the prototype and existing compiler.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-17-multiple-roots-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived 200 multiple-root navigations and existing DOM-observation limits; campaign remains incomplete.',
);
