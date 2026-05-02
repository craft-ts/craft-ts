import { readFileSync } from 'node:fs';
import docsConfig from '../.vitepress/config.mts';

describe('docs sidebar', () => {
  it('adds the Type-safe DI/Routes pages near Service and before Examples', () => {
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
          text: 'Setup',
          link: '/type-safe-di-routes/setup',
        },
        {
          text: 'Browser Boundaries',
          link: '/type-safe-di-routes/browser-boundaries',
        },
        {
          text: 'Angular Brand Config',
          link: '/type-safe-di-routes/angular-brand-config',
        },
      ],
    });
  });

  it('adds the onAppStart utility page in the Utils section', () => {
    const sidebar = docsConfig.themeConfig?.sidebar;

    expect(sidebar).toBeDefined();
    expect(Array.isArray(sidebar)).toBe(true);

    const sidebarItems = sidebar as Array<{
      text?: string;
      link?: string;
      items?: Array<{ text?: string; link?: string }>;
    }>;

    const utilsSection = sidebarItems.find((item) => item.text === 'Utils');

    expect(utilsSection).toBeDefined();
    expect(utilsSection?.items).toContainEqual({
      text: 'onAppStart',
      link: '/utils/on-app-start',
    });
  });

  it('adds craftMethod right after on$ in the Utils section', () => {
    const sidebar = docsConfig.themeConfig?.sidebar;

    expect(sidebar).toBeDefined();
    expect(Array.isArray(sidebar)).toBe(true);

    const sidebarItems = sidebar as Array<{
      text?: string;
      link?: string;
      items?: Array<{ text?: string; link?: string }>;
    }>;

    const utilsSection = sidebarItems.find((item) => item.text === 'Utils');

    expect(utilsSection?.items).toEqual([
      { text: 'source$', link: '/utils/source$' },
      { text: 'fromEventToSource$', link: '/utils/from-event-to-source$' },
      { text: 'on$', link: '/utils/on$' },
      { text: 'craftMethod', link: '/utils/craft-method' },
      { text: 'onAppStart', link: '/utils/on-app-start' },
      {
        text: 'reactiveWritableSignal',
        link: '/utils/reactive-writable-signal',
      },
      {
        text: 'GlobalPersisterHandler',
        link: '/utils/global-persister-handler-service',
      },
      { text: 'Entities Utilities', link: '/utils/entities-util' },
    ]);
  });
});

describe('onAppStart doc page', () => {
  const content = readFileSync(
    new URL('../utils/on-app-start.md', import.meta.url),
    'utf8',
  );

  it('documents plain and generator callbacks for startup hooks', () => {
    expect(content).toContain('# onAppStart');
    expect(content).toContain(
      'the callback can be a plain function or a generator function',
    );
    expect(content).toContain('appStart: true');
    expect(content).toContain('yield* onAppStart(function* () {');
    expect(content).toContain(
      "yield* Console.log('This is a log from the appStart callback');",
    );
  });

  it('documents dependency tracking and the nested callback restriction', () => {
    expect(content).toContain(
      'Dependencies used only inside this callback are merged into the parent service dependency graph.',
    );
    expect(content).toContain(
      'nested `onAppStart(...)` calls inside the callback are not supported',
    );
    expect(content).toContain('Nested declarations are rejected at runtime.');
    expect(content).toContain(
      '[`Browser Boundaries`](/type-safe-di-routes/browser-boundaries)',
    );
  });
});

describe('Type-safe DI/Routes setup doc page', () => {
  const content = readFileSync(
    new URL('../type-safe-di-routes/setup.md', import.meta.url),
    'utf8',
  );

  it('documents the app-level DI check and crafted routes setup', () => {
    expect(content).toContain('# Setup');
    expect(content).toContain(
      'This guide assumes you are integrating type-safe DI/routes into an Angular app that consumes `@craft-ng/core`.',
    );
    expect(content).toContain('type CheckAppDI = AppCheckedDI<');
    expect(content).toContain('type _CanRun = CanRun<CheckAppDI>;');
    expect(content).toContain(
      "componentDeps: {} as import('./test').GenDeps_TestComponent,",
    );
    expect(content).toContain('routingDeps: appRoutes.META_DATA');
    expect(content).toContain('provideRouter(appRoutes.toRoutes()');
  });

  it('documents the codemod script, eslint rules, and refresh workflow', () => {
    expect(content).toContain(
      '## 3. Run the Angular brand codemod through the published script',
    );
    expect(content).toContain('craft-brand --root src/app');
    expect(content).toContain('@craft-ng/dev-tools/eslint-rules');
    expect(content).toContain(
      "'craft-ng/brand-angular-gen-deps-required': 'error'",
    );
    expect(content).toContain("'craft-ng/brand-angular-deps-match': 'error'");
    expect(content).toContain("'craft-ng/no-angular-inject': 'error'");
    expect(content).toContain("'craft-ng/prefer-craft-service': 'error'");
    expect(content).toContain("'craft-ng/prefer-craft-http-client': 'error'");
    expect(content).toContain(
      'trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-gen-deps-required`',
    );
    expect(content).toContain(
      'trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-deps-match`',
    );
    expect(content).toContain(
      'generate missing aliases and refresh existing ones',
    );
  });
});

