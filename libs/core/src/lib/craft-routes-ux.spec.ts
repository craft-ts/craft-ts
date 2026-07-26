import '@angular/compiler';
import type { Signal } from '@angular/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { craftException } from './craft-exception';
import { craftGen } from './craft-gen';
import { craftResolve } from './craft-resolve';
import { assertExhaustiveRouteExceptions } from './craft-route-exceptions';
import { craftExceptionHandler } from './craft-route-exceptions';
import { craftService } from './craft-service';
import {
  craftRoutes,
  craftRoute,
  type RouteExceptionHandlerDepsMap,
} from './craft-routes';

declare module './craft-router' {
  interface CraftRouterRoutesRegistry {
    HandlerSpec: readonly [
      { path: 'auth/login'; queryParams: { reason: string } },
      { path: 'users/:userId' },
    ];
  }
}

// Reusable guards/resolvers that advertise a reachable exception code (the
// `CraftGenExceptionMarker` flows through `yield*`).
const authFail = craftGen(function* () {
  return craftException({ code: 'NOT_AUTHENTICATED' });
});
const flagOff = craftGen(function* () {
  return craftException({ code: 'FEATURE_OFF' });
});
const profileFail = craftGen(function* () {
  return craftException({ code: 'USER_DISABLED' });
});
const pizzeriaFail = craftGen(function* () {
  return craftException({ code: 'HAS_PIZZERIA' });
});

class Stub {}

