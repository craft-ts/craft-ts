import { readFileSync } from 'node:fs';
import docsConfig from '../.vitepress/config.mts';

type SidebarItem = {
  text?: string;
  link?: string;
  items?: SidebarItem[];
};

const sidebar = docsConfig.themeConfig?.sidebar as Record<
  string,
  SidebarItem[]
>;

const flatten = (items: SidebarItem[]): SidebarItem[] =>
  items.flatMap((item) => [item, ...flatten(item.items ?? [])]);

const linksOf = (section: string) =>
  flatten(sidebar[section] ?? [])
    .map((item) => item.link)
    .filter((link): link is string => Boolean(link));

describe('docs sidebar', () => {
  it('splits the sidebar per top-level section', () => {
    expect(sidebar).toBeDefined();
    expect(Array.isArray(sidebar)).toBe(false);
    expect(Object.keys(sidebar).sort()).toEqual([
      '/guide/',
      '/learn/',
      '/reference/',
      '/resources/',
    ]);
  });

  it('orders the Learn path from the overview to the last step', () => {
    expect(linksOf('/learn/')).toEqual([
      '/learn/',
      '/learn/01-first-state',
      '/learn/02-derive',
      '/learn/03-service',
      '/learn/04-compose',
      '/learn/05-load-data',
      '/learn/06-mutate-data',
      '/learn/07-url-state',
      '/learn/08-forms',
      '/learn/09-routing',
      '/learn/10-testing',
      '/learn/next',
    ]);
  });

  it('groups the guide by task, concepts first and advanced last', () => {
    const groups = (sidebar['/guide/'] ?? [])
      .filter((item) => item.items?.length)
      .map((item) => item.text);

    expect(groups[0]).toBe('Core concepts');
    expect(groups[1]).toBe('Managing state');
    expect(groups.at(-1)).toBe('Going further');
  });

  it('keeps the routing, testing and reactivity pages reachable', () => {
    const guideLinks = linksOf('/guide/');

    expect(guideLinks).toContain('/guide/routing/setup');
    expect(guideLinks).toContain('/guide/routing/scaling');
    expect(guideLinks).toContain('/guide/testing/browser-boundaries');
    expect(guideLinks).toContain('/guide/testing/components');
    expect(guideLinks).toContain('/guide/testing/architecture');
    expect(guideLinks).toContain('/guide/testing/craft-graph-vs-nx');
    expect(guideLinks).toContain('/guide/components/fine-grained-reactivity');
    expect(guideLinks).toContain('/guide/reactivity/craft-method');
    expect(guideLinks).toContain('/guide/reactivity/craft-computed');
    expect(guideLinks).toContain('/guide/reactivity/craft-effect');
    expect(guideLinks).toContain('/guide/app/app-start');
  });

  it('exposes the five top-level nav entries', () => {
    const nav = docsConfig.themeConfig?.nav as Array<{ text?: string }>;

    expect(nav.map((entry) => entry.text)).toEqual([
      'Learn',
      'Guide',
      'Reference',
      'Packages',
      'Resources',
    ]);
  });
});

describe('forms overview', () => {
  const content = readFileSync(
    new URL('../guide/forms/index.md', import.meta.url),
    'utf8',
  );
  const exceptions = readFileSync(
    new URL('../guide/forms/exceptions.md', import.meta.url),
    'utf8',
  );

  it('renders the insertFormSubmit section with a link to its guide', () => {
    expect(content).toContain(
      '### insertFormSubmit\n\n`insertFormSubmit` connects the form to a mutation.',
    );
    expect(content).toContain('[Submitting a form](/guide/forms/submit)');
  });

  it('documents that selected form branches must be materialized before DOM binding', () => {
    expect(content).toContain(
      'CraftFieldDirective(loginForm.form.selectEmail())',
    );
    expect(content).toContain(
      '`insertSelectFormTree` materializes its branch lazily',
    );
    expect(content).not.toContain('CraftFieldDirective(loginForm.form.email)');
  });

  it('documents group-validator obligations without a group DOM binding', () => {
    expect(exceptions).toContain(
      'The group itself does not need a\n`CraftFieldDirective`',
    );
    expect(exceptions).toContain('`credentials.passwordMismatch`');
    expect(exceptions).toContain('fieldExceptionBlock.partial');
    expect(exceptions).toContain('fieldExceptionBlock.exhaustive');
    expect(exceptions).toContain(
      'loadCraftComponent(async () => BaseRegistrationForm)',
    );
  });
});

