import '@angular/compiler';
import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { craftException, type AnyCraftException } from './craft-exception';
import { CraftGenShortCircuit } from './craft-gen';
import { GUARD_AWAIT_REQUEST_MARKER } from './craft-generator-runtime';
import { SERVICE_RUNTIME_OVERRIDES } from './craft-service';
import { provideCraftRouter } from './craft-router';
import { FN_WRAPPER } from './fn-wrapper';

declare module './craft-router' {
  interface CraftRouterRoutesRegistry {
    GuardRuntimeSpec: readonly [
      { path: 'auth/login'; queryParams: { reason: string } },
    ];
  }
}
import {
  runCraftRouteChainAsync,
  type CraftRouteExceptionHandlerMap,
} from './craft-guard-runtime';

const injector = Injector.create({ providers: [] });

// A fake router: the chain driver only binds these three methods onto the
// handler context; the test handlers below use the outcome constructors instead.
const router = {
  createUrlTree: () => ({}) as unknown,
  navigate: () => Promise.resolve(true),
  navigateByUrl: () => Promise.resolve(true),
} as unknown as Router;

function* returns<T>(value: T): Generator<unknown, T, unknown> {
  return value;
}

function* returnsException(
  exception: AnyCraftException,
): Generator<unknown, AnyCraftException, unknown> {
  return exception;
}

function* throwsShortCircuit(
  exception: AnyCraftException,
): Generator<unknown, never, unknown> {
  throw new CraftGenShortCircuit(exception);
}

function* throwsRaw(error: unknown): Generator<unknown, never, unknown> {
  throw error;
}

const ex = (code: string) => craftException({ code });

