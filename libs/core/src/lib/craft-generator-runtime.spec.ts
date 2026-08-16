import {
  Injector,
} from './host/craft-compat';
import { describe, expect, it } from 'vitest';
import {
  executeGeneratorCompatibleFactory,
  GUARD_AWAIT_REQUEST_MARKER,
  isGenerator,
  isGeneratorFunction,
  isGuardAwaitRequest,
  resolveCraftGeneratorYield,
  runCraftGenerator,
  SERVICE_APP_START_REQUEST_MARKER,
  SERVICE_DEPENDENCY_ACCESS_MARKER,
  SERVICE_TRACKED_DEPS_REQUEST_MARKER,
  SERVICE_YIELD_REQUEST_MARKER,
} from './craft-generator-runtime';
import { FN_WRAP_OBSERVER, FN_WRAPPER } from './fn-wrapper';

const injector = Injector.create({
  providers: [
    { provide: FN_WRAPPER, useValue: [] },
    { provide: FN_WRAP_OBSERVER, useValue: [] },
  ],
});

describe('isGenerator', () => {
  it('recognizes a generator object', () => {
    function* gen() {
      yield 1;
    }
    expect(isGenerator(gen())).toBe(true);
  });

  it('rejects primitives and plain objects', () => {
    expect(isGenerator(42)).toBe(false);
    expect(isGenerator(null)).toBe(false);
    expect(isGenerator({})).toBe(false);
    expect(isGenerator({ next: 'not-a-function' })).toBe(false);
  });
});

describe('isGeneratorFunction', () => {
  it('recognizes a generator function', () => {
    function* gen() {
      yield 1;
    }
    expect(isGeneratorFunction(gen)).toBe(true);
  });

  it('rejects a regular function', () => {
    expect(isGeneratorFunction(() => 1)).toBe(false);
  });

  it('rejects non-functions', () => {
    expect(isGeneratorFunction(42)).toBe(false);
    expect(isGeneratorFunction(null)).toBe(false);
  });
});

describe('isGuardAwaitRequest', () => {
  it('recognizes an object carrying the marker', () => {
    const request = { [GUARD_AWAIT_REQUEST_MARKER]: true, kind: 'settle' };
    expect(isGuardAwaitRequest(request)).toBe(true);
  });

  it('rejects objects without the marker', () => {
    expect(isGuardAwaitRequest({ kind: 'settle' })).toBe(false);
    expect(isGuardAwaitRequest(null)).toBe(false);
    expect(isGuardAwaitRequest(42)).toBe(false);
  });
});

