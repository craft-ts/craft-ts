import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-direct-temporal-globals.cjs');

describe('no-direct-temporal-globals', () => {
  it('reports direct timer globals and globalThis timer access', async () => {
    const messages = await lint(
      'fixture.ts',
      `
      setTimeout(() => undefined, 10);
      globalThis.setInterval(() => undefined, 10);
      clearTimeout(1);
      clearInterval(1);
    `,
    );

    expect(messages).toEqual([
      'Direct setTimeout(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct setInterval(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct clearTimeout(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct clearInterval(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
    ]);
  });

  it('reports frame, idle and immediate schedulers', async () => {
    const messages = await lint(
      'fixture.ts',
      `
      requestAnimationFrame(() => undefined);
      cancelAnimationFrame(1);
      requestIdleCallback(() => undefined);
      cancelIdleCallback(1);
      setImmediate(() => undefined);
      clearImmediate(1);
    `,
    );

    expect(messages).toEqual(
      [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
      ].map(
        (name) =>
          `Direct ${name}(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.`,
      ),
    );
  });

  it('reports every read of the current time', async () => {
    const messages = await lint(
      'fixture.ts',
      `
      Date.now();
      new Date();
      new Date;
      Date();
      performance.now();
      performance.timeOrigin;
    `,
    );

    expect(messages).toEqual([
      'Direct Date.now() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct new Date() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct new Date() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct Date() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct performance.now is forbidden in Craft modules. Read the monotonic time from the Craft temporal runtime (now()) instead.',
      'Direct performance.timeOrigin is forbidden in Craft modules. Read the monotonic time from the Craft temporal runtime (now()) instead.',
    ]);
  });

  it('reports access through globalThis, window, self and computed keys', async () => {
    const messages = await lint(
      'fixture.ts',
      `
      window.setTimeout(() => undefined, 10);
      self.requestAnimationFrame(() => undefined);
      globalThis['setInterval'](() => undefined, 10);
      window.Date.now();
      globalThis.performance.now();
      Date['now']();
    `,
    );

    expect(messages).toEqual([
      'Direct setTimeout(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct requestAnimationFrame(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct setInterval(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Direct Date.now() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct performance.now is forbidden in Craft modules. Read the monotonic time from the Craft temporal runtime (now()) instead.',
      'Direct Date.now() is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
    ]);
  });

  it('reports aliases that would let the clock escape the rule', async () => {
    const messages = await lint(
      'fixture.ts',
      `
      const clock = Date;
      const { now } = performance;
      const schedule = { setTimeout };
      read(Date);
      const key = 'now';
      Date[key]();
    `,
    );

    expect(messages).toEqual([
      'Passing Date around is forbidden in Craft modules: it escapes the temporal runtime. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Passing performance around is forbidden in Craft modules: it escapes the temporal runtime. Read the monotonic time from the Craft temporal runtime (now()) instead.',
      'Direct setTimeout(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.',
      'Passing Date around is forbidden in Craft modules: it escapes the temporal runtime. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
      'Direct Date.[…] access is forbidden in Craft modules. Read the civil time from the Craft temporal runtime (dateNow()) instead.',
    ]);
  });

  it('allows Date and performance uses that read no clock', async () => {
    expect(
      await lint(
        'fixture.ts',
        `
        const at: Date = new Date(0);
        new Date('2026-10-24');
        Date.parse('2026-10-24');
        Date.UTC(2026, 9, 24);
        Date.prototype.toISOString.call(at);
        const isDate = (value: unknown) => value instanceof Date;
        performance.mark('start');
        performance.measure('span', 'start');
        const scheduler = { setTimeout: 1, now: 2 };
        scheduler.setTimeout;
        export type Clock = { readonly performance: number };
      `,
      ),
    ).toEqual([]);
  });

  it('allows shadowed names and the temporal runtime implementation', async () => {
    expect(
      await lint(
        'fixture.ts',
        `
        const setTimeout = () => undefined;
        setTimeout();
      `,
      ),
    ).toEqual([]);
    expect(
      await lint('temporal-runtime.ts', 'setTimeout(() => undefined, 0);'),
    ).toEqual([]);
  });
});

async function lint(filename: string, source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { temporal: rule as never } } },
        rules: { 'local/temporal': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: filename });
  return result.messages.map((message) => message.message);
}