describe('runCraftRouteChainAsync', () => {
  it('returns guard + resolve data on full success', async () => {
    const outcome = await runCraftRouteChainAsync(
      { guard: returns({ user: 'ada' }), resolve: returns({ profile: 42 }) },
      injector,
      router,
      {},
    );
    expect(outcome).toEqual({
      kind: 'data',
      guardData: { user: 'ada' },
      resolveData: { profile: 42 },
    });
  });

  it('returns undefined data when there is no guard and no resolve', async () => {
    const outcome = await runCraftRouteChainAsync({}, injector, router, {});
    expect(outcome).toEqual({
      kind: 'data',
      guardData: undefined,
      resolveData: undefined,
    });
  });

  it('routes a guard that returns a bare craftException through handleExceptions', async () => {
    const handlers: CraftRouteExceptionHandlerMap = {
      NOT_AUTHENTICATED: function* ({ redirectUrl }) {
        return redirectUrl('/login');
      },
    };
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(ex('NOT_AUTHENTICATED')) },
      injector,
      router,
      handlers,
    );
    expect(outcome).toEqual({ kind: 'redirect', target: '/login' });
  });

  it('routes a guard that throws CraftGenShortCircuit through handleExceptions', async () => {
    const handlers: CraftRouteExceptionHandlerMap = {
      FORBIDDEN: function* ({ stay }) {
        return stay();
      },
    };
    const outcome = await runCraftRouteChainAsync(
      { guard: throwsShortCircuit(ex('FORBIDDEN')) },
      injector,
      router,
      handlers,
    );
    expect(outcome).toEqual({ kind: 'stay' });
  });

  it('does not run resolve when the guard fails', async () => {
    let resolveRan = false;
    function* resolveSpy(): Generator<unknown, unknown, unknown> {
      resolveRan = true;
      return { profile: 1 };
    }
    await runCraftRouteChainAsync(
      {
        guard: returnsException(ex('NOT_AUTHENTICATED')),
        resolve: resolveSpy(),
      },
      injector,
      router,
      {
        NOT_AUTHENTICATED: function* ({ redirectUrl }) {
          return redirectUrl('/login');
        },
      },
    );
    expect(resolveRan).toBe(false);
  });

  it('routes a resolve exception through handleExceptions', async () => {
    const outcome = await runCraftRouteChainAsync(
      {
        guard: returns({ user: 'ada' }),
        resolve: returnsException(ex('USER_DISABLED')),
      },
      injector,
      router,
      {
        USER_DISABLED: function* ({ globalError }) {
          return globalError();
        },
      },
    );
    expect(outcome).toEqual({
      kind: 'global',
      exception: expect.objectContaining({ code: 'USER_DISABLED' }),
    });
  });

  it('carries the handled exception on a global outcome', async () => {
    const exception = ex('USER_DISABLED');
    const outcome = await runCraftRouteChainAsync(
      { resolve: returnsException(exception) },
      injector,
      router,
      {
        USER_DISABLED: function* ({ globalError }) {
          return globalError();
        },
      },
    );
    expect(outcome).toEqual({ kind: 'global', exception });
  });

  it('drives a generator handler that yields before its outcome', async () => {
    const handlers: CraftRouteExceptionHandlerMap = {
      NEEDS_WORK: function* ({ redirectUrl }) {
        return redirectUrl('/from-generator');
      },
    };
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(ex('NEEDS_WORK')) },
      injector,
      router,
      handlers,
    );
    expect(outcome).toEqual({ kind: 'redirect', target: '/from-generator' });
  });

  it('surfaces an unhandled exception code as a thrown error', async () => {
    const exception = ex('SURPRISE');
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(exception) },
      injector,
      router,
      {},
    );
    expect(outcome).toEqual({ kind: 'thrownError', error: exception });
  });

  it('routes a rethrown craftException (e.g. HttpError) through a matching handler', async () => {
    const httpError = craftException({
      code: 'HttpError',
      scope: 'HttpClient',
    });
    const outcome = await runCraftRouteChainAsync(
      { resolve: throwsRaw(httpError) },
      injector,
      router,
      {
        HttpError: function* ({ globalError }) {
          return globalError();
        },
      },
    );
    expect(outcome).toEqual({ kind: 'global', exception: httpError });
  });

  it('surfaces a rethrown craftException with no handler as a thrown error', async () => {
    const httpError = craftException({
      code: 'HttpError',
      scope: 'HttpClient',
    });
    const outcome = await runCraftRouteChainAsync(
      { resolve: throwsRaw(httpError) },
      injector,
      router,
      {},
    );
    expect(outcome).toEqual({ kind: 'thrownError', error: httpError });
  });

  it('surfaces a thrown non-craft error as a thrown error', async () => {
    const boom = new Error('boom');
    const outcome = await runCraftRouteChainAsync(
      { resolve: throwsRaw(boom) },
      injector,
      router,
      {},
    );
    expect(outcome).toEqual({ kind: 'thrownError', error: boom });
  });

  it('runs canMatch first and routes its exception through handleExceptions', async () => {
    let guardRan = false;
    function* guardSpy(): Generator<unknown, unknown, unknown> {
      guardRan = true;
      return { user: 'ada' };
    }
    const outcome = await runCraftRouteChainAsync(
      { match: returnsException(ex('FEATURE_OFF')), guard: guardSpy() },
      injector,
      router,
      {
        FEATURE_OFF: function* ({ redirectUrl }) {
          return redirectUrl('/home');
        },
      },
    );
    expect(outcome).toEqual({ kind: 'redirect', target: '/home' });
    expect(guardRan).toBe(false);
  });

  it('proceeds past a passing canMatch (its success value is discarded)', async () => {
    const outcome = await runCraftRouteChainAsync(
      { match: returns(true), resolve: returns({ profile: 7 }) },
      injector,
      router,
      {},
    );
    expect(outcome).toEqual({
      kind: 'data',
      guardData: undefined,
      resolveData: { profile: 7 },
    });
  });

  it('forwards the phase to the exception handler', async () => {
    let seenPhase: string | undefined;
    const handlers: CraftRouteExceptionHandlerMap = {
      NOT_AUTHENTICATED: function* ({ phase, redirectUrl }) {
        seenPhase = phase;
        return redirectUrl(phase === 'active' ? '/login?expired' : '/login');
      },
    };
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(ex('NOT_AUTHENTICATED')) },
      injector,
      router,
      handlers,
      'active',
    );
    expect(seenPhase).toBe('active');
    expect(outcome).toEqual({ kind: 'redirect', target: '/login?expired' });
  });

  it('rejects suspension from an exception handler explicitly', async () => {
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(ex('WAIT')) },
      injector,
      router,
      {
        WAIT: function* ({ noop }) {
          yield {
            [GUARD_AWAIT_REQUEST_MARKER]: true,
            kind: 'promise',
            value: Promise.resolve(undefined),
          };
          return noop();
        },
      },
    );
    expect(outcome).toEqual({
      kind: 'thrownError',
      error: expect.objectContaining({
        message:
          'Route exception handlers cannot suspend with untilSettled/untilDefined.',
      }),
    });
  });

  it('resolves redirectTo through the active injector', async () => {
    const target = { typed: true };
    const activeRouter = {
      ...router,
      createUrlTree: () => target,
    } as unknown as Router;
    const activeInjector = Injector.create({
      providers: [
        // provideCraftRouter's type admits EnvironmentProviders, but with no
        // features it only returns plain providers — safe for Injector.create.
        ...(provideCraftRouter([]) as import('@angular/core').Provider[]),
        { provide: Router, useValue: activeRouter },
        { provide: SERVICE_RUNTIME_OVERRIDES, useValue: new Map() },
        { provide: FN_WRAPPER, useValue: [] },
      ],
    });
    const outcome = await runCraftRouteChainAsync(
      { guard: returnsException(ex('LOGIN')) },
      activeInjector,
      activeRouter,
      {
        LOGIN: function* ({ redirectTo }) {
          return yield* redirectTo({
            to: 'auth/login',
            queryParams: { reason: 'expired' },
          });
        },
      },
    );
    expect(outcome).toEqual({ kind: 'redirect', target });
  });
});
