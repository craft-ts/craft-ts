import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(
  new URL('./collections-initial-scheduler.ts', import.meta.url),
  'utf8',
);
class Frame {
  queue = [];
  schedule(task) {
    const ticket = { task, active: true };
    this.queue.push(ticket);
    return {
      cancel() {
        ticket.active = false;
      },
    };
  }
  flush(count = Infinity) {
    let n = 0;
    while (this.queue.length && n++ < count) {
      const ticket = this.queue.shift();
      if (ticket.active) ticket.task();
    }
  }
  destroy() {
    this.queue = [];
  }
}
class Sync {
  schedule(task) {
    task();
    return { cancel() {} };
  }
}
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports = {};
new Function('require', 'exports', compiled)(
  () => ({ FrameForScheduler: Frame, SyncForScheduler: Sync }),
  exports,
);
const { InitialForScheduler } = exports;
test('keeps an unfinished first cohort deferred, then runs later work synchronously', async () => {
  const frame = new Frame(),
    scheduler = new InitialForScheduler(frame),
    seen = [];
  scheduler.schedule(() => seen.push(1));
  scheduler.schedule(() => seen.push(2));
  frame.flush(1);
  await Promise.resolve();
  assert.deepEqual(seen, [1]);
  scheduler.schedule(() => seen.push(3));
  assert.deepEqual(seen, [1]);
  frame.flush();
  await Promise.resolve();
  assert.deepEqual(seen, [1, 2, 3]);
  scheduler.schedule(() => seen.push(4));
  assert.deepEqual(seen, [1, 2, 3, 4]);
});
test('does not finish at a transient empty queue during source replacement', async () => {
  const frame = new Frame(),
    scheduler = new InitialForScheduler(frame),
    seen = [];
  const old = scheduler.schedule(() => seen.push('old'));
  old.cancel();
  scheduler.schedule(() => seen.push('new'));
  await Promise.resolve();
  assert.deepEqual(seen, []);
  frame.flush();
  await Promise.resolve();
  assert.deepEqual(seen, ['new']);
  scheduler.schedule(() => seen.push('later'));
  assert.deepEqual(seen, ['new', 'later']);
});
test('cancellation and destruction remain idempotent', async () => {
  const frame = new Frame(),
    scheduler = new InitialForScheduler(frame),
    seen = [];
  const first = scheduler.schedule(() => seen.push(1)),
    second = scheduler.schedule(() => seen.push(2));
  first.cancel();
  first.cancel();
  scheduler.destroy();
  scheduler.destroy();
  second.cancel();
  frame.flush();
  await Promise.resolve();
  scheduler.schedule(() => seen.push(3));
  assert.deepEqual(seen, []);
});
test('propagates task failures and balances the initial cohort', async () => {
  const frame = new Frame(),
    scheduler = new InitialForScheduler(frame),
    failure = new Error('task');
  scheduler.schedule(() => {
    throw failure;
  });
  assert.throws(
    () => frame.flush(),
    (error) => error === failure,
  );
  await Promise.resolve();
  let ran = false;
  scheduler.schedule(() => {
    ran = true;
  });
  assert(ran);
});
