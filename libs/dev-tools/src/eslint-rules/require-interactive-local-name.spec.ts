import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const rule = require('./require-interactive-local-name.cjs');

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: {
          local: { rules: { 'require-interactive-local-name': rule } },
        },
        rules: { 'local/require-interactive-local-name': 'error' },
      },
    ],
  });
  return eslint.lintText(code, { filePath: 'fixture.ts' });
}

function messages(result: ESLint.LintResult) {
  return result.messages.map((message) => message.message);
}

describe('require-interactive-local-name', () => {
  it('rejects a props-first button', async () => {
    const [result] = await lint(`button({ type: 'button' }, 'Save');`);
    expect(messages(result)).toEqual([
      "button() must take a string literal local name as its first argument: button('save', { type: 'button' }, 'Save').",
    ]);
  });

  it('rejects a children-only button whose first string is not a local name', async () => {
    const [result] = await lint(`button('Save');`);
    expect(messages(result)).toEqual([
      "button() must take a string literal local name as its first argument: button('save', { type: 'button' }, 'Save').",
    ]);
  });

  it('accepts a named button', async () => {
    const [result] = await lint(`button('save', { type: 'button' }, 'Save');`);
    expect(result.messages).toEqual([]);
  });

  it('rejects an unnamed email input', async () => {
    const [result] = await lint(`input({ type: 'email' });`);
    expect(messages(result)).toEqual([
      "input() must take a string literal local name as its first argument: input('email', { type: 'email' }).",
    ]);
  });

  it('accepts a named email input', async () => {
    const [result] = await lint(`input('email', { type: 'email' });`);
    expect(result.messages).toEqual([]);
  });

  it('skips hidden inputs', async () => {
    const [result] = await lint(`input({ type: 'hidden' });`);
    expect(result.messages).toEqual([]);
  });

  it('allows non-interactive helpers without a local name', async () => {
    const [result] = await lint(`div('hello'); p('x'); span({});`);
    expect(result.messages).toEqual([]);
  });

  it('rejects a div with a click handler and no local name', async () => {
    const [result] = await lint(`div({ click() {} }, 'x');`);
    expect(messages(result)).toEqual([
      "div() must take a string literal local name as its first argument: div('panel', {}, 'x').",
    ]);
  });

  it('accepts a named div with a click handler', async () => {
    const [result] = await lint(`div('panel', { click() {} }, 'x');`);
    expect(result.messages).toEqual([]);
  });

  it('rejects a non-literal local name', async () => {
    const [result] = await lint(
      `const n = 'save'; button(n, { type: 'button' }, 'Save');`,
    );
    expect(messages(result)).toEqual([
      "button() must take a string literal local name as its first argument: button('save', { type: 'button' }, 'Save').",
    ]);
  });

  it('is enabled as error on the a11y preset', () => {
    expect(
      plugin.configs.a11y.rules['craft-ts/require-interactive-local-name'],
    ).toBe('error');
  });
});
