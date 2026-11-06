#!/usr/bin/env node
// PROTOTYPE — does a common binding dispatcher beat independent effect handles?
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url)), workspace = resolve(app, '../..');
const output = resolve(workspace, process.env.BINDING_MANAGER_OUTPUT ?? 'tmp/binding-manager');
await mkdir(output, { recursive: true });
async function run(file, env = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(app, file)], {
      cwd: workspace, stdio: 'inherit', env: { ...process.env, BINDING_MANAGER_OUTPUT: output, ...env },
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(Error(`${file}: ${code}`)));
  });
}
if (process.env.BINDING_MANAGER_SUMMARIZE_ONLY !== 'true') {
  await run('binding-manager.kernel-check.mjs');
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_VARIANTS: 'counts-fine-grouped,counts-fine-records,counts-fine-manager',
    CRAFT_MOUNT_DIAG_MODE: 'counts', CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'counts'),
    CRAFT_MOUNT_DIAG_CASES: '[{"rows":1000,"indexes":true}]',
    CRAFT_FINE_FANOUT: 'false', CRAFT_FLOOR_CONTRACTS: 'false', CRAFT_NEXT_CONTRACTS: 'false',
  });
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_VARIANTS: 'fine-grouped,fine-records,fine-manager',
    CRAFT_MOUNT_DIAG_MODE: 'timing', CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'confirm'),
    CRAFT_MOUNT_DIAG_RUNS: process.env.BINDING_MANAGER_RUNS ?? '5',
    CRAFT_MOUNT_DIAG_ITERATIONS: '4',
    CRAFT_MOUNT_DIAG_CASES: '[{"rows":1000,"indexes":false},{"rows":1000,"indexes":true},{"rows":5000,"indexes":false},{"rows":5000,"indexes":true}]',
    CRAFT_BINDING_MANAGER: 'true', CRAFT_FINE_FANOUT: 'true',
    CRAFT_FINE_FANOUT_RUNS: process.env.BINDING_MANAGER_FANOUT_RUNS ?? '3',
    CRAFT_FINE_FANOUT_FIELDS: '[32,128,1024]',
    CRAFT_FLOOR_CONTRACTS: 'true', CRAFT_NEXT_CONTRACTS: 'true',
  });
  await run('diagnose.mjs', {
    CRAFT_MOUNT_DIAG_VARIANTS: 'fine-grouped,fine-watch,fine-records,fine-manager',
    CRAFT_MOUNT_DIAG_MODE: 'timing', CRAFT_MOUNT_DIAG_OUTPUT: join(output, 'control'),
    CRAFT_MOUNT_DIAG_RUNS: process.env.BINDING_MANAGER_RUNS ?? '5', CRAFT_MOUNT_DIAG_ITERATIONS: '4',
    CRAFT_MOUNT_DIAG_CASES: '[{"rows":5000,"indexes":false},{"rows":5000,"indexes":true}]',
    CRAFT_FINE_FANOUT: 'false', CRAFT_FLOOR_CONTRACTS: 'true', CRAFT_NEXT_CONTRACTS: 'true',
  });
  await run('verify-fine-plan.mjs', {FINE_PLAN_OUTPUT: output, VERIFY_VARIANT: 'fine-manager'});
  await run('verify-fine-plan.mjs', {FINE_PLAN_OUTPUT: output, VERIFY_VARIANT: 'fine-watch', VERIFY_STAGE: 'control'});
}
const stats = values => {
  const v = [...values].sort((a,b) => a-b), n = v.length;
  assert(n); return { n, median: n % 2 ? v[(n-1)/2] : (v[n/2-1]+v[n/2])/2, min: v[0], max: v.at(-1) };
};
const timing = JSON.parse(await readFile(join(output, 'confirm/timing.json'), 'utf8'));
const counts = JSON.parse(await readFile(join(output, 'counts/counts.json'), 'utf8'));
const kernel = JSON.parse(await readFile(join(output, 'kernel-contracts.json'), 'utf8'));
assert.equal(timing.status, 'complete'); assert.equal(counts.status, 'complete');
for (const report of [timing, counts]) {
  for (const s of report.samples) {
    const reference = report.samples.find(x => x.variant === (report === counts ? 'counts-fine-grouped' : 'fine-grouped') && x.rows === s.rows && x.indexes === s.indexes && x.run === s.run);
    assert.deepEqual(s.errors, []);
    assert.equal(s.contracts.reports, s.rows*(s.indexes?3:2)+3);
    assert.equal(s.contracts.tagsSha256, reference.contracts.tagsSha256);
    assert.deepEqual(s.contracts.dom, reference.contracts.dom);
    assert.deepEqual(s.contracts.descriptor, reference.contracts.descriptor);
    if (!s.variant.endsWith('grouped'))
      assert.deepEqual(s.contracts.manager, { live: s.rows*(s.indexes?3:2), queued: 0, scheduled: false });
  }
}
for (const s of timing.plannedContracts) {
  const reference = timing.plannedContracts.find(x => x.variant === 'fine-grouped' && x.indexes === s.indexes);
  assert.deepEqual(s.result.initialTags, reference.result.initialTags);
}
const summary = {
  commit: timing.commit, environment: timing.environment,
  settings: timing.settings,
  kernel,
  counts: counts.samples.map(s => ({ variant:s.variant,rows:s.rows,indexes:s.indexes,
    watches:s.startup.probe.counts.watch, effects:s.contracts.reports,
    injectors:s.startup.probe.counts['injector.create'],providerRecords:s.startup.probe.counts['provider.record'],manager:s.contracts.manager })),
  mount: [], fanout: [],
  validation: { mountNavigations: timing.samples.length,
    fallbackContracts:timing.prototypeContracts.length,plannedContracts:timing.plannedContracts.length,
    fanoutNavigations:timing.fanout.samples.length+timing.fanout.counters.length,
    resolved:timing.fanout.crossTargets.reduce((n,x)=>n+x.resolved,0),
    identicalTagsAndReplay:true, emptyAfterDestroy:true },
  provenance: { variants: timing.variants.map(({url,...variant})=>variant), countVariants:counts.variants.map(({url,...variant})=>variant) },
};
try {
  const control = JSON.parse(await readFile(join(output, 'control/timing.json'), 'utf8'));
  assert.equal(control.status, 'complete');
  summary.control = [];
  for (const scenario of control.settings.cases)
    for (const {name} of control.variants) {
      const samples=control.samples.filter(s=>s.variant===name&&s.rows===scenario.rows&&s.indexes===scenario.indexes);
      for (const s of samples) {
        const ref=control.samples.find(x=>x.variant==='fine-grouped'&&x.rows===s.rows&&x.indexes===s.indexes&&x.run===s.run);
        assert.equal(s.contracts.tagsSha256,ref.contracts.tagsSha256);
        assert.deepEqual(s.contracts.dom,ref.contracts.dom);
        assert.deepEqual(s.contracts.descriptor,ref.contracts.descriptor);
      }
      summary.control.push({...scenario,variant:name,mountMs:stats(samples.map(s=>s.startup.bootstrapMs)),
        heapMiB:stats(samples.map(s=>s.memory.usedSize/1024**2)),
        actions:Object.fromEntries(['update-one','update-tenth','reverse','filter','restore'].map(a=>[a,stats(samples.flatMap(s=>s.actions.filter(x=>x.action===a).map(x=>x.domMs)))]))});
    }
  summary.provenance.control = control.variants.map(({url,...variant})=>variant);
  summary.validation.controlNavigations=control.samples.length;
  summary.validation.controlFallbackContracts=control.prototypeContracts.length;
  summary.validation.controlPlannedContracts=control.plannedContracts.length;
} catch(error) { if(error.code!=='ENOENT')throw error; }
summary.validation.tests={};
for(const variant of ['fine-manager','fine-watch'])
  try { summary.validation.tests[variant]=JSON.parse(await readFile(join(output,`verification-summary-${variant}.json`),'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
for (const scenario of timing.settings.cases)
  for (const {name} of timing.variants) {
    const samples = timing.samples.filter(s=>s.rows===scenario.rows&&s.indexes===scenario.indexes&&s.variant===name);
    summary.mount.push({...scenario,variant:name,
      mountMs:stats(samples.map(s=>s.startup.bootstrapMs)),
      heapMiB:stats(samples.map(s=>s.memory.usedSize/1024**2)),
      actions:Object.fromEntries(['update-one','update-tenth','reverse','filter','restore'].map(a=>[a,stats(samples.flatMap(s=>s.actions.filter(x=>x.action===a).map(x=>x.domMs)))])) });
  }
for (const fields of [32,128,1024])
  for (const {name} of timing.variants) {
    const samples=timing.fanout.samples.filter(s=>s.variant===name&&s.fields===fields);
    const counters=timing.fanout.counters.find(s=>s.variant===name&&s.fields===fields);
    assert(counters);
    summary.fanout.push({fields,variant:name,mountMs:stats(samples.map(s=>s.mountMs)),
      heapMiB:stats(samples.map(s=>s.heapMiB)),updateMs:stats(samples.flatMap(s=>s.actions.map(a=>a.domMs))),reads:counters.reads});
  }
await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
for(const s of summary.mount) console.log(`${s.rows} indexes=${s.indexes} ${s.variant}: ${s.mountMs.median.toFixed(1)}ms; ${s.heapMiB.median.toFixed(2)}MiB`);
console.log(`Summary: ${join(output,'summary.json')}`);
