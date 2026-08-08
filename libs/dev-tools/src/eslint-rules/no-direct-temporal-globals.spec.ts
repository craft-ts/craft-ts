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
