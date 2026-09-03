import docsConfig from '../.vitepress/config.mts';
import { readDoc } from './read-doc';

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
      '/learn-effect/',
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
    expect(guideLinks).toContain('/guide/components/accessibility');
    expect(guideLinks).toContain('/guide/reactivity/craft-method');
    expect(guideLinks).toContain('/guide/reactivity/craft-computed');
    expect(guideLinks).toContain('/guide/reactivity/craft-effect');
    expect(guideLinks).toContain('/guide/advanced/observability');
    expect(guideLinks).toContain('/guide/ai/dev-page');
  });

  it('exposes the five top-level nav entries', () => {
    const nav = docsConfig.themeConfig?.nav as Array<{ text?: string }>;

    expect(nav.map((entry) => entry.text)).toEqual([
      'Learn',
      'Learn with Effect',
      'Guide',
      'Reference',
      'Packages',
      'Resources',
    ]);
  });
});

describe('forms overview', () => {
  const content = readDoc('../guide/forms/index.md');
  const exceptions = readDoc('../guide/forms/exceptions.md');

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
    expect(exceptions).toContain('fieldErrorNode.partial');
    expect(exceptions).toContain('fieldErrorNode.exhaustive');
    expect(exceptions).toContain(
      'loadCraftComponent(async () => BaseRegistrationForm)',
    );
  });
});

describe('fine-grained reactivity docs', () => {
  const home = readDoc('../index.md');
  const guide = readDoc('../guide/components/fine-grained-reactivity.md');

  it('presents the feature on the home page and documents its contract', () => {
    expect(home).toContain('Fine-grained reactivity');
    expect(home).toContain('/guide/components/fine-grained-reactivity');
    expect(guide).toContain('# Fine-grained reactivity');
    expect(guide).toContain('The binding is the reactive boundary');
    expect(guide).toContain('require-reactive-template-bindings');
    expect(guide).toContain('component / update');
  });

  it('closes the home page with a note from the author', () => {
    expect(home.trimEnd().endsWith('<AuthorNote />')).toBe(true);
  });
});

describe('craftGen doc page', () => {
  const content = readDoc('../guide/concepts/generators.md');

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
  const content = readDoc('../guide/app/app-start.md');

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
  const content = readDoc('../guide/routing/setup.md');

  it('documents the app-level DI check and crafted routes setup', () => {
    expect(content).toContain('# Routing setup');
    expect(content).toContain(
      'This guide assumes an app that consumes `@craft-ts/core`.',
    );
    expect(content).toContain(
      'type _CheckAppDI = RouteCheckedDI<',
    );
    expect(content).toContain('type _CanRunApp = CanRun<_CheckAppDI>;');
    expect(content).toContain(
      "componentDeps: {} as import('./test').GenDeps_TestComponent,",
    );
    expect(content).toContain('routingDeps: appRoutes.META_DATA');
    expect(content).toContain('provideCraftRouter(appRoutes.toRoutes()');
  });

  it('documents the codemod script and the refresh workflow', () => {
    expect(content).toContain(
      '## 3. Generate dependency metadata',
    );
    expect(content).toContain('craft-brand --root src');
    expect(content).toContain('run the dependency generator for the relevant source root');
  });

  it('points at the dedicated ESLint rules page', () => {
    expect(content).toContain('](/guide/routing/eslint-rules)');
  });
});

describe('ESLint rules doc page', () => {
  const content = readDoc('../guide/routing/eslint-rules.md');

  it('documents the plugin entry point and the enforced rules', () => {
    expect(content).toContain('@craft-ts/dev-tools/eslint-rules');
    expect(content).toContain(
      "'craft-ts/require-pending-component-di-check': 'error'",
    );
    expect(content).toContain('Three rules do more than complain');
  });
});

describe('Browser Boundaries doc page', () => {
  const content = readDoc('../guide/testing/browser-boundaries.md');

  it('documents the implemented browser boundary surface', () => {
    expect(content).toContain('# Browser boundaries');
    expect(content).not.toContain('Upcoming / draft API');
    expect(content).toContain(
      'Every boundary on this page is backed by a global crafted service marked with `browserBoundary: true`.',
    );
    expect(content).toContain('ConsoleService');
    expect(content).toContain('- `setLang`');
    expect(content).toContain('- `setDir`');
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
      "it returns a promise of `Success | craftException({ _tag: 'HttpError' })`",
    );
    expect(content).toContain('const getUsers =');
    expect(content).toContain('CraftHttpClient.get(({ response }) => ({');
    expect(content).toContain('exceptions: [');
    expect(content).toContain(
      "if (!(yield* code('PASSWORD_REQUIRED'))) return;",
    );
  });

  it('links back to craftService', () => {
    expect(content).toContain('[`craftService`](/guide/app/craft-service)');
  });
});

describe('craftMethod doc page', () => {
  const content = readDoc('../guide/reactivity/craft-method.md');

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
    expect(content).toContain('function* (this: Counter, step = 1) {');
    expect(content).toContain('this: Counter,');
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
  const content = readDoc('../guide/reactivity/craft-computed.md');

  it('documents plain and generator-based computed forms', () => {
    expect(content).toContain('# craftComputed');
    expect(content).toContain(
      "import { craftComputed } from '@craft-ts/core';",
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

describe('craftService doc page', () => {
  const content = readDoc('../guide/app/craft-service.md');

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

describe('architecture rules doc page', () => {
  const content = readDoc('../guide/testing/architecture.md');

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
    expect(content).toContain('assertMutationHasReactOn');
    expect(content).toContain('assertPersistedPrimitiveHasUnique');
    expect(content).toContain('assertInsertSelectUnique');
    expect(content).toContain('assertCraftEffectNoNetwork');
    expect(content).toContain('assertCraftEffectNoImperativeSync');
    expect(content).toContain('assertInteractiveElementNamed');
    expect(content).toContain('npx nx architecture demo');
    expect(content).toContain('craft-migrate-architecture');
    expect(content).toContain('depends-on');
    expect(content).toContain('/guide/testing/craft-graph-vs-nx');
  });
});

describe('craft graph vs Nx doc page', () => {
  const content = readDoc('../guide/testing/craft-graph-vs-nx.md');

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
