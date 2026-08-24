import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noManualRouteProviderList = require('./no-manual-route-provider-list.cjs');
const noWidenedRouteProviderContext = require(
  './no-widened-route-provider-context.cjs',
);

describe('route provider context rules', () => {
  it('rejects a manually enumerated application provider list', async () => {
    const messages = await lint(
      `
        type AppNames = 'BrowserWindowService' | 'StorageService';
        type Check = RouteCheckedDI<ComponentDeps, AppNames, never, 'route'>;
      `,
      noManualRouteProviderList,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('manual provider-name list');
  });

  it('accepts the inferred application provider type', async () => {
    const messages = await lint(
      `
        type AppProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;
        type Check = RouteCheckedDI<
          ComponentDeps,
          AppProvidedNames | 'CraftRouter',
          never,
          'route'
        >;
      `,
      noManualRouteProviderList,
    );
    expect(messages).toEqual([]);
  });

  it('rejects a widened provider context', async () => {
    const messages = await lint(
      `type Check = RouteCheckedDI<ComponentDeps, string, never, 'route'>;`,
      noWidenedRouteProviderContext,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('widened to string/any');
  });
});

async function lint(source: string, rule: unknown): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: 'route.ts' });
  return result.messages.map((message) => message.message);
}
