import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-inline-route-providers.cjs');
const plugin = require('./index.cjs');

describe('prefer-inline-route-providers', () => {
  it('is enabled by the default CraftTS presets', () => {
    expect(plugin.configs.recommended.rules['craft-ts/prefer-inline-route-providers']).toBe('error');
    expect(plugin.configs.effect.rules['craft-ts/prefer-inline-route-providers']).toBe('error');
  });

  it('reports and autofixes a single-use provider tuple', async () => {
    const result = await lint(
      `
        import { loadCraftComponent } from '@craft-ts/component';
        import { provideLayer } from '@craft-ts/effect';
        const routeProviders = [provideLayer(Live)] as const;
        loadCraftComponent(() => import('./page'), routeProviders);
      `,
      true,
    );

    expect(result.messages).toEqual([]);
    expect(result.output).not.toContain('routeProviders');
    expect(result.output).toContain(
      `loadCraftComponent(() => import('./page'), [provideLayer(Live)] as const);`,
    );
  });

  it('keeps a provider tuple that is used more than once', async () => {
    const result = await lint(`
      import { loadCraftComponent } from '@craft-ts/component';
      const routeProviders = [provider];
      loadCraftComponent(() => import('./a'), routeProviders);
      loadCraftComponent(() => import('./b'), routeProviders);
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(source: string, fix = false) {
  const eslint = new ESLint({
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { providers: rule as never } } },
        rules: { 'local/providers': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}
