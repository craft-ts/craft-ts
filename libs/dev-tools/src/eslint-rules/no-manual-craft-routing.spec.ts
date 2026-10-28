import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-manual-craft-routing.cjs');
const plugin = require('./index.cjs');

const messages = {
  read: 'Do not read or parse the browser URL to determine the active Craft route. Use CraftActivatedRoute and its typed path or query parameter helpers.',
  write:
    'Do not change the app route through the browser URL or History API. Use CraftRouter.navigate(...) for actions or CraftRouterLink(...) for links.',
  listen:
    'Do not subscribe to browser history events to select a Craft page. Let provideCraftRouter and CraftRouterOutlet activate the route.',
  routeLiteral:
    'Do not parse a Craft hash route by hand. Read the active route through CraftActivatedRoute and typed route parameter helpers.',
};

describe('no-manual-craft-routing', () => {
  it('is a base rule for recommended apps and generated app configs', () => {
    expect(plugin.rules['no-manual-craft-routing']).toBe(rule);
    expect(
      plugin.configs.recommended.rules['craft-ts/no-manual-craft-routing'],
    ).toBe('error');
  });

  it('reports browser URL reads used to select and identify routes', async () => {
    expect(
      await lintText(`
        const path = window.location.pathname;
        const hash = location['hash'];
      `),
    ).toEqual([messages.read, messages.read]);
  });

  it('reports manually parsed hash routes and page-specific route checks', async () => {
    expect(
      await lintText(`
        const match = /^#\\/sessions\\/([^/]+)$/.exec(currentHash());
        const comparison = currentHash().startsWith('#/compare?');
        const imported = currentHash() === '#/import';
      `),
    ).toEqual([
      messages.routeLiteral,
      messages.routeLiteral,
      messages.routeLiteral,
    ]);
  });

  it('reports imperative browser route changes and history listeners', async () => {
    expect(
      await lintText(`
        location.hash = '#/sessions/123';
        goToHash('#/sessions/123');
        window.location.href = '/sessions/123';
        location.assign('/sessions/123');
        window.history.pushState({}, '', '/sessions/123');
        window.addEventListener('popstate', onRouteChange);
        renderer.listen(window, 'hashchange', onRouteChange);
        fromEventToSource$(window, 'hashchange').subscribe(onRouteChange);
      `),
    ).toEqual([
      messages.write,
      messages.write,
      messages.write,
      messages.write,
      messages.write,
      messages.listen,
      messages.listen,
      messages.listen,
    ]);
  });

  it('allows Craft navigation, fragment links, and non-route query parameters', async () => {
    expect(
      await lintText(`
        import { CraftRouter } from '@craft-ts/core';
        function* navigate() {
          const router = yield* CraftRouter();
          yield* router.navigate({ to: 'sessions/:sessionId', params: { sessionId: '123' } });
        }
        const link = '#section';
        location.hash = '#section';
        location.assign('https://example.com/');
        const worker = new URLSearchParams(location.search).get('replay-worker');
        window.history.replaceState({ scrollY: 10 }, '');
      `),
    ).toEqual([]);
  });
});

async function lintText(source: string): Promise<string[]> {
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

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}
