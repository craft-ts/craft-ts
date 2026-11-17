import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lab, workspace } from './prepare.mjs';
const foundation = '70a51b49e';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const page = async (name) => {
  const report = await read(name + '/report.json'),
    provenance = await read(name + '/provenance.json');
  // Candidate sources are archived once as a foundation patch plus pass controls.
  for (const build of Object.values(provenance.builds)) delete build.candidate;
  return { report, provenance };
};
const final = {
  page: await page('compiler-ablations-page'),
  list: await read('compiler-ablations-list/results.json'),
  services: await read('compiler-ablations-services/results.json'),
  definitions: await read('service-definitions/results.json'),
};
assert.equal(Object.keys(final.page.report.cases[0].samples).length, 7);
assert(
  Object.values(final.page.report.cases[0].samples).every(
    (rows) => rows.length === 8,
  ),
);
assert.equal(final.page.report.equivalence['2'].steps, 47);
assert.equal(final.list.raw.length, 96);
assert.equal(final.services.raw.length, 24);
assert.equal(final.definitions.raw.length, 16);
assert(
  [...final.list.contracts, ...final.services.contracts].every((c) => c.passed),
);
const beforeCacheFix = {
  page: await page('compiler-ablations-page-before-cache-fix'),
  list: await read('compiler-ablations-list-before-cache-fix/results.json'),
  services: await read(
    'compiler-ablations-services-before-cache-fix/results.json',
  ),
  sourceHashes: await read('tests/ablation-before-cache-sources.json'),
};
assert.equal(beforeCacheFix.list.raw.length, 64);
assert.equal(beforeCacheFix.services.raw.length, 16);
const tests = {};
for (const name of [
  'compiler-ablations',
  'compiled-context-compiler-final',
  'compiled-context-component-final',
  'service-cache-core',
  'owned-fallback-valid-before',
  'service-cache-before',
  'lowered-injection-before',
  'ablation-initialization-screen',
  'ablation-before-fix-sources',
  'compiled-context-lint',
  'compiled-context-test-lint',
])
  tests[name] = await read('tests/' + name + '.json');