// `craftRoute()` takes exception handlers as a SEPARATE third argument. The 3-arg form
// types them exhaustively at the call site; the 2-arg form is for routes that throw
// nothing. A route that throws but is authored with the 2-arg form is caught after
// inference by `assertExhaustiveRouteExceptions`.
describe('route handleExceptions (third argument)', () => {
  it('requires the wrapper and a generator function', () => {
    // @ts-expect-error craftExceptionHandler accepts generator functions only
    craftExceptionHandler(({ noop }) => noop());

    craftRoute(
      'user/:userId',
      {
        component: Stub,
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        // @ts-expect-error bare handlers are not branded
        NOT_AUTHENTICATED: function* ({ noop }) {
          return noop();
        },
      },
    );
  });

  it('contextually types the handler (redirect/phase/outcomes) on the third argument', () => {
    const def = craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({
          redirectUrl,
          phase,
        }) {
          return redirectUrl(phase === 'active' ? '/login?expired' : '/login');
        }),
      },
    );
    expect(def.path).toBe('user/:userId');
  });

  it('rejects a wrong outcome-constructor argument (handlers are typed, not any)', () => {
    craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          // @ts-expect-error redirectUrl() takes a string | UrlTree, not a number
          return redirectUrl(123);
        }),
      },
    );
  });

  it('types `exception` per code on the handler context', () => {
    craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({
          exception,
          noop,
        }) {
          // `exception.code` is narrowed to the literal, not `any`.
          const code: string = exception.code;
          void code;
          return noop();
        }),
      },
    );
  });

  it('rejects a missing code at the call site', () => {
    craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
        resolve: craftResolve(function* () {
          return yield* profileFail();
        }),
      },
      // @ts-expect-error 'USER_DISABLED' (from resolve) is unhandled
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          return redirectUrl('/login');
        }),
      },
    );
  });

  it('rejects a missing code from sequential guards in one canActivate', () => {
    craftRoute(
      'new',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          yield* authFail();
          yield* profileFail();
          yield* pizzeriaFail();
          return true;
        },
      },
      // @ts-expect-error 'HAS_PIZZERIA' from the third guard is unhandled
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          return redirectUrl('/login');
        }),
        USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
          return globalError();
        }),
      },
    );
  });

  it('does not expose a string diagnostic key as a substitute handler', () => {
    craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      // @ts-expect-error the only valid missing key is NOT_AUTHENTICATED
      { ERROR_missing_exception_handlers: undefined },
    );
  });

  it('rejects an extra code through the collection exhaustiveness check', () => {
    const { demoRoutes } = craftRoutes('demo', [
      craftRoute(
        'user/:userId',
        {
          loadComponent: () => Promise.resolve({ default: Stub }),
          componentDeps: {},
          canActivate: function* () {
            return yield* authFail();
          },
        },
        {
          NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
            return redirectUrl('/login');
          }),
          NOPE: craftExceptionHandler(function* ({ noop }) {
            return noop();
          }),
        },
      ),
    ]);
    // @ts-expect-error 'NOPE' is not a reachable code
    assertExhaustiveRouteExceptions(demoRoutes);
  });

  it('allows the 2-arg form for a route that cannot throw', () => {
    const def = craftRoute('plain', {
      loadComponent: () => Promise.resolve({ default: Stub }),
      componentDeps: {},
    });
    expect(def.path).toBe('plain');
  });

  it('rejects handleExceptions inside the route definition object', () => {
    // @ts-expect-error handleExceptions must be passed as craftRoute()'s third argument
    craftRoute('user/:userId', {
      loadComponent: () => Promise.resolve({ default: Stub }),
      componentDeps: {},
      canActivate: function* () {
        return yield* authFail();
      },
      handleExceptions: {},
    });
  });

  it('aggregates the union over canActivate ∪ canMatch ∪ resolve', () => {
    const { demoRoutes } = craftRoutes('demo', [
      craftRoute(
        'user/:userId',
        {
          loadComponent: () => Promise.resolve({ default: Stub }),
          componentDeps: {},
          canMatch: function* () {
            return yield* flagOff();
          },
          canActivate: function* () {
            return yield* authFail();
          },
          resolve: craftResolve(function* () {
            return yield* profileFail();
          }),
        },
        {
          FEATURE_OFF: craftExceptionHandler(function* ({ redirectUrl }) {
            return redirectUrl('/home');
          }),
          NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
            return redirectUrl('/login');
          }),
          USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
            return globalError();
          }),
        },
      ).withProviders(() => []),
    ]);
    assertExhaustiveRouteExceptions(demoRoutes);
    expect(demoRoutes.name).toBe('demo');
  });

  it('assertExhaustiveRouteExceptions flags a route authored with the 2-arg form', () => {
    const { demoRoutes } = craftRoutes('demo', [
      craftRoute('user/:userId', {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      }).withProviders(() => []),
    ]);
    // @ts-expect-error 'NOT_AUTHENTICATED' is reachable but no handlers were passed
    assertExhaustiveRouteExceptions(demoRoutes);
  });

  it('generates injectXxxResolvedData for routes with a resolve step', () => {
    const result = craftRoutes('demo', [
      craftRoute(
        'user/:userId',
        {
          loadComponent: () => Promise.resolve({ default: Stub }),
          componentDeps: {},
          canActivate: function* () {
            return yield* authFail();
          },
          resolve: craftResolve(function* () {
            return yield* profileFail();
          }),
        },
        {
          NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
            return redirectUrl('/login');
          }),
          USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
            return globalError();
          }),
        },
      ).withProviders(() => []),
    ]);
    const resolvedDataKeys = Object.keys(result).filter((key) =>
      key.endsWith('ResolvedData'),
    );
    expect(resolvedDataKeys).toHaveLength(1);
    expect(
      typeof (result as Record<string, unknown>)[resolvedDataKeys[0]],
    ).toBe('function');
  });

  it('merges the handlers argument into the route definition at runtime', () => {
    const def = craftRoute(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          return redirectUrl('/login');
        }),
      },
    );
    expect(
      typeof (def as unknown as Record<string, unknown>).handleExceptions,
    ).toBe('object');
  });

  it('generates a route-scoped helper with the exact exception payload', () => {
    const disabled = craftGen(function* () {
      return craftException(
        { code: 'USER_DISABLED' },
        { reason: 'policy' as const },
      );
    });
    const result = craftRoutes('demo', [
      craftRoute(
        ':userId',
        {
          component: Stub,
          componentDeps: {},
          canActivate: function* () {
            return yield* disabled();
          },
        },
        {
          USER_DISABLED: craftExceptionHandler(function* ({ renderComponent }) {
            return renderComponent({ component: Stub, componentDeps: {} });
          }),
        },
      ),
    ]);

    expect(typeof result.injectDemoUserIdUserDisabledException).toBe(
      'function',
    );
    expectTypeOf<
      ReturnType<typeof result.injectDemoUserIdUserDisabledException>
    >().toExtend<Signal<{ readonly payload: { readonly reason: 'policy' } }>>();
  });

  it('preserves handler yields for route DI extraction', () => {
    const { HandlerConfig } = craftService(
      { name: 'HandlerConfig', scope: 'toProvide' },
      () => ({ target: '/login' }),
    );
    const def = craftRoute(
      ':userId',
      {
        component: Stub,
        componentDeps: {},
        canActivate: function* () {
          return yield* authFail();
        },
      },
      {
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          const config = yield* HandlerConfig();
          return redirectUrl(config.target);
        }),
      },
    );

    expectTypeOf<
      keyof RouteExceptionHandlerDepsMap<typeof def>
    >().toEqualTypeOf<'HandlerConfig'>();
    type HandlerGenerator = ReturnType<
      (typeof def.handleExceptions)['NOT_AUTHENTICATED']
    >;
    type HandlerOutcome =
      HandlerGenerator extends Generator<any, infer Outcome, unknown>
        ? Outcome
        : never;
    expectTypeOf<HandlerOutcome['kind']>().toEqualTypeOf<'redirect'>();
  });

  it('types redirectTo against the META_PATHS registry', () => {
    craftExceptionHandler(function* ({ redirectTo }) {
      yield* redirectTo({
        to: 'auth/login',
        queryParams: { reason: 'expired' },
      });
      yield* redirectTo({ to: 'users/:userId', params: { userId: '1' } });
      // @ts-expect-error unknown internal route
      yield* redirectTo({ to: 'auth/missing' });
      // @ts-expect-error missing structural params
      yield* redirectTo({ to: 'users/:userId' });
      return { kind: 'noop' } as const;
    });
  });
});
