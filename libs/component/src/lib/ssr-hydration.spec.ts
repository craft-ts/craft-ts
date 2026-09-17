// @vitest-environment jsdom
import {
  craftService,
  CraftSsrTimeoutError,
  CraftUnhandledSsrResolutionError,
  CRAFT_SSR_POLICY,
  CRAFT_ROUTER,
  craftComputed,
  craftRoutes,
  provideCraftRouter,
  craftSignal,
  markYieldableValue,
  query,
  settled,
  state,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  button,
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
  renderCraft,
  startCraft,
  span,
  ul,
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
      function* (inputs: { readonly initial: Input<number> }) {
        const { initial } = inputs;

        const count = yield* state('count', yield* initial(), ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return { count };
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
        const users = yield* query('users', {
          params: () => true,
          loader: async () => {
            loads += 1;
            await Promise.resolve();
            return [{ id: '42', name: 'Ada' }];
          },
        });
        const firstName = craftComputed('firstName', function* () {
          return (yield* settled(users))[0].name;
        });
        return { firstName };
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
        return {};
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
        const value = yield* query('slow', {
          params: () => true,
          loader: never,
        });
        const text = craftComputed('slowText', function* () {
          return yield* settled(value);
        });
        return { text };
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
        const value = yield* query('undeclared', {
          params: () => true,
          loader: never,
        });
        const text = craftComputed('undeclaredText', function* () {
          return yield* settled(value);
        });
        return { text };
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
        const value = yield* query('neverSettles', {
          params: () => true,
          loader: () => new Promise<string>(() => undefined),
        });
        const text = craftComputed('neverText', function* () {
          return yield* settled(value);
        });
        return { text };
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
        {
          provide: CRAFT_SSR_POLICY,
          useValue: { mode: 'block' as const, timeoutMs: 5 },
        },
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
          const value = yield* query('routeValue', {
            params: () => true,
            loader: async () => {
              routeLoads += 1;
              return 'route ready';
            },
          });
          const text = craftComputed('routeText', function* () {
            return yield* settled(value);
          });
          return { text };
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
          { provide: CRAFT_SSR_POLICY, useValue: { mode: 'block' } },
        ],
      },
    });
    expect(routeResult.rootHtml).toContain('route ready');
    expect(routeLoads).toBe(1);

    const { LocalClientPolicyView, provideLocalClientPolicyView } =
      craftService(
        { name: 'localClientPolicyView', providedIn: 'toProvide' },
        function* () {
          const value = yield* query('clientValue', {
            params: () => true,
            loader: async () => {
              clientLoads += 1;
              return 'must not render';
            },
          });
          const text = craftComputed('clientText', function* () {
            return yield* settled(value);
          });
          return { text };
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
          { provide: CRAFT_SSR_POLICY, useValue: { mode: 'block' } },
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
        const value = yield* query('lazyRouteValue', {
          params: () => true,
          loader: async () => {
            queryLoads += 1;
            return 'lazy route ready';
          },
        });
        const text = craftComputed('lazyRouteText', function* () {
          return yield* settled(value);
        });
        return { text };
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
      () => ({}),
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
      () => ({}),
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

    const router = hydrated.injector.get(CRAFT_ROUTER);
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
          const value = yield* query('routeWithoutPolicy', {
            params: () => true,
            loader: () => new Promise<string>(() => undefined),
          });
          const text = craftComputed('routeWithoutPolicyText', function* () {
            return yield* settled(value);
          });
          return { text };
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

  it('remounts only a mismatched subtree and keeps a sibling node', async () => {
    const { MismatchAppView, provideMismatchAppView } = craftService(
      { name: 'mismatchAppView', providedIn: 'toProvide' },
      () => ({}),
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
      () => ({}),
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
      function* (inputs: { readonly initial: Input<number> }) {
        const { initial } = inputs;

        const value = yield* state('requestValue', yield* initial());
        return { value };
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
