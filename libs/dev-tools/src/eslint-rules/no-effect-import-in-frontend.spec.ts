import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

async function lint(code: string): Promise<readonly string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'craft-ts': plugin },
        rules: { 'craft-ts/no-effect-import-in-frontend': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'src/app/page.ts' });
  return result.messages.map((message) => message.message);
}

describe('no-effect-import-in-frontend', () => {
  it('rejects direct EffectTS and Craft Effect imports', async () => {
    await expect(
      lint(`import { Effect } from 'effect'; import { queryEffect } from '@craft-ts/effect'; import '@effect/platform';`),
    ).resolves.toHaveLength(3);
  });

  it('rejects re-exports and dynamic imports', async () => {
    await expect(
      lint(`export * from '@craft-ts/i18n-effect'; void import('effect/Schema');`),
    ).resolves.toHaveLength(2);
  });

  it('accepts plain Craft and non-Effect imports', async () => {
    await expect(
      lint(`import { query } from '@craft-ts/core'; import { format } from './format';`),
    ).resolves.toEqual([]);
  });
});
