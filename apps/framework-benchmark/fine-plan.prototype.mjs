#!/usr/bin/env node
// PROTOTYPE: all runtime changes are confined to diagnose.mjs temporary copies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url)),
  workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.FINE_PLAN_OUTPUT ?? 'tmp/fine-plan',
);
await mkdir(output, { recursive: true });
async function run(script, variables) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(app, script)], {
      cwd: workspace,
      env: { ...process.env, ...variables },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} failed: ${code}`)),
    );
  });
}
const variants =
  'shape-lean,fine-reference,fine-direct,fine-shared,fine-grouped';
if (process.env.FINE_PLAN_SUMMARIZE_ONLY !== 'true') {
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'counts-shape-lean,counts-fine-reference,counts-fine-direct,counts-fine-shared,counts-fine-grouped',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_NEXT_CONTRACTS: 'false',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts'),
  });
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_MOUNT_DIAG_VARIANTS: variants,
    CRAFT_MOUNT_DIAG_RUNS: process.env.FINE_PLAN_SCREEN_RUNS ?? '3',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'screen'),
  });
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_MOUNT_DIAG_VARIANTS: variants,
    CRAFT_MOUNT_DIAG_RUNS: process.env.FINE_PLAN_RUNS ?? '5',
    CRAFT_FINE_FANOUT: 'true',
    CRAFT_FINE_FANOUT_RUNS: process.env.FINE_PLAN_FANOUT_RUNS ?? '3',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'confirm'),
  });
  await run('verify-fine-plan.mjs', { FINE_PLAN_OUTPUT: output });
}
const stats = (values) => {
  const v = [...values].sort((a, b) => a - b),
    n = v.length;
  assert(n);
  return {
    n,
    median: n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2,
    min: v[0],
    max: v.at(-1),
  };
};
const summary = {
  commit: null,
  environment: null,
  screen: [],
  confirm: [],
  counts: [],
  fanout: [],
  validation: {},
  provenance: {},
};
let fields;
for (const stage of ['screen', 'confirm', 'counts']) {
  const report = JSON.parse(
    await readFile(
      join(output, stage, `${stage === 'counts' ? 'counts' : 'timing'}.json`),
      'utf8',
    ),
  );
  assert.equal(report.status, 'complete');
  summary.commit = report.commit;
  summary.environment = report.environment;
  summary.provenance[stage] = {
    navigations: report.samples.length,
    settings: report.settings,
    variants: report.variants.map(({ url, ...v }) => v),
  };
  summary.validation[stage] = {
    fallbackContracts: report.prototypeContracts?.length ?? 0,
    preparedContracts: report.plannedContracts?.length ?? 0,
  };
  for (const sample of report.samples) {
    assert.deepEqual(sample.errors, []);
    assert.equal(sample.destroyed.rows, 0);
    assert.equal(sample.destroyed.contracts.reports, 0);
    const reference = report.samples.find(
      (x) =>
        x.rows === sample.rows &&
        x.indexes === sample.indexes &&
        x.run === sample.run &&
        x.variant === (stage === 'counts' ? 'counts-shape-lean' : 'shape-lean'),
    );
    assert.deepEqual(
      sample.contracts.descriptor,
      reference.contracts.descriptor,
    );
    const name = sample.variant.replace(/^counts-/, '');
    const perRow =
      name === 'shape-lean'
        ? 1
        : name === 'fine-reference'
          ? sample.indexes
            ? 5
            : 3
          : sample.indexes
            ? name === 'fine-grouped'
              ? 3
              : 4
            : 2;
    assert.equal(sample.contracts.reports, sample.rows * perRow + 3);
    if (name !== 'fine-reference')
      assert.deepEqual(sample.contracts.dom, reference.contracts.dom);
    if (name === 'fine-shared') {
      const peer = report.samples.find(
        (x) =>
          x.rows === sample.rows &&
          x.indexes === sample.indexes &&
          x.run === sample.run &&
          x.variant ===
            (stage === 'counts' ? 'counts-fine-direct' : 'fine-direct'),
      );
      assert.equal(
        sample.contracts.tagsSha256,
        peer.contracts.tagsSha256,
        'Shared factory changed report tags',
      );
    }
  }
  for (const scenario of report.settings.cases)
    for (const variant of report.variants) {
      const samples = report.samples.filter(
        (x) =>
          x.rows === scenario.rows &&
          x.indexes === scenario.indexes &&
          x.variant === variant.name,
      );
      if (stage === 'counts') {
        const s = samples[0],
          c = s.startup.probe.counts;
        summary.counts.push({
          ...scenario,
          variant: variant.name,
          finePlans: c['component.fine-plan'] ?? 0,
          sharedFactories: c['effect.factory.shared'] ?? 0,
          injectors: c['injector.create'],
          providerRecords: c['provider.record'],
          generators: c['generator.run'],
          watches: c.watch,
          effects: s.contracts.reports,
          dom: s.contracts.dom,
        });
      } else
        summary[stage].push({
          ...scenario,
          variant: variant.name,
          mountMs: stats(samples.map((s) => s.startup.bootstrapMs)),
          heapMiB: stats(samples.map((s) => s.memory.usedSize / 1024 ** 2)),
          effects: samples[0].contracts.reports,
          dom: samples[0].contracts.dom,
          actions: Object.fromEntries(
            ['update-one', 'update-tenth', 'reverse', 'filter', 'restore'].map(
              (action) => [
                action,
                stats(
                  samples.flatMap((s) =>
                    s.actions
                      .filter((a) => a.action === action)
                      .map((a) => a.domMs),
                  ),
                ),
              ],
            ),
          ),
        });
    }
  if (report.fanout) fields = report.fanout;
}
assert(fields);
for (const count of [32, 128])
  for (const name of [
    'shape-lean',
    'fine-reference',
    'fine-direct',
    'fine-shared',
  ]) {
    const samples = fields.samples.filter(
        (x) => x.fields === count && x.variant === name,
      ),
      counters = fields.counters.find(
        (x) => x.fields === count && x.variant === name,
      );
    assert(counters);
    summary.fanout.push({
      fields: count,
      variant: name,
      mountMs: stats(samples.map((x) => x.mountMs)),
      heapMiB: stats(samples.map((x) => x.heapMiB)),
      updateMs: stats(samples.flatMap((x) => x.actions.map((a) => a.domMs))),
      effects: counters.effects,
      reads: counters.reads,
    });
  }
summary.validation.fanout = {
  navigations: fields.samples.length + fields.counters.length,
  comparisons: fields.crossTargets.length,
  resolved: fields.crossTargets.reduce((n, x) => n + x.resolved, 0),
};
try {
  summary.validation.tests = JSON.parse(
    await readFile(
      join(output, 'verification-summary-fine-grouped.json'),
      'utf8',
    ),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await writeFile(
  join(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
for (const r of summary.confirm)
  console.log(
    `${r.rows} indexes=${r.indexes} ${r.variant}: ${r.mountMs.median.toFixed(1)}ms; ${r.effects} effects; ${r.heapMiB.median.toFixed(2)}MiB`,
  );