describe('fine-grained reactivity docs', () => {
  const home = readFileSync(new URL('../index.md', import.meta.url), 'utf8');
  const guide = readFileSync(
    new URL('../guide/components/fine-grained-reactivity.md', import.meta.url),
    'utf8',
  );

  it('presents the feature on the home page and documents its contract', () => {
    expect(home).toContain('Fine-grained reactivity');
    expect(home).toContain('/guide/components/fine-grained-reactivity');
    expect(guide).toContain('# Fine-grained reactivity');
    expect(guide).toContain('The binding is the reactive boundary');
    expect(guide).toContain('require-reactive-template-bindings');
    expect(guide).toContain('component / update');
  });
});

describe('craftGen doc page', () => {
  const content = readFileSync(
    new URL('../guide/concepts/generators.md', import.meta.url),
    'utf8',
  );

  it('documents composable short-circuiting and the main reason to use it', () => {
    expect(content).toContain('# Generators and `yield*`');
    expect(content).toContain('## `craftGen` — a tracked generator');
    expect(content).toContain(
      'Build reusable generator factories that can be composed with `yield*`',
    );
    expect(content).toContain('`CraftGenShortCircuit`');
    expect(content).toContain('`craftException(...)` results are converted');
    expect(content).toContain(
      'parameterise one guard and reuse it across routes',
    );
    expect(content).toContain('the first exception wins');
    expect(content).toContain('](/guide/routing/guards)');
  });
});

describe('onAppStart doc page', () => {
  const content = readFileSync(
    new URL('../guide/app/app-start.md', import.meta.url),
    'utf8',
  );

  it('documents plain and generator callbacks for startup hooks', () => {
    expect(content).toContain('# App start');
    expect(content).toContain('`onAppStart` declares work');
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
      '[`Browser Boundaries`](/guide/testing/browser-boundaries)',
    );
  });
});

describe('Type-safe DI/Routes setup doc page', () => {
  const content = readFileSync(
    new URL('../guide/routing/setup.md', import.meta.url),
    'utf8',
  );

  it('documents the app-level DI check and crafted routes setup', () => {
    expect(content).toContain('# Routing setup');
    expect(content).toContain(
      'This guide assumes you are integrating type-safe DI/routes into an Angular app that consumes `@craft-ng/core`.',
    );
    expect(content).toContain(
      'type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;',
    );
    expect(content).toContain('type _CanRunApp = CanRun<_CheckAppDI>;');
    expect(content).toContain(
      "componentDeps: {} as import('./test').GenDeps_TestComponent,",
    );
    expect(content).toContain('routingDeps: appRoutes.META_DATA');
    expect(content).toContain('provideRouter(appRoutes.toRoutes()');
  });

  it('documents the codemod script and the refresh workflow', () => {
    expect(content).toContain(
      '## 3. Run the Angular brand codemod through the published script',
    );
    expect(content).toContain('craft-brand --root src/app');
    expect(content).toContain(
      'trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-gen-deps-required`',
    );
    expect(content).toContain(
      'trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-deps-match`',
    );
  });

  it('points at the dedicated ESLint rules page', () => {
    expect(content).toContain('](/guide/routing/eslint-rules)');
  });
});

describe('ESLint rules doc page', () => {
  const content = readFileSync(
    new URL('../guide/routing/eslint-rules.md', import.meta.url),
    'utf8',
  );

  it('documents the plugin entry point and the enforced rules', () => {
    expect(content).toContain('@craft-ng/dev-tools/eslint-rules');
    expect(content).toContain(
      "'craft-ng/brand-angular-gen-deps-required': 'error'",
    );
    expect(content).toContain("'craft-ng/brand-angular-deps-match': 'error'");
    expect(content).toContain("'craft-ng/no-angular-inject': 'error'");
    expect(content).toContain("'craft-ng/prefer-craft-service': 'error'");
    expect(content).toContain("'craft-ng/prefer-craft-http-client': 'error'");
    expect(content).toContain(
      "'craft-ng/require-cascade-route-di-check': 'error'",
    );
    expect(content).toContain(
      'generate missing aliases and refresh existing ones',
    );
  });
});

