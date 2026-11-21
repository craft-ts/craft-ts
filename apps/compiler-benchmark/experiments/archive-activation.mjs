import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lab, workspace } from './prepare.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const cohorts = {};
for (const name of [
  'activation-runtime',
  'activation-lean',
  'activation-complete-runtime',
  'activation-complete-lean',
  'activation-complete-standard',
]) {
  const result = await read(name + '/results.json');
  assert(result.contracts.every((contract) => contract.passed));
  assert.equal(result.raw.length, result.summary.length * result.runs);
  cohorts[name] = result;
}
const pages = {};
for (const name of [
  'activation-runtime-page',
  'activation-complete-runtime-page',
  'activation-complete-lean-page',
]) {
  pages[name] = {
    report: await read(name + '/report.json'),
    provenance: await read(name + '/provenance.json'),
  };
  assert(pages[name].report.equivalence['2']);
}
const validation = await read('tests/activation-complete-validation.json');
assert(validation.validation.every((check) => check.exitCode === 0));
assert(validation.contracts.every((contract) => contract.passed));
const compilerTests = await read('tests/activation-complete-compiler.json');
const componentTests = await read('tests/activation-complete-component.json');
assert(compilerTests.success && compilerTests.numPassedTests === 78);
assert(componentTests.success && componentTests.numPassedTests === 609);
const candidates = {};
for (const name of [
  'compiler-activation-reference',
  'compiler-activation',
  'compiler-activation-complete',
]) {
  const candidate = await read('roots/' + name + '/candidate.json');
  const changes = candidate.changes.map((change) => {
    const before = join(lab, 'roots/baseline', change.file),
      after = join(lab, 'roots', name, change.file);
    const diff = spawnSync('git', ['diff', '--no-index', '--', before, after], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    assert([0, 1].includes(diff.status));
    return {
      file: change.file,
      beforeSha256: change.beforeSha256,
      afterSha256: change.afterSha256,
      patch: diff.stdout,
    };
  });
  candidates[name] = {
    id: candidate.id,
    baseCommit: candidate.baseCommit,
    foundation: 'b6cc4a594',
    changes,
  };
}
const methods = {};
for (const name of [
  'compiler-activation.mjs',
  'activation.contracts.ts',
  'validate-activation.mjs',
  'run-micro.mjs',
  'run-page.mjs',
  'archive-activation.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const runners = {};
for (const name of [
  'activation-complete-runtime',
  'activation-complete-lean',
  'activation-complete-standard',
]) {
  const source = await readFile(join(lab, name, 'runner.mjs'), 'utf8');
  runners[name] = { sha256: hash(source), source };
}
const paired = {};
const median = (values) => {
  const a = values.toSorted((a, b) => a - b),
    m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
for (const name of [
  'activation-complete-runtime',
  'activation-complete-lean',
  'activation-complete-standard',
]) {
  const data = cohorts[name];
  paired[name] = {};
  for (const kind of new Set(data.raw.map((row) => row.kind))) {
    const deltas = [];
    for (let run = 0; run < data.runs; run++) {
      const ref = data.raw.find(
        (row) =>
          row.run === run &&
          row.kind === kind &&
          row.label === 'compiler-activation-reference',
      );
      const candidate = data.raw.find(
        (row) =>
          row.run === run &&
          row.kind === kind &&
          row.label === 'compiler-activation-complete',
      );
      deltas.push(candidate.mount - ref.mount);
    }
    paired[name][kind] = {
      mountDeltaMs: deltas,
      medianMountDeltaMs: median(deltas),
    };
  }
}
const manifestPath = join(
  workspace,
  'docs/benchmarks/2026-11-17-performance-campaign.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((item) => item.id === 'runtime-tree-shaking'),
  {
    status: 'measured',
    decision:
      'restricted prototype, not enabled: bundle reduction proved; latency is noisy and activation introduces an ESM cycle',
    evidence: '2026-11-17-compiler-activation-summary.json',
    coverage:
      'Both compiled component renderer classes and their plan lookup/create helpers disappear without plans and remain with the plugin. Some list bookkeeping remains. Ordinary, lean and standard browser contracts, realistic page, late activation, invalidation, TypeScript and library suites are checked. Bundle reduction is measured; no mounting improvement is established.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  foundation: 'b6cc4a594',
  workingHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  decision: 'restricted prototype, no production runtime changes',
  cohorts,
  pages,
  paired,
  candidates,
  methods,
  runners,
  validation: { ...validation, compilerTests, componentTests },
  limitations: [
    'Initial screen only removed the ordinary compiled class: two instanceof checks retained the lean class. It is not the final implementation.',
    'Initial screen uses globally shuffled jobs. Complete micro confirmations use randomized adjacent blocks with variant order balanced by run parity. Raw order and runner sources are archived.',
    'Separate cohorts cannot be compared as if the difference were caused by the candidate. Both raw and paired deltas are reported; dispersion remains visible.',
    'No test/build subprocess runs during a timing cohort. The shared desktop remains active; benchmark results are not a dedicated-device certification.',
    'Mount excludes parsing, module evaluation and model preparation. Ready and two-frame observations are also archived; neither is LCP or INP.',
    'Bundle reduction requires a bundler that eliminates unused exports, and no reachable compiler plan registration. A reachable lazy compiler chunk may keep support in a shared bundle.',
    'ESM imports form an intentional cycle between plan attachment and interpreter activation; no top-level activation is performed. Browser, test and late-activation contracts check initialization.',
    'Shared list branches and LeanEntryView remain in the ordinary bundle. The experiment removes both component renderer classes, not all bytes related to compiled lists.',
    'Standard nested retained heap rises by about 0.62MiB in the unpaired medians, with paired deltas from roughly 0.005 to 1.13MiB. The cause is not established; it is not dismissed as allocator noise.',
    'Single sequential build timings are cache-sensitive, not a throughput comparison.',
    'Component typecheck disables composite for the isolated source tree, whose project references are deliberately removed by prepare.mjs. Compiler options remain otherwise identical.',
  ],
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(
    workspace,
    'docs/benchmarks/2026-11-17-compiler-activation-summary.json',
  ),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived compiler activation experiments. Campaign remains incomplete.',
);
