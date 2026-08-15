// @vitest-environment jsdom
import '@angular/compiler';
import { signal } from '@angular/core';
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
  type CraftSettledSignal
} from '@craft-ng/core';
import {
  button,
  catchBlock,
  craftComponent,
  div,
  p,
  pendingBlock,
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

describe('pendingBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the fallback until the source settles, then the subtree', async () => {
    const root = craftComponent(
      'pendingRoot',
      {},
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
      ({ firstName }) =>
        section([
          div([span(firstName)]).pipe(
            pendingBlock({ fallback: () => p('chargement') }),
          ),
        ]),
    );

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );

    expect(element.textContent).toContain('chargement');
    expect(element.textContent).not.toContain('Ada');
    const live = element.querySelector('[aria-live="polite"][aria-busy="true"]');
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
    const root = craftComponent(
      'pendingDirect',
      {},
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
      ({ text }) =>
        div([span(text)]).pipe(pendingBlock({ fallback: () => p('attente') })),
    );

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
    expect(element.textContent).toContain('attente');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('prêt');

    destroy();
  });

  it('shows the reloading slot while a settled source refetches', async () => {
    const root = craftComponent(
      'pendingReloading',
      {},
      function* () {
        const reload = yield* state('reload', 0, ({ update }) => ({
          again: () => update((current) => current + 1),
        }));
        const users = yield* query('users', {
          params: function* () {
                const _reload = yield* reload(); return _reload; },
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
      ({ firstName, reload }) =>
        section([
          button({ click: reload.again }, 'recharger'),
          div([span(firstName)]).pipe(
            pendingBlock.exhaustive({
              users: {
                pending: () => p('vide'),
                reloading: () => p('rafraichissement'),
              },
            }),
          ),
        ]),
    );

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
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

  it('routes a source exception to the catchBlock, not to the fallback', async () => {
    const shouldFail = signal(true);
    const root = craftComponent(
      'pendingWithException',
      {},
      function* () {
        const users = yield* query('users', {
          params: () =>
            shouldFail() ? craftException({ code: 'MISSING_USER_ID' }) : true,
          loader: async (): Promise<User[]> => [{ id: '1', name: 'Ada' }],
        });
        const firstName = craftComputed('firstName', function* () {
          const list = yield* settled(users);
          return list[0].name;
        });
        return { firstName };
      },
      ({ firstName }) =>
        section([
          div([span(firstName)])
            .pipe(pendingBlock({ fallback: () => p('chargement') }))
            .pipe(
              catchBlock.exhaustive({
                MISSING_USER_ID: () => p('identifiant manquant'),
              }),
            ),
        ]),
    );

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
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
    const root = craftComponent(
      'pendingExhaustive',
      {},
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
      ({ firstName }) =>
        div([span(firstName)]).pipe(
          pendingBlock.exhaustive({ users: () => p('squelette utilisateurs') }),
        ),
    );

    const { nativeElement: element, flush, destroy } = await renderCraftComponent(
      root,
    );
    expect(element.textContent).toContain('squelette utilisateurs');

    await vi.runAllTimersAsync();
    await flush();
    expect(element.textContent).toContain('Ada');

    destroy();
  });
});

describe('pendingBlock type-level contract', () => {
  // A type-only stand-in for `yield* query('users', ...)`: the contract under
  // test is the brand on `settledValue`, not how the ref is built.
  // Same fixture, with a source whose settled read can raise MISSING_USER_ID.
  const _asyncFailingTemplate = (): {
    readonly users: {
      readonly settledValue: CraftSettledSignal<
        string,
        'users',
        CraftExceptionResult<{ code: 'MISSING_USER_ID' }, undefined>
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

  it('clears the source once a pendingBlock covers it', () => {
    const { users } = _asyncTemplate();
    const _covered = div([span(users.settledValue)]).pipe(
      pendingBlock({ fallback: () => p('…') }),
    );

    expectTypeOf<
      CraftNodeChildrenPendingSources<typeof _covered>
    >().toBeNever();
  });

  it('clears only the sources the exhaustive form lists', () => {
    const { users } = _asyncTemplate();
    const _covered = div([span(users.settledValue)]).pipe(
      pendingBlock.exhaustive({ users: () => p('…') }),
    );

    expectTypeOf<
      CraftNodeChildrenPendingSources<typeof _covered>
    >().toBeNever();
  });

  it('rejects an exhaustive block that misses a source', () => {
    const { users } = _asyncTemplate();

    div([span(users.settledValue)]).pipe(
      // @ts-expect-error 'users' has no fallback in this boundary
      pendingBlock.exhaustive({ orders: () => p('…') }),
    );
  });

  it('bubbles a settled read exception up until a catchBlock clears it', () => {
    const _uncaught = () => {
      const users = _asyncFailingTemplate().users;
      return div([span(users.settledValue)]).pipe(
        pendingBlock({ fallback: () => p('…') }),
      );
    };
    const _caught = () =>
      _uncaught().pipe(
        catchBlock.exhaustive({ MISSING_USER_ID: () => p('…') }),
      );

    // A pending boundary is not an exception boundary.
    expectTypeOf<
      CraftNodeChildrenSettledExceptions<ReturnType<typeof _uncaught>>
    >().toEqualTypeOf<'MISSING_USER_ID'>();
    expectTypeOf<
      CraftNodeChildrenSettledExceptions<ReturnType<typeof _caught>>
    >().toBeNever();
  });

  it('rejects a template whose settled read exception has no catchBlock', () => {
    craftComponent(
      'uncaughtSettledException',
      {},
      () => ({ users: _asyncFailingTemplate().users }),
      // @ts-expect-error MISSING_USER_ID can be raised by the settled read and
      // is not handled by any catchBlock
      ({ users }) =>
        div([span(users.settledValue)]).pipe(
          pendingBlock({ fallback: () => p('…') }),
        ),
    );
  });

  it('rejects a template that renders an async craftComputed with no boundary', () => {
    craftComponent(
      'uncoveredComputed',
      {},
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<{ text: string }> => ({ text: '' }),
        });
        const label = craftComputed('label', function* () {
          const settledUsers = yield* settled(users);
          return settledUsers.text;
        });
        return { label };
      },
      // @ts-expect-error the 'users' source reached through the computed has no
      // pendingBlock to show its loading state
      ({ label }) => div([span(label)]),
    );
  });

  it('rejects a template that renders an async source with no boundary', () => {
    craftComponent(
      'uncovered',
      {},
      () => ({ users: _asyncTemplate().users }),
      // @ts-expect-error the 'users' source has no pendingBlock to show it
      ({ users }) => div([span(users.settledValue)]),
    );
  });
});