describe('Browser Boundaries doc page', () => {
  const content = readFileSync(
    new URL('../guide/testing/browser-boundaries.md', import.meta.url),
    'utf8',
  );

  it('documents the implemented browser boundary surface', () => {
    expect(content).toContain('# Browser boundaries');
    expect(content).not.toContain('Upcoming / draft API');
    expect(content).toContain(
      'Every boundary on this page is backed by a global crafted service marked with `browserBoundary: true`.',
    );
    expect(content).toContain('ConsoleService');
    expect(content).toContain(
      'That second form is what preserves derivability',
    );
  });

  it('documents the yield-based browser DSL examples', () => {
    expect(content).toContain("yield * Console.log('my service run');");
    expect(content).toContain("yield * LocalStorage.setItem('token', token);");
    expect(content).toContain(
      "const persistedToken = yield * LocalStorage.getItem('token');",
    );
    expect(content).toContain('const href = yield * BrowserLocation.href();');
    expect(content).toContain(
      "yield * BrowserHistory.replaceState({ step: 2 }, '', '/checkout?step=2');",
    );
    expect(content).toContain(
      "yield * BrowserWindow.alert('Cache cleared! The page will reload.');",
    );
    expect(content).toContain('const confirmed =');
    expect(content).toContain('yield * BrowserWindow.confirm(');
    expect(content).toContain('if (confirmed) {');
    expect(content).toContain('- `confirm`');
  });

  it('documents HttpClient as an implemented related adapter rather than a browser boundary', () => {
    expect(content).toContain('## Related Adapter: `CraftHttpClient`');
    expect(content).toContain(
      '`CraftHttpClient` is implemented, but it is not a browser boundary.',
    );
    expect(content).toContain('it is not treated as `browserBoundary: true`');
    expect(content).toContain(
      'it requires `success: response<T>()` inside a declarative builder',
    );
    expect(content).toContain(
      'it can declare ordered `exceptions: [function* (...) { ... }]` rules',
    );
    expect(content).toContain(
      "it returns a promise of `Success | craftException({ code: 'HttpError' })`",
    );
    expect(content).toContain('const getUsers =');
    expect(content).toContain('CraftHttpClient.get(({ response }) => ({');
    expect(content).toContain('exceptions: [');
    expect(content).toContain(
      "if (!(yield* code('PASSWORD_REQUIRED'))) return;",
    );
  });

  it('links back to craftService and toCraftService', () => {
    expect(content).toContain('[`craftService`](/guide/app/craft-service)');
    expect(content).toContain(
      '[`toCraftService`](/guide/app/integrate-existing)',
    );
  });
});

describe('craftMethod doc page', () => {
  const content = readFileSync(
    new URL('../guide/reactivity/craft-method.md', import.meta.url),
    'utf8',
  );

  it('documents both overloads and the captured injection context', () => {
    expect(content).toContain('# craftMethod');
    expect(content).toContain(
      'The method runs inside the injection context captured when `craftMethod(...)` is created.',
    );
    expect(content).toContain(
      'function craftMethod<Name extends string, This, Args extends unknown[], Result>(',
    );
    expect(content).toContain(
      'factory: (this: This, ...args: Args) => Generator<unknown, Result, unknown>,',
    );
    expect(content).toContain('name: Name,');
    expect(content).toContain('self: This,');
  });

  it('documents Browser Boundaries and crafted service composition examples', () => {
    expect(content).toContain(
      "readonly increment = craftMethod('increment', this, function* (step = 1) {",
    );
    expect(content).toContain("yield* Console.log('increment is called');");
    expect(content).toContain('function* (this: CounterComponent, step = 1) {');
    expect(content).toContain('this: CounterComponent,');
    expect(content).toContain('return yield* CounterWorker.set(value);');
    expect(content).toContain('[`craftService`](/guide/app/craft-service)');
  });

  it('documents the receiver caveat and onAppStart restriction', () => {
    expect(content).toContain(
      '`craftMethod(name, fn)` depends on the receiver used at call time.',
    );
    expect(content).toContain(
      '`craftMethod(name, this, fn)` is the recommended form whenever the generator reads or writes `this`.',
    );
    expect(content).toContain(
      '`onAppStart(...)` is not supported inside `craftMethod`.',
    );
    expect(content).toContain(
      '[`Browser Boundaries`](/guide/testing/browser-boundaries)',
    );
  });
});

