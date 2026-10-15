import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-loop-sleep-or-stop.cjs');

async function lint(source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: {
          local: { rules: { 'require-loop-sleep-or-stop': rule as never } },
        },
        rules: { 'local/require-loop-sleep-or-stop': 'error' },
      },
    ],
  });
  const results = await eslint.lintText(source, { filePath: 'demo.ts' });
  return results.flatMap((result) =>
    result.messages.map((message) => message.messageId ?? message.message),
  );
}

describe('require-loop-sleep-or-stop', () => {
  it('reports a while (yield* …) loop that never sleeps nor exits', async () => {
    expect(
      await lint(`
        function* follow() {
          while (yield* following()) {
            yield* sessions.refresh();
          }
        }
      `),
    ).toEqual(['hotLoop']);
  });

  it('reports while (true) and for (;;) with no sleep and no exit', async () => {
    expect(
      await lint(`
        function* a() { while (true) { yield* refresh(); } }
        function* b() { for (;;) { yield* refresh(); } }
        function* c() { do { yield* refresh(); } while (yield* more()); }
      `),
    ).toEqual(['hotLoop', 'hotLoop', 'hotLoop']);
  });

  it('allows a loop that suspends on craftSleep, wherever it is in the body', async () => {
    expect(
      await lint(`
        function* follow() {
          while (yield* following()) {
            yield* craftSleep(5000, { owner: 'poller' });
            yield* sessions.refresh();
          }
          while (true) {
            if (yield* ready()) {
              yield* craftSleep(100);
            }
          }
        }
      `),
    ).toEqual([]);
  });

  it('allows a loop with its own exit', async () => {
    expect(
      await lint(`
        function* drain() {
          while (true) {
            const next = yield* queue.take();
            if (next === undefined) break;
          }
          while (yield* hasMore()) {
            if (yield* done()) return;
          }
        }
      `),
    ).toEqual([]);
  });

  it('ignores ordinary loops and exits or sleeps hidden in nested functions', async () => {
    expect(
      await lint(`
        function plain(items: number[]) {
          for (let index = 0; index < items.length; index += 1) {}
          while (items.length) { items.pop(); }
        }
        function* hidden() {
          while (yield* more()) {
            const later = () => { return craftSleep(10); };
            yield* refresh();
          }
        }
      `),
    ).toEqual(['hotLoop']);
  });
});
