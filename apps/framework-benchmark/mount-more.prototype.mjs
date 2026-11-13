#!/usr/bin/env node
// PROTOTYPE campaign: no library mutation in the checkout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url)),
  workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.MOUNT_MORE_OUTPUT ?? 'tmp/mount-more',
);
await mkdir(output, { recursive: true });
async function run(variables) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(app, 'diagnose.mjs')], {
      cwd: workspace,
      env: { ...process.env, ...variables },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Diagnostic failed: ${code}`)),
    );
  });
}
if (process.env.MOUNT_MORE_SUMMARIZE_ONLY !== 'true') {
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'next-all,more-inputs,more-lazy-owner,more-value-records,more-segments,more-stage,more-all',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_MORE_SCREEN_RUNS ?? '3',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'screen'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS: 'next-all,more-all,more-ranges,more-best',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_MORE_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'confirm'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_NEXT_CONTRACTS: 'false',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'counts-next-all,counts-more-inputs,counts-more-lazy-owner,counts-more-value-records,counts-more-segments,counts-more-stage,counts-more-ranges,counts-more-all,counts-more-best',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts'),
  });
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
  validation: {},
  provenance: {},
};
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
        x.variant === (stage === 'counts' ? 'counts-next-all' : 'next-all'),
    );
    assert.deepEqual(
      sample.contracts.descriptor,
      reference.contracts.descriptor,
    );
    assert.equal(sample.contracts.tagsSha256, reference.contracts.tagsSha256);
    assert.equal(sample.contracts.reports, reference.contracts.reports);
    if (
      [
        'more-ranges',
        'more-best',
        'counts-more-ranges',
        'counts-more-best',
      ].includes(sample.variant)
    )
      assert.equal(sample.contracts.dom.comment, 4);
    else assert.deepEqual(sample.contracts.dom, reference.contracts.dom);
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
          injectors: c['injector.create'],
          providerRecords: c['provider.record'],
          effects: s.contracts.reports,
          generators: c['generator.run'],
          directInputs: c['input.direct'] ?? 0,
          protocolFallbacks: c['input.fallback'] ?? 0,
          borrowedEntries: c.prototypeCreateBorrowedEntry ?? 0,
          stagedLists: c.prototypeStageFor ?? 0,
          valueProviderReads: c.prototypeProviderValue ?? 0,
          segmentMemoCalls: c.prototypeMemoSegment ?? 0,
          plannedComponents: c['component.planned'],
          dom: s.contracts.dom,
        });
      } else {
        summary[stage].push({
          ...scenario,
          variant: variant.name,
          mountMs: stats(samples.map((s) => s.startup.bootstrapMs)),
          heapMiB: stats(samples.map((s) => s.memory.usedSize / 1024 ** 2)),
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
    }
}
for (const variant of ['more-best', 'more-all']) {
  try {
    summary.validation[variant] = JSON.parse(
      await readFile(
        join(output, `verification-summary-${variant}.json`),
        'utf8',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(
  join(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
for (const r of summary.confirm)
  console.log(
    `${r.rows} indexes=${r.indexes} ${r.variant}: ${r.mountMs.median.toFixed(1)}ms [${r.mountMs.min.toFixed(1)},${r.mountMs.max.toFixed(1)}], ${r.heapMiB.median.toFixed(2)}MiB`,
  );
