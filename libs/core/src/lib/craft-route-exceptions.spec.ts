import '@angular/compiler';
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftException, type CraftException } from './craft-exception';
import type { CraftGenExceptionMarker } from './craft-gen';
import {
  CRAFT_GLOBAL_ERROR,
  craftExceptionHandler,
  craftExceptionOutcomeApi,
  injectCraftGlobalError,
  type CraftExceptionHandler,
  type HandledExceptionsForUnion,
  type NoExtraExceptionHandlers,
  type RouteExceptionUnion,
} from './craft-route-exceptions';
import type { AnyCraftException } from './craft-exception';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

// --- Type-level fixtures: a route whose three steps advertise codes A, B, C ---

type Ex<Code extends string> = CraftException<
  { code: Code; scope: undefined },
  { detail: string }
>;

type FakeCanActivate = (
  route: unknown,
  state: unknown,
) => Generator<
  CraftGenExceptionMarker<Ex<'A'> | Ex<'B'>>,
  { user: string },
  unknown
>;

type FakeCanMatch = () => Generator<
  CraftGenExceptionMarker<Ex<'FLAG_OFF'>>,
  boolean,
  unknown
>;

type FakeResolve = () => Generator<
  CraftGenExceptionMarker<Ex<'C'>>,
  { profile: number },
  unknown
>;

type FakeRouteDef = {
  path: 'x';
  canActivate: FakeCanActivate;
  canMatch: FakeCanMatch;
  resolve: FakeResolve;
};

type FakeUnion = Extract<RouteExceptionUnion<FakeRouteDef>, AnyCraftException>;

// Mirrors how the route definition site will type `handleExceptions`: exhaustive
// over the union (missing key fails) and no-extra (extra key fails).
// A real no-op (not `declare`, so it exists at runtime) whose signature mirrors
// how the route definition site types `handleExceptions`: exhaustive over the
// union (missing key fails) and no-extra (extra key fails).
function handle<Handlers>(
  handlers: HandledExceptionsForUnion<FakeUnion> &
    Handlers &
    NoExtraExceptionHandlers<Handlers, FakeUnion>,
): void {
  void handlers;
}

describe('craft-route-exceptions (types)', () => {
  it('aggregates the union over canActivate ∪ canMatch ∪ resolve', () => {
    // A handler keyed on every reachable code (A, B, FLAG_OFF, C) compiles.
    handle({
      A: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/a');
      }),
      B: craftExceptionHandler(function* ({ stay }) {
        return stay();
      }),
      FLAG_OFF: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/home');
      }),
      C: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    });
    expect(true).toBe(true);
  });

  it('rejects a missing code', () => {
    // @ts-expect-error 'C' (from resolve) is missing — the error lands on the call
    handle({
      A: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/a');
      }),
      B: craftExceptionHandler(function* ({ stay }) {
        return stay();
      }),
      FLAG_OFF: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/home');
      }),
    });
  });

  it('rejects an extra code', () => {
    handle({
      A: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/a');
      }),
      B: craftExceptionHandler(function* ({ stay }) {
        return stay();
      }),
      FLAG_OFF: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/home');
      }),
      C: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      // @ts-expect-error 'NOPE' is not a reachable code
      NOPE: craftExceptionHandler(function* ({ noop }) {
        return noop();
      }),
    });
  });

  it('accepts a generator handler that yields before its outcome', () => {
    const handler: CraftExceptionHandler<Ex<'A'>> = craftExceptionHandler(
      function* ({ redirectUrl }) {
        // a real handler could `yield* SomeConfigToYield()` here
        return redirectUrl('/from-generator');
      },
    );
    expect(typeof handler).toBe('function');
  });

  it('types the exception and payload on the handler context', () => {
    const handler: CraftExceptionHandler<Ex<'A'>> = craftExceptionHandler(
      function* ({ exception, payload, phase, renderComponent }) {
        // exception.code is narrowed to 'A'; payload to { detail: string }
        const code: 'A' = exception.code;
        const detail: string = payload.detail;
        const seenEnter: boolean = phase === 'enter';
        void code;
        void detail;
        void seenEnter;
        return renderComponent({ component: class {}, componentDeps: {} });
      },
    );
    expect(typeof handler).toBe('function');
  });
});

describe('craft-route-exceptions (runtime)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('builds discriminated outcomes', () => {
    expect(craftExceptionOutcomeApi.redirectUrl('/login')).toEqual({
      kind: 'redirect',
      target: '/login',
    });
    expect(craftExceptionOutcomeApi.globalError()).toEqual({ kind: 'global' });
    expect(craftExceptionOutcomeApi.stay()).toEqual({ kind: 'stay' });
    expect(craftExceptionOutcomeApi.noop()).toEqual({ kind: 'noop' });
    const cmp = class {};
    const descriptor = { component: cmp, componentDeps: {} };
    expect(craftExceptionOutcomeApi.renderComponent(descriptor)).toEqual({
      kind: 'render',
      component: descriptor,
    });
  });

  it('injectCraftGlobalError reads the CRAFT_GLOBAL_ERROR signal', () => {
    TestBed.configureTestingModule({});
    const { sink, read } = TestBed.runInInjectionContext(() => ({
      sink: inject(CRAFT_GLOBAL_ERROR),
      read: injectCraftGlobalError(),
    }));

    expect(sink()).toBeNull();

    const exception = craftException({ code: 'USER_DISABLED' });
    sink.set(exception);

    // The typed reader observes whatever the outlet wrote into the sink.
    expect(read() as unknown).toBe(exception);
  });
});
