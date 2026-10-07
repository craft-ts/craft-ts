// @vitest-environment jsdom
import {
  craftExpose,
  craftService,
  CraftSsrTimeoutError,
  CraftUnhandledSsrResolutionError,
  provideCraftSsrPolicy,
  ɵinjectCraftRouterRuntime,
  craftComputed,
  craftRoutes,
  provideCraftRouter,
  craftSignal,
  markYieldableValue,
  query,
  settled,
  state,
  craftPrivate, type CraftServiceInput } from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  button,
  content,
  CraftRouterOutlet,
  craftComponent,
  div,
  forNode,
  hydrateCraft,
  p,
  ifNode,
  li,
  loadCraftComponent,
  pendingNode,
  provideCraftRootComponent,
  renderContent,
  renderCraft,
  startCraft,
  span,
  ul,
  type ContentSlot,
  type CraftComponent,
  type Input,
} from '../index';

function configFor(component: CraftComponent<any>) {
  return { providers: [provideCraftRootComponent(component)] };
}

describe('Craft SSR and hydration', () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it('renders deterministic HTML, CSS and a serializable state snapshot', async () => {
    const { SsrCounterView, provideSsrCounterView } = craftService(
      { name: 'ssrCounterView', providedIn: 'toProvide' },
      function* (inputs: { readonly initial: CraftServiceInput<number> }) {
        const { initial } = inputs;

        yield* state('count', yield* initial(), ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
      },
    );

    const counter = craftComponent(
      'SsrCounter',
      {
        providers: [provideSsrCounterView()],
        styles: ':scope { color: rebeccapurple; }',
      },
      function* (inputs: { readonly initial: Input<number> }) {
        const { count } = yield* SsrCounterView(inputs);
        return div([
          p({ class: 'value' }, function* () {
            return String(yield* count());
          }),
          button(
            {
              click: function* () {
                yield* count.increment();
              },
            },
            '+',
          ),
        ]);
      },
    );
    const config = configFor(counter);

    // Le transfert est fermé par défaut : ces rendus déclarent la politique
    // de migration, qui transfère tout ce qui est sérialisable.
    const legacyTransfer = { transfer: { mode: 'legacy' } } as const;
    const first = await renderCraft({
      config,
      props: { initial: 42 },
      securityPolicy: legacyTransfer,
    });
    const second = await renderCraft({
      config,
      props: { initial: 42 },
      securityPolicy: legacyTransfer,
    });

    expect(first.html).toBe(second.html);
    expect(first.rootHtml).toContain(
      '<craft-root data-craft-hk="SsrCounter/0">',
    );
    expect(first.rootHtml).toContain('data-craft-hk="SsrCounter/0/0"');
    expect(first.rootHtml).toContain('>42<');
    expect(first.styles).toContain('color: rebeccapurple');
    expect(Object.values(first.snapshot.values)).toContain(42);
    expect(first.html).not.toContain('</script><script');
  });

  it('blocks for a declared query, transfers it, reuses DOM and avoids a client reload', async () => {
    const { SsrQueryAppView, provideSsrQueryAppView } = craftService(
      { name: 'ssrQueryAppView', providedIn: 'toProvide' },
      function* () {
        const users = yield* craftPrivate(query('users', {
          params: () => true,
          loader: async () => {
            loads += 1;
            await Promise.resolve();
            return [{ id: '42', name: 'Ada' }];
          },
        }));
        yield* craftComputed('firstName', function* () {
          return (yield* settled(users))[0].name;
        });
      },
    );

    let loads = 0;
    const app = craftComponent(
      'SsrQueryApp',
      { providers: [provideSsrQueryAppView()] },
      function* () {
        const { firstName } = yield* SsrQueryAppView();
        return div([
          span({ class: 'name' }, firstName),
          button({ class: 'action', click: () => undefined }, 'action'),
        ]).pipe(
          pendingNode({
            ssr: 'block',
            fallback: () => p('loading'),
          }),
        );
      },
    );
    const config = configFor(app);
    const rendered = await renderCraft({
      config,
      securityPolicy: { transfer: { mode: 'legacy' } },
    });

    expect(rendered.rootHtml).toContain('Ada');
    expect(rendered.rootHtml).not.toContain('loading');
    expect(Object.values(rendered.snapshot.queries)).toContainEqual(
      expect.objectContaining({ status: 'resolved' }),
    );
    expect(loads).toBe(1);

    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const nameBefore = host.querySelector('.name');
    const buttonBefore = host.querySelector('.action');
    const hydrated = hydrateCraft({ config, host });
    await Promise.resolve();

    expect(host.querySelector('.name')).toBe(nameBefore);
    expect(host.querySelector('.action')).toBe(buttonBefore);
    expect(host.querySelectorAll('.name')).toHaveLength(1);
    expect(host.textContent).toContain('Ada');
    expect(loads).toBe(1);
    expect(hydrated.mismatches).toEqual([]);
    hydrated.destroy();
  });

  it('automatically hydrates an SSR host and bootstraps a plain host', async () => {
    const { AutoStartAppView, provideAutoStartAppView } = craftService(
      { name: 'autoStartAppView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const app = craftComponent(
      'AutoStartApp',
      { providers: [provideAutoStartAppView()] },
      function* () {
        yield* AutoStartAppView();
        return p('ready');
      },
    );
    const config = configFor(app);
    const rendered = await renderCraft({ config });

    document.body.innerHTML = rendered.html;
    const ssrHost = document.querySelector('craft-root')!;
    const hydrated = startCraft({ config });

    expect(hydrated).toHaveProperty('mismatches');
    expect(ssrHost.textContent).toBe('ready');
    hydrated.destroy();

    document.body.replaceChildren();
    const plainHost = document.createElement('craft-root');
    document.body.append(plainHost);
    const bootstrapped = startCraft({ config, host: plainHost });

    expect(plainHost.textContent).toBe('ready');
    expect(bootstrapped).not.toHaveProperty('mismatches');
    bootstrapped.destroy();
  });

  it('renders a fallback without waiting and rejects an undeclared server policy', async () => {
    const { SsrFallbackView, provideSsrFallbackView } = craftService(
      { name: 'ssrFallbackView', providedIn: 'toProvide' },
      function* () {
        const value = yield* craftPrivate(query('slow', {
          params: () => true,
          loader: never,
        }));
        yield* craftComputed('text', function* () {
          return yield* settled(value);
        });
      },
    );

    const never = () => new Promise<string>(() => undefined);
    const withPolicy = craftComponent(
      'SsrFallback',
      { providers: [provideSsrFallbackView()] },
      function* () {
        const { text } = yield* SsrFallbackView();
        return div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingNode({ ssr: 'fallback', fallback: () => p('skeleton') }));
      },
    );
    const fallback = await renderCraft({
      config: configFor(withPolicy),
      timeoutMs: 20,
    });
    expect(fallback.rootHtml).toContain('skeleton');

    const { SsrUndeclaredView, provideSsrUndeclaredView } = craftService(
      { name: 'ssrUndeclaredView', providedIn: 'toProvide' },
      function* () {
        const value = yield* craftPrivate(query('undeclared', {
          params: () => true,
          loader: never,
        }));
        yield* craftComputed('text', function* () {
          return yield* settled(value);
        });
      },
    );

    const withoutPolicy = craftComponent(
      'SsrUndeclared',
      { providers: [provideSsrUndeclaredView()] },
      function* () {
        const { text } = yield* SsrUndeclaredView();
        return div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingNode({ fallback: () => p('waiting') }));
      },
    );
    await expect(
      renderCraft({ config: configFor(withoutPolicy), timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(CraftUnhandledSsrResolutionError);
  });

  it('times out blocking sources and propagates request cancellation', async () => {
    const { SsrNeverSettlesView, provideSsrNeverSettlesView } = craftService(
      { name: 'ssrNeverSettlesView', providedIn: 'toProvide' },
      function* () {
        const value = yield* craftPrivate(query('neverSettles', {
          params: () => true,
          loader: () => new Promise<string>(() => undefined),
        }));
        yield* craftComputed('text', function* () {
          return yield* settled(value);
        });
      },
    );

    const app = craftComponent(
      'SsrNeverSettles',
      { providers: [provideSsrNeverSettlesView()] },
      function* () {
        const { text } = yield* SsrNeverSettlesView();
        return div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingNode({ fallback: () => p('waiting') }));
      },
    );
    const config = {
      providers: [
        provideCraftRootComponent(app),
        provideCraftSsrPolicy({ mode: 'block', timeoutMs: 5 }),
      ],
    };

    await expect(
      renderCraft({ config, timeoutMs: 1_000 }),
    ).rejects.toMatchObject({
      name: CraftSsrTimeoutError.name,
      timeoutMs: 5,
      sources: ['neverSettles'],
    });

    const controller = new AbortController();
    const reason = new Error('request disconnected');
    controller.abort(reason);
    await expect(
      renderCraft({ config, timeoutMs: 1_000, signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it('uses the route policy by default, lets a local block override it, and skips client queries', async () => {
    const { RoutePolicyDefaultView, provideRoutePolicyDefaultView } =
      craftService(
        { name: 'routePolicyDefaultView', providedIn: 'toProvide' },
        function* () {
          const value = yield* craftPrivate(query('routeValue', {
            params: () => true,
            loader: async () => {
              routeLoads += 1;
              return 'route ready';
            },
          }));
          yield* craftComputed('text', function* () {
            return yield* settled(value);
          });
        },
      );

    let routeLoads = 0;
    const routeDefault = craftComponent(
      'RoutePolicyDefault',
      { providers: [provideRoutePolicyDefaultView()] },
      function* () {
        const { text } = yield* RoutePolicyDefaultView();
        return div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingNode({ fallback: () => p('route shell') }));
      },
    );
    const routeResult = await renderCraft({
      config: {
        providers: [
          provideCraftRootComponent(routeDefault),
          provideCraftSsrPolicy({ mode: 'block' }),
        ],
      },
    });
    expect(routeResult.rootHtml).toContain('route ready');
    expect(routeLoads).toBe(1);

    const { LocalClientPolicyView, provideLocalClientPolicyView } =
      craftService(
        { name: 'localClientPolicyView', providedIn: 'toProvide' },
        function* () {
          const value = yield* craftPrivate(query('clientValue', {
            params: () => true,
            loader: async () => {
              clientLoads += 1;
              return 'must not render';
            },
          }));
          yield* craftComputed('text', function* () {
            return yield* settled(value);
          });
        },
      );

    let clientLoads = 0;
    const localClient = craftComponent(
      'LocalClientPolicy',
      { providers: [provideLocalClientPolicyView()] },
      function* () {
        const { text } = yield* LocalClientPolicyView();
        return div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(
          pendingNode({ ssr: 'client', fallback: () => p('client shell') }),
        );
      },
    );
    const clientResult = await renderCraft({
      config: {
        providers: [
          provideCraftRootComponent(localClient),
          provideCraftSsrPolicy({ mode: 'block' }),
        ],
      },
    });
    expect(clientResult.rootHtml).toContain('client shell');
    expect(clientLoads).toBe(0);
  });

  it('waits for the initial lazy route before serializing its HTML', async () => {
    let lazyLoads = 0;
    const { LazySsrPageView, provideLazySsrPageView } = craftService(
      { name: 'lazySsrPageView', providedIn: 'toProvide' },
      function* () {
        const value = yield* craftPrivate(query('lazyRouteValue', {
          params: () => true,
          loader: async () => {
            queryLoads += 1;
            return 'lazy route ready';
          },
        }));
        yield* craftComputed('text', function* () {
          return yield* settled(value);
        });
      },
    );

    let queryLoads = 0;
    const page = craftComponent(
      'LazySsrPage',
      { providers: [provideLazySsrPageView()] },
      function* () {
        const { text } = yield* LazySsrPageView();
        return p({ class: 'lazy-page' }, function* () {
          return String(yield* text());
        }).pipe(pendingNode({ fallback: () => p('lazy pending') }));
      },
    );
    const { ssrRoutes } = craftRoutes('ssr', [
      {
        path: 'lazy',
        ...loadCraftComponent(async () => {
          lazyLoads += 1;
          await Promise.resolve();
          return page;
        }),
        ssr: { mode: 'block' },
      },
    ]);
    const config = {
      providers: [
        provideCraftRootComponent(CraftRouterOutlet),
        ...provideCraftRouter(ssrRoutes.toRoutes()),
      ],
    };

    const rendered = await renderCraft({
      config,
      url: '/lazy',
      securityPolicy: { transfer: { mode: 'legacy' } },
    });

    expect(rendered.rootHtml).toContain('lazy route ready');
    expect(rendered.rootHtml).toContain('class="lazy-page"');
    expect(lazyLoads).toBe(1);
    expect(queryLoads).toBe(1);
    expect(Object.values(rendered.snapshot.queries)).toContainEqual(
      expect.objectContaining({
        status: 'resolved',
        value: 'lazy route ready',
      }),
    );
  });

  it('keeps SSR DOM and hydration markers until an initial lazy route loads', async () => {
    const { HydratedLazyPageView, provideHydratedLazyPageView } = craftService(
      { name: 'hydratedLazyPageView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const page = craftComponent(
      'HydratedLazyPage',
      { providers: [provideHydratedLazyPageView()] },
      function* () {
        yield* HydratedLazyPageView();
        return p({ class: 'hydrated-lazy-page' }, 'hydrated lazy route');
      },
    );
    const { HydratedNextPageView, provideHydratedNextPageView } = craftService(
      { name: 'hydratedNextPageView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const nextPage = craftComponent(
      'HydratedNextPage',
      { providers: [provideHydratedNextPageView()] },
      function* () {
        yield* HydratedNextPageView();
        return p({ class: 'hydrated-next-page' }, 'next lazy route');
      },
    );
    const createConfig = () => {
      const { hydrationLazyRoutes } = craftRoutes('hydration-lazy', [
        {
          path: 'lazy',
          ...loadCraftComponent(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
            return page;
          }),
        },
        {
          path: 'next',
          ...loadCraftComponent(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
            return nextPage;
          }),
        },
      ]);
      return {
        providers: [
          provideCraftRootComponent(CraftRouterOutlet),
          ...provideCraftRouter(hydrationLazyRoutes.toRoutes()),
        ],
      };
    };

    const rendered = await renderCraft({
      config: createConfig(),
      url: '/lazy',
    });
    window.history.replaceState({}, '', '/lazy');
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const serverPage = host.querySelector('.hydrated-lazy-page');

    const hydrated = hydrateCraft({ config: createConfig(), host });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(host.querySelector('.hydrated-lazy-page')).toBe(serverPage);
    expect(host.textContent).toContain('hydrated lazy route');
    expect(hydrated.mismatches).toEqual([]);

    const router = hydrated.injector.run(() => ɵinjectCraftRouterRuntime());
    if (!router) throw new Error('CraftRouter runtime was not provided');
    await router.navigateByUrl('/next');
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(host.querySelector('.hydrated-next-page')).not.toBeNull();
    expect(host.textContent).toContain('next lazy route');
    hydrated.destroy();
  });

  it('names the active route when its async source has no SSR policy', async () => {
    const { UndeclaredRoutePageView, provideUndeclaredRoutePageView } =
      craftService(
        { name: 'undeclaredRoutePageView', providedIn: 'toProvide' },
        function* () {
          const value = yield* craftPrivate(query('routeWithoutPolicy', {
            params: () => true,
            loader: () => new Promise<string>(() => undefined),
          }));
          yield* craftComputed('text', function* () {
            return yield* settled(value);
          });
        },
      );

    const page = craftComponent(
      'UndeclaredRoutePage',
      { providers: [provideUndeclaredRoutePageView()] },
      function* () {
        const { text } = yield* UndeclaredRoutePageView();
        return p(function* () {
          return String(yield* text());
        }).pipe(pendingNode({ fallback: () => p('pending') }));
      },
    );
    const { missingPolicyRoutes } = craftRoutes('missing-policy', [
      {
        path: 'missing-policy',
        ...loadCraftComponent(async () => page),
      },
    ]);

    await expect(
      renderCraft({
        url: '/missing-policy',
        config: {
          providers: [
            provideCraftRootComponent(CraftRouterOutlet),
            ...provideCraftRouter(missingPolicyRoutes.toRoutes()),
          ],
        },
      }),
    ).rejects.toMatchObject({
      name: 'CraftUnhandledSsrResolutionError',
      source: 'routeWithoutPolicy',
      route: 'missing-policy',
    });
  });

  it('gives projected content keys of its own, so two slots of one declarer never share them', async () => {
    const Box = craftComponent(
      'ProjectionBox',
      {},
      (input: { readonly body: ContentSlot }) =>
        div({ class: 'box' }, renderContent('body', input.body)),
    );
    // One component declares the content of two boxes, and has a paragraph of its
    // own first: all three used to be numbered from the declarer, starting at 0.
    const page = craftComponent('ProjectionPage', {}, () =>
      div([
        p({ class: 'own' }, 'own'),
        Box({ body: content(() => p({ class: 'first' }, 'first slot')) }),
        Box({ body: content(() => p({ class: 'second' }, 'second slot')) }),
      ]),
    );
    const config = configFor(page);
    const rendered = await renderCraft({ config });
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;

    const keys = [...host.querySelectorAll('[data-craft-hk]')].map((node) =>
      node.getAttribute('data-craft-hk'),
    );
    expect(new Set(keys).size).toBe(keys.length);

    const hydrated = hydrateCraft({ config, host });
    expect(hydrated.mismatches).toEqual([]);
    expect(host.textContent).toBe('ownfirst slotsecond slot');
    hydrated.destroy();
  });

  it('hydrates content projected through two components, one inside the other', async () => {
    const Box = craftComponent(
      'NestedBox',
      {},
      (input: { readonly body: ContentSlot }) =>
        div({ class: 'box' }, renderContent('body', input.body)),
    );
    // What a docs page is: a frame that projects the page, whose page projects the
    // body of each callout.
    const Inner = craftComponent('NestedInner', {}, () =>
      div({ class: 'inner' }, [
        p('before'),
        Box({ body: content(() => p({ class: 'deep' }, 'deep slot')) }),
      ]),
    );
    const Frame = craftComponent(
      'NestedFrame',
      {},
      (input: { readonly body: ContentSlot }) =>
        div({ class: 'frame' }, [
          p('chrome'),
          div({ class: 'article' }, renderContent('body', input.body)),
        ]),
    );
    const root = craftComponent('NestedRoot', {}, () =>
      Frame({ body: content(() => Inner({})) }),
    );
    const config = configFor(root);
    const rendered = await renderCraft({ config });
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const before = host.textContent;

    const hydrated = hydrateCraft({ config, host });
    expect(hydrated.mismatches).toEqual([]);
    expect(host.textContent).toBe(before);
    expect(host.textContent).toBe('chromebeforedeep slot');
    hydrated.destroy();
  });

  it('keeps projected content when the component that declares it renders again after hydration', async () => {
    const { RerenderView, provideRerenderView } = craftService(
      { name: 'rerenderView', providedIn: 'toProvide' },
      function* () {
        const ticks = yield* state('ticks', 0, ({ update }) => ({
          tick: () => update((value) => value + 1),
        }));
        yield* craftExpose('tick', ticks.tick);
      },
    );
    const Frame = craftComponent(
      'RerenderFrame',
      {},
      (input: { readonly body: ContentSlot }) =>
        div({ class: 'frame' }, renderContent('body', input.body)),
    );
    const root = craftComponent(
      'RerenderRoot',
      { providers: [provideRerenderView()] },
      function* () {
        const view = yield* RerenderView();
        // Reading the state here makes this template run again when it changes.
        const ticks = yield* view.ticks();
        return div([
          Frame({ body: content(() => p({ class: 'projected' }, `projected ${ticks}`)) }),
          button({ class: 'tick', click: view.tick }, 'tick'),
        ]);
      },
    );
    const config = configFor(root);
    const rendered = await renderCraft({ config });
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;

    const hydrated = hydrateCraft({ config, host });
    expect(hydrated.mismatches).toEqual([]);
    expect(host.querySelector('.projected')?.textContent).toBe('projected 0');

    (host.querySelector('.tick') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.querySelector('.projected')?.textContent).toBe('projected 1');
    hydrated.destroy();
  });

  it('remounts only a mismatched subtree and keeps a sibling node', async () => {
    const { MismatchAppView, provideMismatchAppView } = craftService(
      { name: 'mismatchAppView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const app = craftComponent(
      'MismatchApp',
      { providers: [provideMismatchAppView()] },
      function* () {
        yield* MismatchAppView();
        return div([
          p({ class: 'replace-me' }, 'server value'),
          button({ class: 'keep-me' }, 'keep'),
        ]);
      },
    );
    const config = configFor(app);
    const rendered = await renderCraft({ config });
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const expected = host.querySelector('.replace-me')!;
    const replacement = document.createElement('em');
    for (const attribute of [...expected.attributes]) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    replacement.textContent = expected.textContent;
    expected.replaceWith(replacement);
    const sibling = host.querySelector('.keep-me');

    const hydrated = hydrateCraft({ config, host });

    expect(host.querySelector('.replace-me')?.tagName).toBe('P');
    expect(host.querySelector('.keep-me')).toBe(sibling);
    expect(hydrated.mismatches).toHaveLength(1);
    expect(hydrated.mismatches[0].reason).toBe('tag-mismatch');
    hydrated.destroy();
  });

  it('hydrates keyed each entries and recovers changed keys and conditional branches locally', async () => {
    const items = craftSignal<readonly number[]>([1, 2]);
    const { StructuralAppView, provideStructuralAppView } = craftService(
      { name: 'structuralAppView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const show = markYieldableValue(craftSignal(true), 'show');
    const app = craftComponent(
      'StructuralApp',
      { providers: [provideStructuralAppView()] },
      function* () {
        yield* StructuralAppView();
        return div([
          ul(
            forNode(items, { track: (item) => item }, (item) =>
              li(
                {
                  'data-item': function* () {
                    return String(yield* item());
                  },
                },
                function* () {
                  return String(yield* item());
                },
              ),
            ),
          ),
          ifNode(
            show,
            () => div({ class: 'true-branch' }, 'yes'),
            () => span({ class: 'false-branch' }, 'no'),
          ),
          button({ class: 'structural-sibling' }, 'stable'),
        ]);
      },
    );
    const config = configFor(app);
    const rendered = await renderCraft({ config });
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const firstItem = host.querySelector('[data-item="1"]');
    const sibling = host.querySelector('.structural-sibling');

    items.set([1, 3]);
    show.set(false);
    const hydrated = hydrateCraft({ config, host });

    expect(host.querySelector('[data-item="1"]')).toBe(firstItem);
    expect(host.querySelector('[data-item="2"]')).toBeNull();
    expect(host.querySelector('[data-item="3"]')?.textContent).toBe('3');
    expect(host.querySelector('.true-branch')).toBeNull();
    expect(host.querySelector('.false-branch')?.textContent).toBe('no');
    expect(host.querySelector('.structural-sibling')).toBe(sibling);
    expect(hydrated.mismatches.length).toBeGreaterThan(0);
    hydrated.destroy();
  });

  it('keeps concurrent request state isolated', async () => {
    const { IsolatedAppView, provideIsolatedAppView } = craftService(
      { name: 'isolatedAppView', providedIn: 'toProvide' },
      function* (inputs: { readonly initial: CraftServiceInput<number> }) {
        const { initial } = inputs;

        yield* state('value', yield* initial());
      },
    );

    const app = craftComponent(
      'IsolatedApp',
      { providers: [provideIsolatedAppView()] },
      function* (inputs: { readonly initial: Input<number> }) {
        const { value } = yield* IsolatedAppView(inputs);
        return p(function* () {
          return String(yield* value());
        });
      },
    );
    const config = configFor(app);

    const [one, two] = await Promise.all([
      renderCraft({
        config,
        props: { initial: 1 },
        securityPolicy: { transfer: { mode: 'legacy' } },
      }),
      renderCraft({
        config,
        props: { initial: 2 },
        securityPolicy: { transfer: { mode: 'legacy' } },
      }),
    ]);

    expect(one.rootHtml).toContain('>1<');
    expect(two.rootHtml).toContain('>2<');
    expect(Object.values(one.snapshot.values)).toContain(1);
    expect(Object.values(one.snapshot.values)).not.toContain(2);
    expect(Object.values(two.snapshot.values)).toContain(2);
    expect(Object.values(two.snapshot.values)).not.toContain(1);
  });
});