describe('Browser Boundaries doc page', () => {
  const content = readFileSync(
    new URL('../type-safe-di-routes/browser-boundaries.md', import.meta.url),
    'utf8',
  );

  it('documents the implemented browser boundary surface', () => {
    expect(content).toContain('# Browser Boundaries');
    expect(content).not.toContain('Upcoming / draft API');
    expect(content).toContain(
      'Every boundary on this page is backed by a global crafted service marked with `browserBoundary: true`.',
    );
    expect(content).toContain('ConsoleServiceToYield');
    expect(content).toContain(
      'That second form is what preserves derivability',
    );
  });

  it('documents the yield-based browser DSL examples', () => {
    expect(content).toContain("yield* Console.log('my service run');");
    expect(content).toContain("yield* LocalStorage.setItem('token', token);");
    expect(content).toContain(
      "const persistedToken = yield* LocalStorage.getItem('token');",
    );
    expect(content).toContain('const href = yield* BrowserLocation.href();');
    expect(content).toContain(
      "yield* BrowserHistory.replaceState({ step: 2 }, '', '/checkout?step=2');",
    );
    expect(content).toContain(
      "yield* BrowserWindow.alert('Cache cleared! The page will reload.');",
    );
    expect(content).toContain(
      'const confirmed = yield* BrowserWindow.confirm(',
    );
    expect(content).toContain('if (confirmed) {');
    expect(content).toContain('- `confirm`');
  });

  it('documents HttpClient as an implemented related adapter rather than a browser boundary', () => {
    expect(content).toContain('## Related Adapter: `CraftHttpClient`');
    expect(content).toContain(
      '`CraftHttpClient` is implemented, but it is not a browser boundary.',
    );
    expect(content).toContain('it is not treated as `browserBoundary: true`');
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

describe('craftMethod doc page', () => {
  const content = readFileSync(
    new URL('../utils/craft-method.md', import.meta.url),
    'utf8',
  );

  it('documents both overloads and the captured injection context', () => {
    expect(content).toContain('# craftMethod');
    expect(content).toContain(
      'The method runs inside the injection context captured when `craftMethod(...)` is created.',
    );
    expect(content).toContain(
      'function craftMethod<This, Args extends unknown[], Result>(',
    );
    expect(content).toContain(
      'factory: (this: This, ...args: Args) => Generator<unknown, Result, unknown>,',
    );
    expect(content).toContain('self: This,');
  });

  it('documents Browser Boundaries and crafted service composition examples', () => {
    expect(content).toContain(
      'readonly increment = craftMethod(this, function* (step = 1) {',
    );
    expect(content).toContain("yield* Console.log('increment is called');");
    expect(content).toContain('readonly increment = craftMethod(function* (');
    expect(content).toContain('this: CounterComponent,');
    expect(content).toContain('const worker = yield* CounterWorkerToYield();');
    expect(content).toContain('[`craftService`](/store/craft-service)');
  });

  it('documents the receiver caveat and onAppStart restriction', () => {
    expect(content).toContain(
      '`craftMethod(fn)` depends on the receiver used at call time.',
    );
    expect(content).toContain(
      '`craftMethod(this, fn)` is the recommended form whenever the generator reads or writes `this`.',
    );
    expect(content).toContain(
      '`onAppStart(...)` is not supported inside `craftMethod`.',
    );
    expect(content).toContain(
      '[`Browser Boundaries`](/type-safe-di-routes/browser-boundaries)',
    );
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
    expect(content).toContain(
      "listUsers: () => http.get<User[]>('/api/users'),",
    );
    expect(content).toContain("http.post<User>('/api/users', payload)");
  });
});

describe('craftService doc page', () => {
  const content = readFileSync(
    new URL('../store/craft-service.md', import.meta.url),
    'utf8',
  );

  it('documents app-start hooks and generator callbacks', () => {
    expect(content).toContain('## App Start');
    expect(content).toContain('`craftService` also supports startup hooks');
    expect(content).toContain('yield* onAppStart(function* () {');
    expect(content).toContain("yield* Console.log('startup log');");
    expect(content).toContain(
      'Dependencies used only inside that callback are still tracked on the parent service.',
    );
  });
});

describe('Angular Brand Config doc page', () => {
  const content = readFileSync(
    new URL('../type-safe-di-routes/angular-brand-config.md', import.meta.url),
    'utf8',
  );

  it('documents the project config entrypoint and the main rule shape', () => {
    expect(content).toContain('# Angular Brand Config');
    expect(content).toContain('craft-brand.config.ts');
    expect(content).toContain('defineAngularBrandConfig');
    expect(content).toContain('importAugmentations');
    expect(content).toContain("module: '@ngx-translate/core'");
    expect(content).toContain("symbols: ['TranslatePipe']");
    expect(content).toContain("metadata: ['imports']");
  });

  it('documents the generated deps and lint alignment behavior', () => {
    expect(content).toContain('TranslateService: TranslateService;');
    expect(content).toContain('missingProvider');
    expect(content).toContain('brand-angular-gen-deps-required');
    expect(content).toContain('brand-angular-deps-match');
    expect(content).toContain(
      'A plain TypeScript import in the file is ignored',
    );
  });

  it('mentions the built-in router augmentation and related docs', () => {
    expect(content).toContain('@angular/router');
    expect(content).toContain('Router');
    expect(content).toContain('[`toCraftService`](/store/to-craft-service)');
    expect(content).toContain(
      '[`Browser Boundaries`](/type-safe-di-routes/browser-boundaries)',
    );
  });
});
