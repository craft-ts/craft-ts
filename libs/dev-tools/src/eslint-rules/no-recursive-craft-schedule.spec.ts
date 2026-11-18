import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-recursive-craft-schedule.cjs');
const plugin = require('./index.cjs');

describe('no-recursive-craft-schedule', () => {
  it('reports a callback that schedules itself by name', async () => {
    const messages = await lint(`
      const refreshAgain = () => {
        refreshRequested$.emit(++refreshCount);
        temporal.schedule(refreshAgain, REFRESH_EVERY_MS, { owner: 'session-archive' });
      };
      refreshAgain();
    `);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('schedules itself recursively');
  });

  it('follows function declarations, aliases, and computed schedule names', async () => {
    const messages = await lint(`
      function refreshAgain() {
        const callback = refreshAgain;
        temporal['schedule'](callback, 1_000);
      }
    `);

    expect(messages).toHaveLength(1);
  });

  it('does not report a callback scheduling a different function', async () => {
    const messages = await lint(`
      const refreshAgain = () => temporal.schedule(refreshLater, 1_000);
      const refreshLater = () => temporal.schedule(refreshAgain, 1_000);
    `);

    expect(messages).toEqual([]);
  });

  it('does not report a schedule nested in a different callback', async () => {
    const messages = await lint(`
      const refreshAgain = () => {
        temporal.schedule(() => temporal.schedule(refreshAgain, 1_000), 1_000);
      };
    `);

    expect(messages).toEqual([]);
  });

  it('is enabled as an error in the recommended preset', () => {
    expect(
      plugin.configs.recommended.rules['craft-ts/no-recursive-craft-schedule'],
    ).toBe('error');
  });
});

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
        plugins: { local: { rules: { schedule: rule as never } } },
        rules: { 'local/schedule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}
