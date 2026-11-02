import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-spy-on-system-under-test.cjs');
const recommended = require('./recommended-config.cjs');

const MESSAGE = 'N’espionnez pas le système testé';

describe('no-spy-on-system-under-test', () => {
  it.each([
    ["const { sut } = setupCraftServiceTest(Cart, {}); expect(sut.save).toHaveBeenCalled();", 'sut.save'],
    ["const { sut: cart } = await setupCraftServiceTestingByRegister(Cart, {}); expect(cart.lines.add).not.toHaveBeenCalledWith(1);", 'cart.lines.add'],
    ["const t = await setupCraftServiceTestingByRegister(Cart, {}); expect(t.sut.save).toHaveBeenCalledTimes(1);", 't.sut.save'],
    ["const t = setupTestingService(Cart, {}); vi.spyOn(t.sut, 'save');", 't.sut'],
    ["const { sut } = setupCraftServiceTest(Cart, {}); vi.spyOn(sut.cart, 'add');", 'sut.cart'],
  ])('refuses a spy on the system under test: %s', async (code, name) => {
    expect(await lint(code)).toEqual([expect.stringContaining(`${MESSAGE} (${name})`)]);
  });

  it.each([
    // What it exposes.
    "const { sut } = setupCraftServiceTest(Cart, {}); expect(sut.total()).toBe(3);",
    // What it sends to a mocked boundary.
    "const { sut, mocks } = setupCraftServiceTest(Cart, {}); sut.save(); expect(mocks.CartApi.post).toHaveBeenCalledWith({ id: 1 });",
    "const t = await setupCraftServiceTestingByRegister(Cart, {}); expect(t.mocks.CartApi.post).toHaveBeenCalled();",
    // Not a craft helper's result.
    "const sut = makeCart(); expect(sut.save).toHaveBeenCalled();",
  ])('accepts %s', async (code) => {
    expect(await lint(code)).toEqual([]);
  });

  it('is enabled by the recommended preset', () => {
    expect(recommended['craft-ts/no-spy-on-system-under-test']).toBe('error');
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
        plugins: { local: { rules: { spy: rule as never } } },
        rules: { 'local/spy': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(`async function run() { ${source} }`, { filePath: 'cart.spec.ts' });
  return result.messages.map((message) => message.message);
}
