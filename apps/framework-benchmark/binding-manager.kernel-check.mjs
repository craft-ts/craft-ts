// Executable prototype scenarios; no production runtime is modified.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createManagedKernel } from './mount-binding-manager-prototypes.mjs';
const output = resolve(process.env.BINDING_MANAGER_OUTPUT ?? 'tmp/binding-manager');
await mkdir(output, { recursive: true });
const kernelPath = join(output, 'managed-alien.prototype.mjs');
await writeFile(kernelPath, await createManagedKernel());
const k = await import(pathToFileURL(kernelPath));
const result = { scenarios: [], mixedOrder: {} };
for (const strategy of ['native', 'records', 'coalesced', 'manager']) {
  const make = (fn) => strategy === 'native'
    ? { destroy: k.effect(fn) }
    : k.prototypeManagedBinding(fn, strategy === 'manager' ? 'ordered' : strategy === 'coalesced');
  const scope = [];
  const watch = (fn) => { const ref = make(fn); scope.push(ref); return ref; };
  const batch = (fn) => { k.startBatch(); try { return fn(); } finally { k.endBatch(); } };
  const reads = Array(128).fill(0), values = Array.from({ length: 128 }, () => k.signal(0));
  values.forEach((value, i) => watch(() => { value(); reads[i]++; }));
  reads.fill(0);
  values[37](1);
  assert.deepEqual(reads, Array.from({ length: 128 }, (_, i) => i === 37 ? 1 : 0));
  reads.fill(0);
  batch(() => { values[0](1); values[0](2); values[127](1); });
  assert.equal(reads[0], 1); assert.equal(reads[127], 1);
  assert.equal(reads.reduce((a, b) => a + b), 2);
  const choose = k.signal(true), a = k.signal(0), b = k.signal(0), seen = [];
  watch(() => { seen.push(choose() ? a() : b()); });
  a(1); choose(false); a(2); b(3);
  assert.deepEqual(seen, [0, 1, 0, 3], 'Dynamic dependencies');
  const source = k.signal(1), parity = k.computed(() => source() % 2), equal = [];
  watch(() => { equal.push(parity()); });
  source(3); source(4);
  assert.deepEqual(equal, [1, 0], 'Equal computed must not execute binding');
  const diamond = k.signal(1), left = k.computed(() => diamond() * 2), right = k.computed(() => diamond() + 1), outcomes = [];
  watch(() => { outcomes.push(left() + right()); });
  batch(() => { diamond(2); batch(() => diamond(3)); });
  assert.deepEqual(outcomes, [4, 10], 'Diamond must settle once');
  const pending = k.signal(0); let pendingRuns = 0;
  const removed = watch(() => { pending(); pendingRuns++; });
  batch(() => { pending(1); removed.destroy(); });
  assert.equal(pendingRuns, 1, 'Disposed queued binding ran');
  const unrelated = k.signal(0), tracked = k.signal(0); let trackedRuns = 0;
  watch(() => { tracked(); const previous = k.setActiveSub(undefined); try { unrelated(); } finally { k.setActiveSub(previous); } trackedRuns++; });
  unrelated(1); tracked(1);
  assert.equal(trackedRuns, 2, 'Untracked read subscribed');
  if (strategy !== 'native') {
    const incidental = k.signal(0), returned = [];
    watch(() => returned.push(incidental())); // void callback may return a number
    incidental(1);
    assert.deepEqual(returned, [0, 1]);
  }
  const cascadeA = k.signal(0), cascadeB = k.signal(0), cascade = [];
  watch(() => { const value = cascadeA(); if (value) cascadeB(value); });
  watch(() => { cascade.push(cascadeB()); });
  cascadeA(2);
  assert.deepEqual(cascade, [0, 2], 'Write during dispatch');
  const failure = k.signal(0), afterFailure = [];
  watch(() => { if (failure() === 1) throw Error('expected prototype failure'); });
  watch(() => { afterFailure.push(failure()); });
  assert.throws(() => failure(1), /expected prototype failure/);
  failure(2);
  assert.equal(afterFailure.at(-1), 2, 'Exception recovery');
  // An ordinary effect can fail before the shared dispatcher was reached.
  const externalFailure = k.signal(0), externalRecovery = [];
  scope.push({ destroy: k.effect(() => { if (externalFailure() === 1) throw Error('ordinary failure'); }) });
  watch(() => { externalRecovery.push(externalFailure()); });
  assert.throws(() => externalFailure(1), /ordinary failure/);
  assert.equal(k.prototypeBindingManagerSnapshot().queued, 0, 'Queue retained after an ordinary effect failed');
  externalFailure(2);
  assert.equal(externalRecovery.at(-1), 2);
  assert.throws(() => make(() => { throw Error('initial failure'); }), /initial failure/);
  const ordered = k.signal(0), order = [];
  watch(() => { if (ordered()) order.push('binding A'); });
  scope.push({ destroy: k.effect(() => { if (ordered()) order.push('ordinary effect'); }) });
  watch(() => { if (ordered()) order.push('binding B'); });
  ordered(1);
  result.mixedOrder[strategy] = order;
  let duringBatch;
  batch(() => {
    values.forEach((v, i) => v(i + 10));
    duringBatch = k.prototypeBindingManagerSnapshot();
  });
  if (strategy === 'manager' || strategy === 'coalesced') {
    assert.equal(duringBatch.queued, 128);
    assert.equal(duringBatch.scheduled, true);
  }
  scope.forEach((ref) => ref.destroy());
  scope.forEach((ref) => ref.destroy());
  values[37](500);
  assert.deepEqual(k.prototypeBindingManagerSnapshot(), { live: 0, queued: 0, scheduled: false });
  result.scenarios.push({ strategy, fields: 128, changed: 37, changedReads: 1,
    checks: ['targeted read', 'batch deduplication', 'dynamic dependencies', 'computed equality', 'diamond', 'dispose queued', 'untracked', 'cascade', 'exception recovery', 'external exception recovery', 'initial exception', 'idempotent cleanup'], duringBatch });
}
result.mixedOrder.coalescedChanged = JSON.stringify(result.mixedOrder.native) !== JSON.stringify(result.mixedOrder.coalesced);
assert.deepEqual(result.mixedOrder.manager, result.mixedOrder.native, 'Ordered manager changed interleaving');
await writeFile(join(output, 'kernel-contracts.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
