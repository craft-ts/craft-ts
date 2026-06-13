import { beforeEach, describe, expect, it } from 'vitest';
import { Injector, signal, type WritableSignal } from '@angular/core';
import type { Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { craftException, type AnyCraftException } from './craft-exception';
import { CraftGenShortCircuit, isCraftGenShortCircuit } from './craft-gen';
import { isGuardAwaitRequest } from './craft-generator-runtime';
import { runCraftGuardAsync } from './craft-guard-runtime';
import { untilSettled, type ResourceLike } from './until-settled';

// A stub Router whose redirect helpers return inspectable sentinels — enough for
// the guard resolvers, without pulling the DOM/router DI graph into the test.
function stubRouter(): Router {
  return {
    createUrlTree: (commands: unknown[]) =>
      ({ __urlTree: commands }) as unknown as UrlTree,
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

describe('runCraftGuardAsync', () => {
  let injector: Injector;

  beforeEach(() => {
    injector = Injector.create({ providers: [] });
  });

  describe('synchronous fast-path', () => {
    it('returns a bare value when the guard never awaits', () => {
      // eslint-disable-next-line require-yield
      const guard = function* () {
        return true;
      };

      const result = runCraftGuardAsync(guard(), injector, stubRouter(), {});

      expect(result).toBe(true);
      expect(isObservable(result)).toBe(false);
    });

    it('resolves a synchronous short-circuit through the resolver synchronously', () => {
      // eslint-disable-next-line require-yield
      const guard = function* (): Generator<unknown, unknown, unknown> {
        throw new CraftGenShortCircuit(
          craftException({ code: 'BLOCKED', scope: 'Test' }),
        );
      };

      const result = runCraftGuardAsync(guard(), injector, stubRouter(), {
        BLOCKED: () => false,
      });

      expect(result).toBe(false);
    });
  });

  describe('HTTP await path', () => {
    it('resolves the success value when the call succeeds', async () => {
      const guard = function* () {
        const user = yield* untilSettled(fakeHttpCall('USER'));
        return user === 'USER';
      };

      const result = runCraftGuardAsync(guard(), injector, stubRouter(), {});

      expect(isObservable(result)).toBe(true);
      expect(await firstValueFrom(result as never)).toBe(true);
    });

    it('routes a business exception through the matching resolver', async () => {
      const guard = function* () {
        yield* untilSettled(
          fakeHttpCall(
            craftException({ code: 'PASSWORD_REQUIRED', scope: 'UsersFeature' }),
          ),
        );
        return true;
      };

      const result = runCraftGuardAsync(guard(), injector, stubRouter(), {
        PASSWORD_REQUIRED: ({ createUrlTree }) => createUrlTree(['/password']),
      });

      const resolved = (await firstValueFrom(result as never)) as {
        __urlTree: unknown[];
      };
      expect(resolved.__urlTree).toEqual(['/password']);
    });

    it('rethrows a generic HttpError instead of routing it to a resolver', async () => {
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

      const result = runCraftGuardAsync(guard(), injector, stubRouter(), {});

      await expect(firstValueFrom(result as never)).rejects.toMatchObject({
        code: 'HttpError',
        scope: 'HttpClient',
      });
    });
  });
});

// Drives the resource branch's settle decision directly — the `toObservable`
// suspension (exercised through `runCraftGuardAsync` for the signal path) is
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

  it('rethrows the loader error when the resource settled to an error', () => {
    const { resource, status, error } = makeResource();
    const iterator = untilSettled(resource) as Generator<unknown, unknown, unknown>;

    iterator.next();
    error.set(new Error('boom'));
    status.set('error');

    expect(() => iterator.next()).toThrowError('boom');
  });
});
