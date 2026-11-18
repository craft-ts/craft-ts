#!/usr/bin/env node
// All mutations are confined to diagnose.mjs temporary copies. No library edits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url)),
  workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.MOUNT_NEXT_OUTPUT ?? 'tmp/mount-next',
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
if (process.env.MOUNT_NEXT_SUMMARIZE_ONLY !== 'true') {
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'floor-best,next-signals,next-effects,next-identity,next-runtime',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_NEXT_SCREEN_RUNS ?? '3',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'screen'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS: 'floor-best,next-lean,next-runtime',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_NEXT_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'confirm'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FLOOR_CONTRACTS: 'true',
    CRAFT_NEXT_CONTRACTS: 'true',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'floor-best,next-component,next-runtime,next-all',
    CRAFT_MOUNT_DIAG_RUNS: process.env.MOUNT_NEXT_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'prepared'),
  });
  await run({
    CRAFT_MOUNT_DIAG_MODE: 'counts',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_NEXT_CONTRACTS: 'false',
    CRAFT_MOUNT_DIAG_VARIANTS:
      'counts-floor-best,counts-next-signals,counts-next-effects,counts-next-identity,counts-next-component,counts-next-lean,counts-next-runtime,counts-next-all',
    CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts-final'),
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
  prepared: [],
  counts: [],
  validation: {},
  provenance: {},
};
for (const stage of ['screen', 'confirm', 'prepared', 'counts']) {
  const report = JSON.parse(
    await readFile(
      join(
        output,
        stage === 'counts' ? 'counts-final' : stage,
        `${stage === 'counts' ? 'counts' : 'timing'}.json`,
      ),
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
    plannedContracts: report.plannedContracts?.length ?? 0,
    plannedTargetChecks: (report.plannedContracts ?? []).reduce(
      (n, x) => n + x.result.checks,
      0,
    ),
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
        x.variant === (stage === 'counts' ? 'counts-floor-best' : 'floor-best'),
    );
    assert.deepEqual(
      sample.contracts.descriptor,
      reference.contracts.descriptor,
    );
    assert.equal(
      sample.contracts.tagsSha256,
      reference.contracts.tagsSha256,
      `Effect tags changed: ${sample.variant}`,
    );
  }
  // A too-restrictive declaration-context guard prevented the first component experiment from activating.
  // Keep its raw data for the audit; only the exercised path in 'prepared' is retained.
  const excluded =
    stage === 'screen'
      ? ['next-component', 'next-all']
      : stage === 'confirm'
        ? ['next-all']
        : [];
  summary.provenance[stage].excludedInactiveComponentVariants = excluded;
  for (const scenario of report.settings.cases)
    for (const variant of report.variants.filter(
      (v) => !excluded.includes(v.name),
    )) {
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
          publicSignals: Object.entries(c)
            .filter(([k]) => k.startsWith('signal:'))
            .reduce((n, [, v]) => n + v, 0),
          privateSignals: c.prototypeRendererSignal ?? 0,
          brands: c['signal.brand'] ?? null,
          effects: s.contracts.reports,
          generatorRuns: c['generator.run'],
          directEffects: c.prototypeCreateEffectRef ?? 0,
          identityCreateFunctionCalls: c['identity.create'],
          identityChildFunctionCalls: c['identity.child'],
          identityEncodes: c['identity.encode'],
          fingerprints: c.prototypeFingerprintPath ?? c['replay.fingerprint'],
          genericComponents: c.ComponentRenderedNode,
          plannedComponents: c['component.planned'] ?? 0,
          dom: s.contracts.dom,
        });
      } else {
        summary[stage].push({
          ...scenario,
          variant: variant.name,
          mountMs: stats(samples.map((x) => x.startup.bootstrapMs)),
          heapMiB: stats(samples.map((x) => x.memory.usedSize / 1024 ** 2)),
          effects: samples[0].contracts.reports,
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
await writeFile(
  join(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
for (const stage of ['screen', 'confirm', 'prepared']) {
  console.log(stage);
  for (const s of summary[stage])
    console.log(
      `${s.rows} ${s.indexes ? 'indexes' : 'no indexes'} ${s.variant}: ${s.mountMs.median.toFixed(1)}ms [${s.mountMs.min.toFixed(1)},${s.mountMs.max.toFixed(1)}], ${s.heapMiB.median.toFixed(2)}MiB`,
    );
}
console.log(`Summary: ${join(output, 'summary.json')}`);