assert(
  tests['compiled-context-compiler-final'].success &&
    tests['compiled-context-compiler-final'].numPassedTests === 88,
);
assert(
  tests['compiled-context-component-final'].success &&
    tests['compiled-context-component-final'].numPassedTests === 609,
);
assert(
  tests['service-cache-core'].success &&
    tests['service-cache-core'].numPassedTests === 1700,
);
assert.equal(tests['owned-fallback-valid-before'].numFailedTests, 2);
assert.equal(tests['service-cache-before'].numFailedTests, 4);
assert.equal(tests['lowered-injection-before'].numFailedTests, 1);
const methods = {};
for (const name of [
  'compiler-ablations.mjs',
  'validate-ablations.mjs',
  'run-micro.mjs',
  'run-page.mjs',
  'run-service-definitions.mjs',
  'audit-legacy-compiler.mjs',
  'archive-compiler-ablations.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const runners = {},
  artifacts = {};
for (const name of [
  'compiler-ablations-list',
  'compiler-ablations-services',
  'compiler-ablations-list-before-cache-fix',
  'compiler-ablations-services-before-cache-fix',
]) {
  const source = await readFile(join(lab, name, 'runner.mjs'), 'utf8');
  runners[name] = { sha256: hash(source), source };
  artifacts[name] = {};
  const result = await read(name + '/results.json');
  for (const id of Object.keys(result.builds)) {
    const dir = join(lab, name, 'dist', id, 'assets');
    artifacts[name][id] = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith('.js'))
        .map(async (file) => ({
          file,
          sha256: hash(await readFile(join(dir, file))),
        })),
    );
  }
}
const commonFiles = [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/core/src/lib/craft-service.ts',
];
const common = {
  commit: foundation,
  baseCommit: '89f1e46de',
  patch: execFileSync(
    'git',
    ['diff', '89f1e46de', foundation, '--', ...commonFiles],
    { cwd: workspace, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ),
  sources: {},
};
for (const file of commonFiles) {
  const committed = execFileSync('git', ['show', foundation + ':' + file], {
    cwd: workspace,
  });
  const actual = await readFile(join(lab, 'roots/ablation-full', file));
  assert.equal(hash(committed), hash(actual));
  common.sources[file] = hash(actual);
}
const candidates = {};
for (const id of Object.keys(final.page.provenance.builds)) {
  const changes = [];
  for (const file of commonFiles) {
    const before = join(lab, 'roots/ablation-full', file),
      after = join(lab, 'roots', id, file);
    const diff = spawnSync('git', ['diff', '--no-index', '--', before, after], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    assert([0, 1].includes(diff.status));
    const content = await readFile(after);
    if (diff.status === 1)
      changes.push({
        file,
        sha256: hash(content),
        patch: diff.stdout
          .replaceAll(join(lab, 'roots/ablation-full') + '/', 'reference/')
          .replaceAll(join(lab, 'roots', id) + '/', id + '/'),
      });
  }
  candidates[id] = {
    foundation,
    options: tests['compiler-ablations'].find((c) => c.id === id).options,
    changes,
  };
}
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  foundation,
  decision:
    'Retain optional lean event/hole coverage, light list entries, lowering and corrected direct service reads. Keep create as default and clone opt-in. Measurement-only ablation switches are not production options.',
  navigationCounts: {
    final: 192,
    beforeCacheFix: 128,
    initializationScreen: 'not timed',
  },
  final,
  beforeCacheFix,
  legacy: await read('legacy-compiler/audit.json'),
  common,
  candidates,
  methods,
  runners,
  artifacts,
  validation: {
    tests,
    typecheckLog: await readFile(
      join(lab, 'tests/compiled-context-typecheck.log'),
      'utf8',
    ),
    coreCount:
      '1699 ordinary passes plus one expected failure; three existing TODOs',
    lint: 'No added runtime lint errors against the baseline; test files have zero errors. NX module-boundary rule skipped without cached ProjectGraph.',
  },
  limitations: [
    'Ablating events or holes rejects entire plans that contain them. These are coverage/ownership comparisons, not isolated event dispatch or child-slot costs.',
    'The list-entry ablation retains compiler list specialization and lazy indexes; it changes entry objects, context and row comments together.',
    'Disabling lowering also removes direct service reads. Effects are not additive; the separate service-only ablation isolates that rewrite.',
    'The focused service fixture repurposes update-tenth to update one shared service state read by all 5000 rows. It does not change ten percent of row objects.',
    'Before-cache-fix screen timings belong to a separate cohort and are not used to estimate the fix speedup. Correctness is established by red/green contracts.',
    'The no-compiler control declares 2000 services after 500 warmups; factories never execute. It measures definition registration, not service resolution or a realistic application bootstrap.',
    'Historical compiler TypeScript source is not recovered byte-for-byte; page-lean-2 lacks options/equivalence metadata. Fresh controlled cohorts supersede causal attribution.',
    'Build durations are order/cache sensitive. Timed navigation cohorts ran without concurrent test/build processes; desktop noise and dispersion remain.',
    'Mount and action timings are synchronous JS/DOM work, not LCP or INP. JS heap is retained after forced GC; it does not include native DOM memory.',
  ],
};
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const item = manifest.items.find(
  (item) => item.id === 'existing-compiler-ablation',
);
Object.assign(item, {
  status: 'measured',
  evidence: '2026-11-17-compiler-ablations-summary.json',
  decision:
    'retain proven lean mechanisms and corrected service reads; create default, clone opt-in',
  coverage:
    'Seven controlled variants, realistic page and 5000-row fixtures, focused service-state updates, no-compiler declaration control, recovered historical raw data, and red/green owner/reader contracts.',
});
delete item.note;
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-17-compiler-ablations-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived 192 final navigations, 128 earlier screen navigations and the bounded legacy audit. Campaign remains incomplete.',
);
