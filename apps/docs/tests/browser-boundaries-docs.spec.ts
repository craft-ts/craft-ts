import { readFileSync } from 'node:fs';
import docsConfig from '../.vitepress/config.mts';

describe('docs sidebar', () => {
  it('adds the Browser Boundaries page near Service and before Examples', () => {
    const sidebar = docsConfig.themeConfig?.sidebar;

    expect(sidebar).toBeDefined();
    expect(Array.isArray(sidebar)).toBe(true);

    const sidebarItems = sidebar as Array<{
      text?: string;
      link?: string;
      items?: Array<{ text?: string; link?: string }>;
    }>;

    const serviceIndex = sidebarItems.findIndex(
      (item) => item.text === 'Service',
    );
    const typeSafeIndex = sidebarItems.findIndex(
      (item) => item.text === 'Type-safe DI/Routes',
    );
    const examplesIndex = sidebarItems.findIndex(
      (item) => item.text === 'Examples',
    );

    expect(serviceIndex).toBeGreaterThanOrEqual(0);
    expect(typeSafeIndex).toBeGreaterThan(serviceIndex);
    expect(examplesIndex).toBeGreaterThan(typeSafeIndex);

    expect(sidebarItems[typeSafeIndex]).toEqual({
      text: 'Type-safe DI/Routes',
      items: [
        {
          text: 'Browser Boundaries',
          link: '/type-safe-di-routes/browser-boundaries',
        },
      ],
    });
  });
});

describe('Browser Boundaries doc page', () => {
  const content = readFileSync(
    new URL('../type-safe-di-routes/browser-boundaries.md', import.meta.url),
    'utf8',
  );

  it('marks the page as an upcoming draft API', () => {
    expect(content).toContain('# Browser Boundaries');
    expect(content).toContain('Upcoming / draft API');
    expect(content).toContain('The exports shown below are not shipped yet.');
  });

  it('documents the planned yield-based browser DSL examples', () => {
    expect(content).toContain("yield* Console.log('my service run');");
    expect(content).toContain("yield* LocalStorage.setItem('token', token);");
    expect(content).toContain(
      "const persistedToken = yield* LocalStorage.getItem('token');",
    );
    expect(content).toContain('const href = yield* BrowserLocation.href();');
    expect(content).toContain('yield* BrowserHistory.back();');
  });

  it('documents HttpClient as a related adapter rather than a browser boundary', () => {
    expect(content).toContain('## Related Adapter: `CraftHttpClient`');
    expect(content).toContain(
      "it is not treated as `browserBoundary: true`",
    );
    expect(content).toContain('it requires an explicit success type');
    expect(content).toContain(
      "it returns a promise of `Success | craftException({ code: 'HttpError' })`",
    );
    expect(content).toContain(
      'const getUsers = yield* CraftHttpClient.get<User[]>();',
    );
  });

  it('links back to craftService and toCraftService', () => {
    expect(content).toContain('[`craftService`](/store/craft-service)');
    expect(content).toContain('[`toCraftService`](/store/to-craft-service)');
  });
});

describe('toCraftService doc page', () => {
  const content = readFileSync(
    new URL('../store/to-craft-service.md', import.meta.url),
    'utf8',
  );

  it('includes an HttpClient adaptation example', () => {
    expect(content).toContain('## `HttpClient` Example');
    expect(content).toContain(
      "import { HttpClient } from '@angular/common/http';",
    );
    expect(content).toContain("name: 'HttpClient'");
    expect(content).toContain('const { HttpClientToYield } = toCraftService({');
    expect(content).toContain(
      'const http = yield* HttpClientToYield(undefined, ({ get, post }) => ({',
    );
    expect(content).toContain("listUsers: () => http.get<User[]>('/api/users'),");
    expect(content).toContain("http.post<User>('/api/users', payload)");
  });
});
