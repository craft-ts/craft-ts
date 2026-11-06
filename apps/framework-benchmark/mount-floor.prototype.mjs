#!/usr/bin/env node
// PROTOTYPE — sequential experiments; no library edits in the worktree.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.MOUNT_FLOOR_OUTPUT ?? 'tmp/mount-floor',
);
await mkdir(output, { recursive: true });
function run(variables) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(app, 'diagnose.mjs')], {
      cwd: workspace,
      env: { ...process.env, ...variables },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Diagnostic failed (${code})`)),
    );
  });
}
if (process.env.MOUNT_FLOOR_SUMMARIZE_ONLY !== 'true') {
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'counts-component-plain,counts-floor-pure,counts-floor-owner,counts-floor-lazy,counts-floor-ranges,counts-floor-plan,counts-floor-all',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'component-rows-plain-scopes,floor-pure,floor-owner,floor-lazy,floor-ranges,floor-plan,floor-all-no-plan,floor-all',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_FLOOR_SCREEN_RUNS ?? '3',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'timing'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'baseline,component-rows-plain-scopes,floor-best,floor-all',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_FLOOR_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'refine'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_MOUNT_DIAG_VARIANTS: 'counts-floor-best',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'best-counts'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'component-rows-plain-scopes,floor-best,floor-all',
    CRAFT_MOUNT_DIAG_CASES: JSON.stringify([
      { rows: 10, indexes: false },
      { rows: 10, indexes: true },
    ]),
    CRAFT_MOUNT_DIAG_RUNS: '1',
    CRAFT_MOUNT_DIAG_ITERATIONS: '2',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'final-check'),
  });
}
const reports = {};
for (const [name, path] of Object.entries({
  screen: 'timing/timing.json',
  confirm: 'refine/timing.json',
  counts: 'counts/counts.json',
  bestCounts: 'best-counts/counts.json',
})) {
  reports[name] = JSON.parse(await readFile(join(output, path), 'utf8'));
  assert.equal(reports[name].status, 'complete');
}
const stats = (values) => {
  const v = [...values].sort((a, b) => a - b),
    middle = Math.floor(v.length / 2);
  assert(v.length);
  return {
    n: v.length,
    median: v.length % 2 ? v[middle] : (v[middle - 1] + v[middle]) / 2,
    min: v[0],
    max: v.at(-1),
  };
};
const summary = {
  commit: reports.confirm.commit,
  environment: reports.confirm.environment,
  screen: [],
  confirm: [],
  counts: [],
  contracts: [],
  provenance: {},
  validation: {},
};
for (const stage of ['screen', 'confirm']) {
  const report = reports[stage];
  summary.provenance[stage] = {
    settings: report.settings,
    variants: report.variants.map(({ url, ...v }) => v),
    navigations: report.samples.length,
  };
  summary.contracts.push(
    ...report.prototypeContracts.map((x) => ({ ...x, stage })),
  );
  for (const scenario of report.settings.cases)
    for (const variant of report.variants) {
      const samples = report.samples.filter(
        (x) =>
          x.variant === variant.name &&
          x.rows === scenario.rows &&
          x.indexes === scenario.indexes,
      );
      for (const sample of samples) {
        assert.equal(sample.errors.length, 0);
        assert.equal(sample.destroyed.rows, 0);
        assert.equal(sample.destroyed.contracts.reports, 0);
        const reference = report.samples.find(
          (x) =>
            x.variant === 'component-rows-plain-scopes' &&
            x.rows === sample.rows &&
            x.indexes === sample.indexes &&
            x.run === sample.run,
        );
        assert.deepEqual(
          sample.contracts.descriptor,
          reference.contracts.descriptor,
        );
      }
      summary[stage].push({
        ...scenario,
        variant: variant.name,
        mountMs: stats(samples.map((x) => x.startup.bootstrapMs)),
        heapMiB: stats(samples.map((x) => x.memory.usedSize / 1024 ** 2)),
        activeEffects: samples[0].contracts.reports,
        dom: samples[0].contracts.dom,
        actions: Object.fromEntries(
          ['update-one', 'update-tenth', 'reverse', 'filter', 'restore'].map(
            (action) => [
              action,
              stats(
                samples.flatMap((x) =>
                  x.actions
                    .filter((a) => a.action === action)
                    .map((a) => a.domMs),
                ),
              ),
            ],
          ),
        ),
      });
    }
}
for (const report of [reports.counts, reports.bestCounts])
  for (const s of report.samples) {
    assert.equal(s.errors.length, 0);
    const c = s.startup.probe.counts;
    summary.counts.push({
      variant: s.variant,
      rows: s.rows,
      indexes: s.indexes,
      fullInjectors: c['injector.create'],
      compactOwners: c['owner.compact'] ?? 0,
      providerRecords: c['provider.record'],
      signals: Object.entries(c)
        .filter(([k]) => k.startsWith('signal:'))
        .reduce((n, [, v]) => n + v, 0),
      watches: c.watch,
      generatorRuns: c['generator.run'],
      effects: s.contracts.reports,
      dom: s.contracts.dom,
    });
  }
try {
  const final = JSON.parse(
    await readFile(join(output, 'final-check/timing.json'), 'utf8'),
  );
  assert.equal(final.status, 'complete');
  summary.validation.finalCheckNavigations = final.samples.length;
  summary.validation.crossVariantTargets = final.prototypeContracts.reduce(
    (n, x) => n + (x.recordedTargetsResolved ?? 0),
    0,
  );
  summary.contracts.push(
    ...final.prototypeContracts.map((x) => ({ ...x, stage: 'final-check' })),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const key of ['typecheck-comparison', 'type-only-fix']) {
  try {
    summary.validation[key] = JSON.parse(
      await readFile(join(output, key + '.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(
  join(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(`Summary: ${output}/summary.json`);
