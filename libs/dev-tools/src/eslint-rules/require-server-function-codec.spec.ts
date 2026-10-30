import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const rule = require('./require-server-function-codec.cjs');

async function lint(code: string, filePath = 'functions.ts') {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.ts'],
      languageOptions: { parser: tsParser },
      plugins: { local: { rules: { codec: rule } } },
      rules: { 'local/codec': 'error' },
    }],
  });
  return eslint.lintText(code, { filePath });
}

describe('require-server-function-codec', () => {
  it('accepts client functions with both input and output schemas', async () => {
    const [result] = await lint([
      "import { serverFunction } from '@craft-ts/core';",
      "serverFunction('users.list', inputSchema, { exposure: 'client', output: outputSchema });",
    ].join('\n'));
    expect(result.messages).toEqual([]);
  });

  it('reports missing input decoding and output encoding separately', async () => {
    const [result] = await lint([
      "import { serverFunction } from '@craft-ts/core';",
      "serverFunction('users.list', undefined, { exposure: 'client', output: outputSchema });",
      "serverFunction('users.search', inputSchema, { exposure: 'client' });",
    ].join('\n'));
    expect(result.messages.map((message) => message.messageId)).toEqual([
      'input',
      'output',
    ]);
  });

  it('accepts a specific opaque boundary exemption and rejects a vague one', async () => {
    const [result] = await lint([
      "import { serverFunction } from '@craft-ts/core';",
      "serverFunction('opaque.ok', input, { exposure: 'client', codecExemption: 'Third-party signed opaque payload; handled by the vendor SDK.' });",
      "serverFunction('opaque.bad', input, { exposure: 'client', codecExemption: 'opaque' });",
    ].join('\n'));
    expect(result.messages.map((message) => message.messageId)).toEqual([
      'exemption',
    ]);
  });

  it('does not report server-only functions or test fixtures', async () => {
    const code = [
      "import { serverFunction } from '@craft-ts/core';",
      "serverFunction('internal.read', inputSchema);",
    ].join('\n');
    expect((await lint(code))[0].messages).toEqual([]);
    expect((await lint(code, 'functions.spec.ts'))[0].messages).toEqual([]);
  });

  it('covers portable functions, imported aliases and shared contracts', async () => {
    const [result] = await lint([
      "import { portableServerFunction as portable, serverFunctionContract as contract } from '@craft-ts/core';",
      "portable('users.list', inputSchema, { exposure: 'client', output: outputSchema });",
      "contract({ id: 'users.get', input: inputSchema, exposure: 'client' });",
    ].join('\n'));
    expect(result.messages.map((message) => message.messageId)).toEqual(['output']);
  });

  it('covers namespace imports and ignores server-only contracts', async () => {
    const [result] = await lint([
      "import * as core from '@craft-ts/core';",
      "core.serverFunctionContract({ id: 'users.get', input: inputSchema, exposure: 'client', output: outputSchema });",
      "core.serverFunctionContract({ id: 'users.internal', input: inputSchema, exposure: 'server' });",
    ].join('\n'));
    expect(result.messages).toEqual([]);
  });

  it('is enabled as an error in the recommended preset', () => {
    expect(
      plugin.configs.recommended.rules['craft-ts/require-server-function-codec'],
    ).toBe('error');
  });
});
