import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lab, workspace, baseCommit } from './prepare.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (text) => createHash('sha256').update(text).digest('hex');
const ids = [
  'baseline',
  'empty-wrapper',
  'bound-resolvers',
  'mark-once-ceiling',
  'mark-frozen',
  'local-lists',
  'effectless',
];
const candidates = {};
for (const id of ids) {
  const candidate = await read('roots/' + id + '/candidate.json');
  candidates[id] = {
    ...candidate,
    changes: candidate.changes.map(({ before, after, ...change }) => {
      assert.equal(hash(before), change.beforeSha256);
      assert.equal(hash(after), change.afterSha256);
      return change;
    }),
  };
}
const methods = {};
for (const file of await readdir(import.meta.dirname))
  if (/\.(mjs|ts)$/.test(file)) {
    const source = await readFile(join(import.meta.dirname, file), 'utf8');
    methods[file] = { sha256: hash(source), source };
  }
const tests = {};
for (const name of [
  'baseline-contracts',
  'empty-wrapper-contracts',
  'bound-resolvers-contracts',
  'mark-once-ceiling-contracts',
  'mark-frozen-contracts',
  'baseline-full',
  'empty-wrapper-full',
  'bound-resolvers-full',
  'effectless-full',
  'effectless-compiler',
  'effectless-component',
  'integrated-compiler',
]) {
  const report = await read('tests/' + name + '.json');
  tests[name] = {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    pending: report.numPendingTests,
    todo: report.numTodoTests,
    results: report.testResults.map((file) => ({
      file: file.name,
      status: file.status,
      message: file.message,
      counts: Object.fromEntries(
        ['passed', 'failed', 'pending', 'todo'].map((status) => [
          status,
          file.assertionResults.filter((test) => test.status === status).length,
        ]),
      ),
      tests: file.assertionResults
        .filter(
          (test) =>
            test.status === 'failed' ||
            /\/performance-[^/]+\.spec\.ts$/.test(file.name),
        )
        .map(({ fullName, status, failureMessages }) => ({
          name: fullName,
          status,
          ...(failureMessages.length
            ? {
                failureMessages: failureMessages.map(
                  (message) => message.split('\n')[0],
                ),
              }
            : {}),
        })),
    })),
  };
}
const pages = {};
for (const name of ['services-page', 'confirmation-page', 'effectless-page']) {
  const provenance = await read(name + '/provenance.json');
  for (const build of Object.values(provenance.builds)) delete build.candidate;
  pages[name] = { report: await read(name + '/report.json'), provenance };
}
const micro = {};
for (const name of [
  'local-micro',
  'effectless-ordinary-confirmed',
  'effectless-scalars-confirmed',
])
  micro[name] = await read(name + '/results.json');
const manifestPath = join(
  workspace,
  'docs/benchmarks/2026-11-17-performance-campaign.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
function update(id, values) {
  Object.assign(
    manifest.items.find((i) => i.id === id),
    values,
  );
}
const evidence = '2026-11-17-performance-campaign-summary.json';
update('local-list-specialization', {
  status: 'measured',
  decision: 'retained',
  evidence,
  coverage:
    'Local const components after definite initialization; conservative fallback through hoisted declarations. Default and lean compiler modes retain their existing contracts.',
});
update('effectless-bindings', {
  status: 'measured',
  decision: 'restricted prototype, not enabled',
  evidence,
  coverage:
    'Only exact framework constant scalar readers and direct input expressions. Object member reads are intentionally excluded; primitive fixture improves, realistic page does not.',
});
update('service-empty-wrapper', {
  status: 'measured',
  decision: 'not retained: timing gain not confirmed',
  evidence,
});
update('service-request-records', {
  status: 'measured',
  decision:
    'rejected: bound shared resolvers give negligible memory savings and regress focused resolution',
  evidence,
});
update('service-marking', {
  status: 'partial',
  decision:
    'two cache prototypes rejected by contracts; owned/versioned design remains pending',
  evidence,
});
for (const [id, decision] of [
  ['index-lazy', 'retained only for proven lean lists'],
  [
    'existing-runtime-ablation',
    'cleanup retained; injector-context shortcut rejected',
  ],
  [
    'imperative-retired',
    'removed as requested; measured observations retained',
  ],
])
  update(id, { status: 'audited historical measurements', decision });
update('existing-compiler-ablation', {
  status: 'historical-audit',
  note: 'Report exists, but raw lean ablation data is not committed here; rerun/archive the ablations before closing this item.',
});
manifest.updatedAt = new Date().toISOString();
manifest.progress = {
  newItemsMeasured: 4,
  partialItems: 1,
  historicalItemsAudited: 3,
  complete: false,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const result = {
  schemaVersion: 1,
  status: 'active',
  baselineCommit: baseCommit,
  localListImplementationCommit: 'cd3d220e9fd30d25047af8efb4a5eaa40d89b516',
  createdAt: new Date().toISOString(),
  manifest,
  candidates,
  methods,
  tests,
  pages,
  micro,
  focusedServices: await read('services-focused/results.json'),
  integratedOutput: await read('tests/integrated-output.json'),
  limitations: [
    'Only local-list specialization is integrated. Runtime experiments are isolated and not enabled.',
    'Bootstrap/update JS durations are not LCP or layout/paint timings. Heap is retained JS after explicit GC, not browser process memory.',
    'The first effectless micro screen was discarded because the component test process may have overlapped. Only the subsequent seven-run micro cohorts are included.',
    'Vite build durations run sequentially in one process and have cache/order effects; they do not establish a build speedup.',
    'The local fixture wraps component definitions in a function identically for both compilers. Its baseline already compiles templates but does not specialize the local lists.',
    'A final local compiler whitespace/type-narrowing change was verified by integrated tests and tsc; archived runtime measurements identify the isolated source hashes they used.',
  ],
};
await writeFile(
  join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign-summary.json',
  ),
  JSON.stringify(result, null, 2) + '\n',
);
console.log('Archived campaign measurements; goal remains active.');
