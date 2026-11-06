#!/usr/bin/env node
// PROTOTYPE — one command for counts, independent-field fanout and list timing.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.COMPONENT_PROTOTYPE_OUTPUT ?? 'tmp/component-granularity',
);
await mkdir(output, { recursive: true });
function run(script, variables) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(app, script)], {
      cwd: workspace,
      env: { ...process.env, ...variables },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)),
    );
  });
}
if (process.env.COMPONENT_PROTOTYPE_SUMMARIZE_ONLY !== 'true') {
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'counts,counts-plain,counts-component,counts-component-plain',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts'),
  });
  await run('component-fanout.prototype.mjs', {
    COMPONENT_FANOUT_OUTPUT: join(output, 'fanout'),
  });
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'baseline,plain-effect-scope,component-rows,component-rows-plain-scopes',
    CRAFT_MOUNT_DIAG_RUNS: process.env.COMPONENT_PROTOTYPE_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_ITERATIONS:
      process.env.COMPONENT_PROTOTYPE_ITERATIONS ?? '4',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'timing'),
  });
}
const timing = JSON.parse(
  await readFile(join(output, 'timing/timing.json'), 'utf8'),
);
const counts = JSON.parse(
  await readFile(join(output, 'counts/counts.json'), 'utf8'),
);
const fanout = JSON.parse(
  await readFile(join(output, 'fanout/results.json'), 'utf8'),
);
for (const report of [timing, counts, fanout])
  assert.equal(report.status, 'complete');
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
  commit: timing.commit,
  environment: timing.environment,
  settings: timing.settings,
  variants: timing.variants.map(({ url, ...variant }) => variant),
  listNavigations: timing.samples.length,
  listInteractions: timing.samples.reduce((n, s) => n + s.actions.length, 0),
  countsNavigations: counts.samples.length,
  fanoutNavigations: fanout.samples.length + fanout.counters.length,
  list: [],
  counts: [],
  fanout: [],
  crossStrategyTargets: {
    comparisons: fanout.crossStrategyTargets.length,
    resolved: fanout.crossStrategyTargets.reduce((n, x) => n + x.resolved, 0),
  },
  limits: [
    'Prototype for synchronous templates returning static descriptors; not a new public renderStrategy API.',
    'Grouped strategy changes effect reports and template trace counts. Full recorded-session compatibility is not certified.',
    'No asynchronous/pending/error/SSR compatibility claim; runtime libraries remain unchanged except isolated plain-scope snapshots.',
  ],
};
for (const scenario of timing.settings.cases)
  for (const variant of timing.variants) {
    const samples = timing.samples.filter(
      (x) =>
        x.variant === variant.name &&
        x.rows === scenario.rows &&
        x.indexes === scenario.indexes,
    );
    for (const s of samples) {
      assert.equal(s.errors.length, 0);
      assert.equal(s.destroyed.rows, 0);
      assert.equal(s.destroyed.contracts.reports, 0);
      const grouped = variant.name.startsWith('component-rows');
      assert.equal(
        s.contracts.reports,
        s.rows * (grouped ? 2 : s.indexes ? 6 : 4) + 3,
      );
      const baseline = timing.samples.find(
        (x) =>
          x.variant === 'baseline' &&
          x.rows === s.rows &&
          x.indexes === s.indexes &&
          x.run === s.run,
      );
      assert.deepEqual(s.contracts.descriptor, baseline.contracts.descriptor);
    }
    summary.list.push({
      ...scenario,
      variant: variant.name,
      mountMs: stats(samples.map((x) => x.startup.bootstrapMs)),
      heapMiB: stats(samples.map((x) => x.memory.usedSize / 1024 ** 2)),
      activeEffects: samples[0].contracts.reports,
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
for (const sample of counts.samples)
  summary.counts.push({
    variant: sample.variant,
    rows: sample.rows,
    indexes: sample.indexes,
    effects: sample.contracts.reports,
    injector: sample.startup.probe.counts['injector.create'],
    providerRecords: sample.startup.probe.counts['provider.record'],
    watches: sample.startup.probe.counts.watch,
    generatorRuns: sample.startup.probe.counts['generator.run'],
  });
for (const fields of [32, 128])
  for (const strategy of ['binding', 'component']) {
    const samples = fanout.samples.filter(
      (x) => x.fields === fields && x.strategy === strategy,
    );
    const counter = fanout.counters.find(
      (x) => x.fields === fields && x.strategy === strategy,
    );
    summary.fanout.push({
      fields,
      strategy,
      mountMs: stats(samples.map((x) => x.mountMs)),
      updateMs: stats(samples.flatMap((x) => x.actions.map((a) => a.domMs))),
      activeEffects: counter.effects,
      readsPerSingleUpdate: counter.reads.map((x) =>
        x.fields.reduce((a, b) => a + b, 0),
      ),
      templateRendersPerUpdate: counter.reads.map((x) => x.renders),
    });
  }
await writeFile(
  join(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(`Summary: ${output}/summary.json`);
