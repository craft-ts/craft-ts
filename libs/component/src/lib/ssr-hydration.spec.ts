// @vitest-environment jsdom
import {
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
  each,
  hydrateCraft,
  p,
  ifBlock,
  li,
  loadCraftComponent,
  pendingBlock,
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
    const counter = craftComponent(
      'SsrCounter',
      { styles: ':scope { color: rebeccapurple; }' },
      function* (initial: Input<number>) {
        const count = yield* state('count', yield* initial(), ({ update }) => ({
          increment: () => update((value) => value + 1),
        }));
        return { count };
      },
      ({ count }) =>
        div([
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
        ]),
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
    let loads = 0;
    const app = craftComponent(
      'SsrQueryApp',
      {},
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
      ({ firstName }) =>
        div([
          span({ class: 'name' }, firstName),
          button({ class: 'action', click: () => undefined }, 'action'),
        ]).pipe(
          pendingBlock({
            ssr: 'block',
            fallback: () => p('loading'),
          }),
        ),
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
    const app = craftComponent(
      'AutoStartApp',
      {},
      function* () {
        return {};
      },
      () => p('ready'),
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
    const never = () => new Promise<string>(() => undefined);
    const withPolicy = craftComponent(
      'SsrFallback',
      {},
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
      ({ text }) =>
        div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(
          pendingBlock({ ssr: 'fallback', fallback: () => p('skeleton') }),
        ),
    );
    const fallback = await renderCraft({
      config: configFor(withPolicy),
      timeoutMs: 20,
    });
    expect(fallback.rootHtml).toContain('skeleton');

    const withoutPolicy = craftComponent(
      'SsrUndeclared',
      {},
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
      ({ text }) =>
        div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingBlock({ fallback: () => p('waiting') })),
    );
    await expect(
      renderCraft({ config: configFor(withoutPolicy), timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(CraftUnhandledSsrResolutionError);
  });

  it('times out blocking sources and propagates request cancellation', async () => {
    const app = craftComponent(
      'SsrNeverSettles',
      {},
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
      ({ text }) =>
        div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingBlock({ fallback: () => p('waiting') })),
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
    let routeLoads = 0;
    const routeDefault = craftComponent(
      'RoutePolicyDefault',
      {},
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
      ({ text }) =>
        div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(pendingBlock({ fallback: () => p('route shell') })),
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

    let clientLoads = 0;
    const localClient = craftComponent(
      'LocalClientPolicy',
      {},
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
      ({ text }) =>
        div(
          span(function* () {
            return String(yield* text());
          }),
        ).pipe(
          pendingBlock({ ssr: 'client', fallback: () => p('client shell') }),
        ),
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
    let queryLoads = 0;
    const page = craftComponent(
      'LazySsrPage',
      {},
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
      ({ text }) =>
        p({ class: 'lazy-page' }, function* () {
          return String(yield* text());
        }).pipe(pendingBlock({ fallback: () => p('lazy pending') })),
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
    const page = craftComponent(
      'HydratedLazyPage',
      {},
      () => ({}),
      () => p({ class: 'hydrated-lazy-page' }, 'hydrated lazy route'),
    );
    const nextPage = craftComponent(
      'HydratedNextPage',
      {},
      () => ({}),
      () => p({ class: 'hydrated-next-page' }, 'next lazy route'),
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
    const page = craftComponent(
      'UndeclaredRoutePage',
      {},
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
      ({ text }) =>
        p(function* () {
          return String(yield* text());
        }).pipe(pendingBlock({ fallback: () => p('pending') })),
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
    const app = craftComponent(
      'MismatchApp',
      {},
      () => ({}),
      () =>
        div([
          p({ class: 'replace-me' }, 'server value'),
          button({ class: 'keep-me' }, 'keep'),
        ]),
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
    const show = markYieldableValue(craftSignal(true), 'show');
    const app = craftComponent(
      'StructuralApp',
      {},
      () => ({}),
      () =>
        div([
          ul(
            each(items, { track: (item) => item }, (item) =>
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
          ifBlock(
            show,
            () => div({ class: 'true-branch' }, 'yes'),
            () => span({ class: 'false-branch' }, 'no'),
          ),
          button({ class: 'structural-sibling' }, 'stable'),
        ]),
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
    const app = craftComponent(
      'IsolatedApp',
      {},
      function* (initial: Input<number>) {
        const value = yield* state('requestValue', yield* initial());
        return { value };
      },
      ({ value }) =>
        p(function* () {
          return String(yield* value());
        }),
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
