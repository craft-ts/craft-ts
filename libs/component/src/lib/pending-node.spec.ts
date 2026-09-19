// @vitest-environment jsdom
import { craftService, craftSignal as signal } from '@craft-ts/core';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  craftComputed,
  craftException,
  query,
  settled,
  state,
  type CraftExceptionResult,
  type CraftSettledSignal,
} from '@craft-ts/core';
import {
  button,
  catchNode,
  craftComponent,
  div,
  p,
  pendingNode,
  section,
  span,
  assertAccessible,
} from '../index';
import { renderCraftComponent } from './testing';
import type {
  CraftNodeChildrenPendingSources,
  CraftNodeChildrenSettledExceptions,
} from './render/vnode';

interface User {
  readonly id: string;
  readonly name: string;
}

describe('pendingNode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the fallback until the source settles, then the subtree', async () => {
    const { PendingRootView, providePendingRootView } = craftService(
      { name: 'pendingRootView', providedIn: 'toProvide' },
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<User[]> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return [{ id: '1', name: 'Ada' }];
          },
        });
        const firstName = craftComputed('firstName', function* () {
          const list = yield* settled(users);
          return list[0].name;
        });
        return { firstName };
      },
    );

    const root = craftComponent(
      'pendingRoot',
      { providers: [providePendingRootView()] },
      function* () {
        const { firstName } = yield* PendingRootView();
        return section([
          div([span(firstName)]).pipe(
            pendingNode({ fallback: () => p('chargement') }),
          ),
        ]);
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);

    expect(element.textContent).toContain('chargement');
    expect(element.textContent).not.toContain('Ada');
    const live = element.querySelector(
      '[aria-live="polite"][aria-busy="true"]',
    );
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.getAttribute('aria-busy')).toBe('true');
    await assertAccessible(element);

    await vi.runAllTimersAsync();
    await flush();

    expect(element.textContent).toContain('Ada');
    expect(element.textContent).not.toContain('chargement');

    destroy();
  });

  it('renders a settledValue bound directly in the template', async () => {
    const { PendingDirectView, providePendingDirectView } = craftService(
      { name: 'pendingDirectView', providedIn: 'toProvide' },
      function* () {
        const label = yield* query('label', {
          params: () => true,
          loader: async (): Promise<{ text: string }> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { text: 'prêt' };
          },
        });
        const text = craftComputed('text', function* () {
          const settledLabel = yield* settled(label);
          return settledLabel.text;
        });
        return { label, text };
      },
    );

    const root = craftComponent(
      'pendingDirect',
      { providers: [providePendingDirectView()] },
      function* () {
        const { text } = yield* PendingDirectView();
        return div([span(text)]).pipe(
          pendingNode({ fallback: () => p('attente') }),
        );
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.textContent).toContain('attente');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('prêt');

    destroy();
  });

  it('shows the reloading slot while a settled source refetches', async () => {
    const { PendingReloadingView, providePendingReloadingView } = craftService(
      { name: 'pendingReloadingView', providedIn: 'toProvide' },
      function* () {
        const reload = yield* state('reload', 0, ({ update }) => ({
          again: () => update((current) => current + 1),
        }));
        const users = yield* query('users', {
          params: function* () {
            const _reload = yield* reload();
            return _reload;
          },
          loader: async ({ params }): Promise<User[]> => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return [{ id: String(params), name: `Ada ${params}` }];
          },
        });
        const firstName = craftComputed('firstName', function* () {
          const list = yield* settled(users);
          return list[0].name;
        });
        return { firstName, reload };
      },
    );

    const root = craftComponent(
      'pendingReloading',
      { providers: [providePendingReloadingView()] },
      function* () {
        const { firstName, reload } = yield* PendingReloadingView();
        return section([
          button({ click: reload.again }, 'recharger'),
          div([span(firstName)]).pipe(
            pendingNode.exhaustive({
              users: {
                pending: () => p('vide'),
                reloading: () => p('rafraichissement'),
              },
            }),
          ),
        ]);
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.textContent).toContain('vide');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('Ada 0');

    (element.querySelector('button') as HTMLButtonElement).click();
    await flush();

    // A refetch keeps the stale value on screen and adds the indicator next
    // to it — it does not suspend.
    expect(element.textContent).toContain('rafraichissement');
    expect(element.textContent).toContain('Ada 0');
    expect(element.textContent).not.toContain('vide');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('Ada 1');
    expect(element.textContent).not.toContain('rafraichissement');

    destroy();
  });

  it('routes a source exception to the catchNode, not to the fallback', async () => {
    const { PendingWithExceptionView, providePendingWithExceptionView } =
      craftService(
        { name: 'pendingWithExceptionView', providedIn: 'toProvide' },
        function* () {
          const users = yield* query('users', {
            params: () =>
              shouldFail() ? craftException({ _tag: 'MISSING_USER_ID' }) : true,
            loader: async (): Promise<User[]> => [{ id: '1', name: 'Ada' }],
          });
          const firstName = craftComputed('firstName', function* () {
            const list = yield* settled(users);
            return list[0].name;
          });
          return { firstName };
        },
      );

    const shouldFail = signal(true);
    const root = craftComponent(
      'pendingWithException',
      { providers: [providePendingWithExceptionView()] },
      function* () {
        const { firstName } = yield* PendingWithExceptionView();
        return section([
          div([span(firstName)])
            .pipe(pendingNode({ fallback: () => p('chargement') }))
            .pipe(
              catchNode.exhaustive({
                MISSING_USER_ID: () => p('identifiant manquant'),
              }),
            ),
        ]);
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    await vi.runAllTimersAsync();
    await flush();

    expect(element.textContent).toContain('identifiant manquant');
    expect(element.textContent).not.toContain('chargement');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'identifiant manquant',
    );
    await assertAccessible(element);

    destroy();
  });

  it('picks the fallback of the pending source with the exhaustive form', async () => {
    const { PendingExhaustiveView, providePendingExhaustiveView } =
      craftService(
        { name: 'pendingExhaustiveView', providedIn: 'toProvide' },
        function* () {
          const users = yield* query('users', {
            params: () => true,
            loader: async (): Promise<User[]> => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return [{ id: '1', name: 'Ada' }];
            },
          });
          // The boundary is keyed on the QUERY name, even when the template only
          // ever sees the computed derived from it.
          const firstName = craftComputed('firstName', function* () {
            const list = yield* settled(users);
            return list[0].name;
          });
          return { firstName };
        },
      );

    const root = craftComponent(
      'pendingExhaustive',
      { providers: [providePendingExhaustiveView()] },
      function* () {
        const { firstName } = yield* PendingExhaustiveView();
        return div([span(firstName)]).pipe(
          pendingNode.exhaustive({ users: () => p('squelette utilisateurs') }),
        );
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.textContent).toContain('squelette utilisateurs');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('Ada');

    destroy();
  });
});