describe('runCraftGenerator', () => {
  it('drives a plain generator through to its return value', () => {
    function* gen() {
      return 'done';
    }
    const { value, appStartHook } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(value).toBe('done');
    expect(appStartHook).toBeUndefined();
  });

  it('resolves a service yield request and feeds the result back in', () => {
    function* gen(): Generator<unknown, unknown, unknown> {
      const received = yield {
        [SERVICE_YIELD_REQUEST_MARKER]: true,
        scope: 'function',
        resolve: (_inj: Injector, hostScope: string) => `resolved:${hostScope}`,
      };
      return received;
    }
    const { value } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'global',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(value).toBe('resolved:global');
  });

  it('resolves a dependency access request', () => {
    function* gen(): Generator<unknown, unknown, unknown> {
      const received = yield {
        [SERVICE_DEPENDENCY_ACCESS_MARKER]: true,
        key: 'x',
        resolve: () => 'dep-value',
      };
      return received;
    }
    const { value } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(value).toBe('dep-value');
  });

  it('resolves a tracked-deps request to undefined without side effects', () => {
    function* gen(): Generator<unknown, unknown, unknown> {
      const received = yield {
        [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
      };
      return received;
    }
    const { value } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(value).toBeUndefined();
  });

  it('captures an app-start request as appStartHook by default', () => {
    const run = () => Promise.resolve();
    function* gen() {
      yield { [SERVICE_APP_START_REQUEST_MARKER]: true, run };
      return 'ok';
    }
    const { value, appStartHook } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(value).toBe('ok');
    expect(appStartHook).toBe(run);
  });

  it('wraps the app-start run through createAppStartHook when provided', () => {
    const run = () => Promise.resolve();
    const wrapped = () => Promise.resolve();
    function* gen() {
      yield { [SERVICE_APP_START_REQUEST_MARKER]: true, run };
      return 'ok';
    }
    const { appStartHook } = runCraftGenerator({
      iterator: gen(),
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
      createAppStartHook: () => wrapped,
    });
    expect(appStartHook).toBe(wrapped);
  });

  it('throws multipleAppStartErrorMessage on a second app-start request', () => {
    function* gen() {
      yield { [SERVICE_APP_START_REQUEST_MARKER]: true, run: () => undefined };
      yield { [SERVICE_APP_START_REQUEST_MARKER]: true, run: () => undefined };
      return 'ok';
    }
    expect(() =>
      runCraftGenerator({
        iterator: gen(),
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage: 'invalid',
        multipleAppStartErrorMessage: 'multi',
      }),
    ).toThrow('multi');
  });

  it('throws onAppStartNotSupportedErrorMessage when app-start is not supported', () => {
    function* gen() {
      yield { [SERVICE_APP_START_REQUEST_MARKER]: true, run: () => undefined };
      return 'ok';
    }
    expect(() =>
      runCraftGenerator({
        iterator: gen(),
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage: 'invalid',
        multipleAppStartErrorMessage: 'multi',
        onAppStartNotSupportedErrorMessage: 'not-supported',
      }),
    ).toThrow('not-supported');
  });

  it('throws invalidYieldErrorMessage for an unrecognized yield', () => {
    function* gen() {
      yield { some: 'random-value' };
      return 'ok';
    }
    expect(() =>
      runCraftGenerator({
        iterator: gen(),
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage: 'invalid-yield',
        multipleAppStartErrorMessage: 'multi',
      }),
    ).toThrow('invalid-yield');
  });
});

describe('resolveCraftGeneratorYield', () => {
  it('resolves a service yield request', () => {
    const result = resolveCraftGeneratorYield(
      {
        [SERVICE_YIELD_REQUEST_MARKER]: true,
        scope: 'function',
        resolve: () => 'resolved',
      },
      injector,
      'function',
    );
    expect(result).toEqual({ handled: true, value: 'resolved' });
  });

  it('resolves a dependency access request', () => {
    const result = resolveCraftGeneratorYield(
      {
        [SERVICE_DEPENDENCY_ACCESS_MARKER]: true,
        key: 'x',
        resolve: () => 'dep-value',
      },
      injector,
      'function',
    );
    expect(result).toEqual({ handled: true, value: 'dep-value' });
  });

  it('resolves a tracked-deps request to undefined', () => {
    const result = resolveCraftGeneratorYield(
      { [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true },
      injector,
      'function',
    );
    expect(result).toEqual({ handled: true, value: undefined });
  });

  it('returns handled: false for anything unrecognized (e.g. guard await request)', () => {
    const result = resolveCraftGeneratorYield(
      { [GUARD_AWAIT_REQUEST_MARKER]: true, kind: 'settle' },
      injector,
      'function',
    );
    expect(result).toEqual({ handled: false });
  });
});

describe('executeGeneratorCompatibleFactory', () => {
  it('returns a sync factory result directly', () => {
    const result = executeGeneratorCompatibleFactory({
      factory: (a: number, b: number) => a + b,
      thisArg: undefined,
      getInjector: () => injector,
      args: [1, 2],
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(result).toBe(3);
  });

  it('drives a generator-returning factory to completion', () => {
    const result = executeGeneratorCompatibleFactory({
      factory: function* (a: number, b: number) {
        return a * b;
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [3, 4],
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(result).toBe(12);
  });

  it('resolves service yield requests inside the driven generator', () => {
    const result = executeGeneratorCompatibleFactory({
      factory: function* (): Generator<unknown, unknown, unknown> {
        const received = yield {
          [SERVICE_YIELD_REQUEST_MARKER]: true,
          scope: 'function',
          resolve: () => 'injected-value',
        };
        return received;
      },
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(result).toBe('injected-value');
  });

  it('applies thisArg to the factory', () => {
    const thisArg = { multiplier: 10 };
    const result = executeGeneratorCompatibleFactory({
      factory: function (this: { multiplier: number }, n: number) {
        return n * this.multiplier;
      },
      thisArg,
      getInjector: () => injector,
      args: [5],
      invalidYieldErrorMessage: 'invalid',
      multipleAppStartErrorMessage: 'multi',
    });
    expect(result).toBe(50);
  });
});
