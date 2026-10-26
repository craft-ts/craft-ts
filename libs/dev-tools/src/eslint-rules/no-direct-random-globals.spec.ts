import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-direct-random-globals.cjs');
const recommended = require('./recommended-config.cjs');

describe('no-direct-random-globals', () => {
  it('reports direct random globals and globalThis access', async () => {
    expect(
      await lint(
        'fixture.ts',
        `Math.random(); crypto.randomUUID(); crypto.getRandomValues(new Uint8Array(4)); globalThis.crypto.randomUUID(); globalThis.Math.random();`,
      ),
    ).toEqual([
      'Direct random randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.',
      'Direct randomUUID randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.',
      'Direct getRandomValues randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.',
      'Direct randomUUID randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.',
      'Direct random randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.',
    ]);
  });

  it('allows shadowed globals and the runtime implementation', async () => {
    expect(
      await lint('fixture.ts', 'const Math = { random() {} }; Math.random();'),
    ).toEqual([]);
    expect(await lint('craft-random-runtime.ts', 'Math.random();')).toEqual([]);
  });

  it('is enabled by the recommended preset', () => {
    expect(recommended['craft-ts/no-direct-random-globals']).toBe('error');
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
        plugins: { local: { rules: { random: rule as never } } },
        rules: { 'local/random': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: filename });
  return result.messages.map((message) => message.message);
}