describe('pendingNode type-level contract', () => {
  // A type-only stand-in for `yield* query('users', ...)`: the contract under
  // test is the brand on `settledValue`, not how the ref is built.
  // Same fixture, with a source whose settled read can raise MISSING_USER_ID.
  const _asyncFailingTemplate = (): {
    readonly users: {
      readonly settledValue: CraftSettledSignal<
        string,
        'users',
        CraftExceptionResult<{ _tag: 'MISSING_USER_ID' }, undefined>
      >;
    };
  } => ({ users: { settledValue: (() => '') as never } });

  const _asyncTemplate = (): {
    readonly users: {
      readonly settledValue: CraftSettledSignal<string, 'users', never>;
    };
  } => ({ users: { settledValue: (() => '') as never } });

  it('bubbles the async source up through the node tree', () => {
    const { users } = _asyncTemplate();
    const _tree = section([div([span(users.settledValue)])]);

    expectTypeOf<
      CraftNodeChildrenPendingSources<typeof _tree>
    >().toEqualTypeOf<'users'>();
  });

  it('clears the source once a pendingNode covers it', () => {
    const { users } = _asyncTemplate();
    const _covered = div([span(users.settledValue)]).pipe(
      pendingNode({ fallback: () => p('…') }),
    );

    expectTypeOf<
      CraftNodeChildrenPendingSources<typeof _covered>
    >().toBeNever();
  });

  it('clears only the sources the exhaustive form lists', () => {
    const { users } = _asyncTemplate();
    const _covered = div([span(users.settledValue)]).pipe(
      pendingNode.exhaustive({ users: () => p('…') }),
    );

    expectTypeOf<
      CraftNodeChildrenPendingSources<typeof _covered>
    >().toBeNever();
  });

  it('rejects an exhaustive block that misses a source', () => {
    const { users } = _asyncTemplate();

    div([span(users.settledValue)]).pipe(
      // @ts-expect-error 'users' has no fallback in this boundary
      pendingNode.exhaustive({ orders: () => p('…') }),
    );
  });

  it('preserves insertion resource sources through the template boundary', () => {
    const {
      PendingInsertionResourceView,
      providePendingInsertionResourceView,
    } = craftService(
      { name: 'pendingInsertionResourceView', providedIn: 'toProvide' },
      function* () {
        const users = yield* query(
          'users',
          {
            params: () => true,
            loader: async (): Promise<User[]> => [],
          },
          ({ resource }) => ({
            count: craftComputed('count', function* () {
              return (yield* settled(resource)).length;
            }),
          }),
        );
        return { users };
      },
    );

    const root = craftComponent(
      'pendingInsertionResource',
      { providers: [providePendingInsertionResourceView()] },
      function* () {
        const { users } = yield* PendingInsertionResourceView();
        return div([span(users.count)]).pipe(
          pendingNode.exhaustive({ users: () => p('…') }),
        );
      },
    );

    expect(root).toBeDefined();
  });

  it('requires an explicit shell for client-only SSR', () => {
    const invalidBoundary = () =>
      // @ts-expect-error client-only SSR must render a stable server shell
      pendingNode({ ssr: 'client' });
    const validBoundary = pendingNode({
      ssr: 'client',
      fallback: () => p('browser shell'),
    });

    expect(invalidBoundary).toBeTypeOf('function');
    expect(validBoundary).toBeTypeOf('function');
  });

  it('bubbles a settled read exception up until a catchNode clears it', () => {
    const _uncaught = () => {
      const users = _asyncFailingTemplate().users;
      return div([span(users.settledValue)]).pipe(
        pendingNode({ fallback: () => p('…') }),
      );
    };
    const _caught = () =>
      _uncaught().pipe(catchNode.exhaustive({ MISSING_USER_ID: () => p('…') }));

    // A pending boundary is not an exception boundary.
    expectTypeOf<
      CraftNodeChildrenSettledExceptions<ReturnType<typeof _uncaught>>
    >().toEqualTypeOf<'MISSING_USER_ID'>();
    expectTypeOf<
      CraftNodeChildrenSettledExceptions<ReturnType<typeof _caught>>
    >().toBeNever();
  });

  it('rejects a template whose settled read exception has no catchNode', () => {
    craftComponent(
      'uncaughtSettledException',
      {},
      // @ts-expect-error MISSING_USER_ID can be raised by the settled read and
      // is not handled by any catchNode
      () => {
        const { users } = _asyncFailingTemplate();
        return div([span(users.settledValue)]).pipe(
          pendingNode({ fallback: () => p('…') }),
        );
      },
    );
  });

  it('rejects a template that renders an async craftComputed with no boundary', () => {
    craftComponent(
      'uncoveredComputed',
      {},
      // @ts-expect-error the 'users' source reached through the computed has no
      // pendingNode to show its loading state
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<{ text: string }> => ({ text: '' }),
        });
        const label = craftComputed('label', function* () {
          const settledUsers = yield* settled(users);
          return settledUsers.text;
        });
        return div([span(label)]);
      },
    );
  });

  it('rejects a template that renders an async source with no boundary', () => {
    craftComponent(
      'uncovered',
      {},
      // @ts-expect-error the 'users' source has no pendingNode to show it
      () => {
        const { users } = _asyncTemplate();
        return div([span(users.settledValue)]);
      },
    );
  });
});
