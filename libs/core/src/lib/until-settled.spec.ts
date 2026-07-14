import { beforeEach, describe, expect, it } from 'vitest';
import { Injector, signal, type WritableSignal } from '@angular/core';
import type { Router } from '@angular/router';
import { craftException, type AnyCraftException } from './craft-exception';
import { CraftGenShortCircuit, isCraftGenShortCircuit } from './craft-gen';
import { isGuardAwaitRequest } from './craft-generator-runtime';
import {
  runCraftRouteChainAsync,
  type CraftRouteExceptionHandlerMap,
} from './craft-guard-runtime';
import { untilSettled, type ResourceLike } from './until-settled';

// A stub Router — the chain driver only binds these three methods onto the
// exception-handler context; the handlers below use the outcome constructors.
function stubRouter(): Router {
  return {
    createUrlTree: () => ({}) as unknown,
    navigate: () => Promise.resolve(true),
    navigateByUrl: () => Promise.resolve(true),
  } as unknown as Router;
}

// A generator that mimics a `CraftHttpClient.*` call: it returns a thenable
// descriptor that `untilSettled`'s HTTP branch awaits.
function fakeHttpCall(
  resolved: unknown,
): Generator<unknown, PromiseLike<unknown>, unknown> {
  // eslint-disable-next-line require-yield
  return (function* () {
    return Promise.resolve(resolved);
  })();
}

function makeResource(): {
  resource: ResourceLike;
  status: WritableSignal<string>;
  safeValue: WritableSignal<unknown>;
  error: WritableSignal<Error | undefined>;
  hasException: WritableSignal<boolean>;
  exceptions: WritableSignal<{ list: readonly AnyCraftException[] }>;
} {
  const status = signal<string>('loading');
  const safeValue = signal<unknown>(undefined);
  const error = signal<Error | undefined>(undefined);
  const hasException = signal(false);
  const exceptions = signal<{ list: readonly AnyCraftException[] }>({ list: [] });

  return {
    resource: { status, safeValue, error, hasException, exceptions },
    status,
    safeValue,
    error,
    hasException,
    exceptions,
  };
}

// Exercises `untilSettled`'s async HTTP-await path end-to-end, driven by the live
// non-blocking route chain (`runCraftRouteChainAsync`): a suspended guard resumes
// with the call's success value, and a business `craftException` short-circuits to
// the route's `handleExceptions`.
describe('untilSettled (HTTP await path)', () => {
  let injector: Injector;

  beforeEach(() => {
    injector = Injector.create({ providers: [] });
  });

  it('resumes the guard with the success value when the call succeeds', async () => {
    const guard = function* () {
      const user = yield* untilSettled(fakeHttpCall('USER'));
      return user === 'USER';
    };

    const outcome = await runCraftRouteChainAsync(
      { guard: guard() },
      injector,
      stubRouter(),
      {},
    );

    expect(outcome).toEqual({
      kind: 'data',
      guardData: true,
      resolveData: undefined,
    });
  });

  it('routes a business exception through the matching handler', async () => {
    const guard = function* () {
      yield* untilSettled(
        fakeHttpCall(
          craftException({ code: 'PASSWORD_REQUIRED', scope: 'UsersFeature' }),
        ),
      );
      return true;
    };

    const handlers: CraftRouteExceptionHandlerMap = {
      PASSWORD_REQUIRED: function* ({ redirectUrl }) {
        return redirectUrl('/password');
      },
    };

    const outcome = await runCraftRouteChainAsync(
      { guard: guard() },
      injector,
      stubRouter(),
      handlers,
    );

    expect(outcome).toEqual({ kind: 'redirect', target: '/password' });
  });

  it('surfaces a rethrown HttpError as a thrown error instead of routing it', async () => {
    const guard = function* () {
      yield* untilSettled(
        fakeHttpCall(
          craftException(
            { code: 'HttpError', scope: 'HttpClient' },
            { error: {}, method: 'GET', url: '/x' },
          ),
        ),
      );
      return true;
    };

    const outcome = await runCraftRouteChainAsync(
      { guard: guard() },
      injector,
      stubRouter(),
      {},
    );

    expect(outcome.kind).toBe('thrownError');
    expect(
      (outcome as { kind: 'thrownError'; error: AnyCraftException }).error,
    ).toMatchObject({ code: 'HttpError', scope: 'HttpClient' });
  });
});

// Drives the resource branch's settle decision directly — the `toObservable`
// suspension (exercised through the route chain driver for the signal path) is
// orthogonal here; what matters is what the generator does once a resource has
// settled.
describe('untilSettled (resource branch)', () => {
  it('yields a settle await-request, then returns the resolved value', () => {
    const { resource, status, safeValue } = makeResource();
    const iterator = untilSettled(resource) as Generator<unknown, unknown, unknown>;

    const first = iterator.next();
    expect(first.done).toBe(false);
    expect(isGuardAwaitRequest(first.value)).toBe(true);

    safeValue.set('USER');
    status.set('resolved');

    const done = iterator.next();
    expect(done.done).toBe(true);
    expect(done.value).toBe('USER');
  });

  it('short-circuits with the loader exception when the resource has one', () => {
    const { resource, status, hasException, exceptions } = makeResource();
    const iterator = untilSettled(resource) as Generator<unknown, unknown, unknown>;

    iterator.next();
    hasException.set(true);
    const exception = craftException({
      code: 'NOT_ALLOWED',
      scope: 'UsersFeature',
    });
    exceptions.set({ list: [exception] });
    status.set('resolved');

    try {
      iterator.next();
      expect.unreachable('expected a CraftGenShortCircuit to be thrown');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      expect((error as CraftGenShortCircuit).exception.code).toBe('NOT_ALLOWED');
    }
  });

  it('rethrows the loader error when the resource settled to an exception', () => {
    const { resource, status, error } = makeResource();
    const iterator = untilSettled(resource) as Generator<unknown, unknown, unknown>;

    iterator.next();
    error.set(new Error('boom'));
    status.set('exception');

    expect(() => iterator.next()).toThrowError('boom');
  });
});