describe('craftComputed doc page', () => {
  const content = readFileSync(
    new URL('../guide/reactivity/craft-computed.md', import.meta.url),
    'utf8',
  );

  it('documents plain and generator-based computed forms', () => {
    expect(content).toContain('# craftComputed');
    expect(content).toContain(
      "import { craftComputed } from '@craft-ng/core';",
    );
    expect(content).toContain(
      'plain computation: `craftComputed(name, () => value)`',
    );
    expect(content).toContain(
      'generator factory: `craftComputed(name, function* () { ...; return value; })`',
    );
    expect(content).toContain(
      'function craftComputed<Name extends string, T>(',
    );
    expect(content).toContain('options?: CreateComputedOptions<T>,');
  });

  it('documents yield usage, dependency tracking and onAppStart restriction', () => {
    expect(content).toContain('const multiplier = yield* Multiplier();');
    expect(content).toContain(
      '`onAppStart(...)` is not supported inside `craftComputed(...)`.',
    );
    expect(content).toContain(
      'yielded dependencies are tracked and can be extracted with `ExtractDeps<...>`.',
    );
    expect(content).toContain('[`craftService`](/guide/app/craft-service)');
  });
});

describe('toCraftService doc page', () => {
  const content = readFileSync(
    new URL('../guide/app/integrate-existing.md', import.meta.url),
    'utf8',
  );

  it('includes an HttpClient adaptation example', () => {
    expect(content).toContain('## `HttpClient` Example');
    expect(content).toContain(
      "import { HttpClient } from '@angular/common/http';",
    );
    expect(content).toContain("name: 'HttpClient'");
    expect(content).toContain('const { HttpClient } = toCraftService({');
    expect(content).toContain(
      'const http = yield* HttpClient(undefined, ({ get, post }) => ({',
    );
    expect(content).toContain(
      "listUsers: () => http.get<User[]>('/api/users'),",
    );
    expect(content).toContain("http.post<User>('/api/users', payload)");
  });
});

describe('craftService doc page', () => {
  const content = readFileSync(
    new URL('../guide/app/craft-service.md', import.meta.url),
    'utf8',
  );

  it('documents app-start hooks and generator callbacks', () => {
    expect(content).toContain('## Startup work');
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
    new URL('../guide/routing/angular-brand-config.md', import.meta.url),
    'utf8',
  );

  it('documents the project config entrypoint and the main rule shape', () => {
    expect(content).toContain('# Angular brand config');
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
    expect(content).toContain(
      '[`toCraftService`](/guide/app/integrate-existing)',
    );
    expect(content).toContain(
      '[`Browser Boundaries`](/guide/testing/browser-boundaries)',
    );
  });
});

describe('architecture rules doc page', () => {
  const content = readFileSync(
    new URL('../guide/testing/architecture.md', import.meta.url),
    'utf8',
  );

  it('documents the declarative baseline helpers and the demo Nx target', () => {
    expect(content).toContain('# Architecture rules');
    expect(content).toContain('assertCraftUnique');
    expect(content).toContain('assertHttpEndpointUnique');
    expect(content).toContain('assertCraftComputedPure');
    expect(content).toContain('assertNoDependencyCycles');
    expect(content).toContain('assertDeclarativeArchitecture');
    expect(content).toContain('assertRouteDiProofs');
    expect(content).toContain('RouteExceptionComponentCheckedDI');
    expect(content).toContain('provideCraftGlobalErrorComponent');
    expect(content).toContain(
      'TypeScript still judges whether a dependency is provided',
    );
    expect(content).toContain('assertPathBoundaries');
    expect(content).toContain('npx nx architecture demo');
    expect(content).toContain('craft-migrate-architecture');
    expect(content).toContain('depends-on');
    expect(content).toContain('/guide/testing/craft-graph-vs-nx');
  });
});

describe('craft graph vs Nx doc page', () => {
  const content = readFileSync(
    new URL('../guide/testing/craft-graph-vs-nx.md', import.meta.url),
    'utf8',
  );

  it('states what each graph cannot see and how they complement', () => {
    expect(content).toContain('# Craft graph vs Nx');
    expect(content).toContain('What Nx cannot see');
    expect(content).toContain('What Craft cannot see');
    expect(content).toContain('How they complement');
    expect(content).toContain('@nx/enforce-module-boundaries');
    expect(content).toContain('assertHttpEndpointUnique');
    expect(content).toContain('assertPathBoundaries');
    expect(content).toContain('nx affected');
    expect(content).toContain('/guide/testing/architecture');
  });
});
