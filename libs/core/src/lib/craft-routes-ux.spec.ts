import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { craftException } from './craft-exception';
import { craftGen } from './craft-gen';
import { craftResolve } from './craft-resolve';
import { assertExhaustiveRouteExceptions } from './craft-route-exceptions';
import {
  craftCanActivate,
  craftCanMatch,
  craftRoutes,
  route,
} from './craft-routes';

// Reusable guards/resolvers that advertise a reachable exception code (the
// `CraftGenExceptionMarker` flows through `yield*`).
const authFail = craftGen(() =>
  function* () {
    return craftException({ code: 'NOT_AUTHENTICATED' });
  },
);
const flagOff = craftGen(() =>
  function* () {
    return craftException({ code: 'FEATURE_OFF' });
  },
);
const profileFail = craftGen(() =>
  function* () {
    return craftException({ code: 'USER_DISABLED' });
  },
);

class Stub {}

// `route()` takes exception handlers as a SEPARATE third argument. The 3-arg form
// types them exhaustively at the call site; the 2-arg form is for routes that throw
// nothing. A route that throws but is authored with the 2-arg form is caught after
// inference by `assertExhaustiveRouteExceptions`.
describe('route handleExceptions (third argument)', () => {
  it('contextually types the handler (redirect/phase/outcomes) on the third argument', () => {
    const def = route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      },
      {
        NOT_AUTHENTICATED: ({ redirect, phase }) =>
          redirect(phase === 'active' ? '/login?expired' : '/login'),
      },
    );
    expect(def.path).toBe('user/:userId');
  });

  it('rejects a wrong outcome-constructor argument (handlers are typed, not any)', () => {
    route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      },
      {
        // @ts-expect-error redirect() takes a string | UrlTree, not a number
        NOT_AUTHENTICATED: ({ redirect }) => redirect(123),
      },
    );
  });

  it('types `exception` per code on the handler context', () => {
    route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      },
      {
        NOT_AUTHENTICATED: ({ exception, noop }) => {
          // `exception.code` is narrowed to the literal, not `any`.
          const code: 'NOT_AUTHENTICATED' = exception.code;
          void code;
          return noop();
        },
      },
    );
  });

  it('rejects a missing code at the call site', () => {
    route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
        resolve: craftResolve(function* () {
          return yield* profileFail();
        }),
      },
      // @ts-expect-error 'USER_DISABLED' (from resolve) is unhandled
      {
        NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
      },
    );
  });

  it('rejects an extra code at the call site', () => {
    route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      },
      {
        NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
        // @ts-expect-error 'NOPE' is not a reachable code
        NOPE: ({ noop }) => noop(),
      },
    );
  });

  it('allows the 2-arg form for a route that cannot throw', () => {
    const def = route('plain', {
      loadComponent: () => Promise.resolve({ default: Stub }),
      componentDeps: {},
    });
    expect(def.path).toBe('plain');
  });

  it('aggregates the union over canActivate ∪ canMatch ∪ resolve', () => {
    const { demoRoutes } = craftRoutes('demo', [
      route(
        'user/:userId',
        {
          loadComponent: () => Promise.resolve({ default: Stub }),
          componentDeps: {},
          canMatch: craftCanMatch(function* () {
            return yield* flagOff();
          }),
          canActivate: craftCanActivate(function* () {
            return yield* authFail();
          }),
          resolve: craftResolve(function* () {
            return yield* profileFail();
          }),
        },
        {
          FEATURE_OFF: ({ redirect }) => redirect('/home'),
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          USER_DISABLED: ({ globalError }) => globalError(),
        },
      ).withProviders(() => []),
    ]);
    assertExhaustiveRouteExceptions(demoRoutes);
    expect(demoRoutes.name).toBe('demo');
  });

  it('assertExhaustiveRouteExceptions flags a route authored with the 2-arg form', () => {
    const { demoRoutes } = craftRoutes('demo', [
      route('user/:userId', {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      }).withProviders(() => []),
    ]);
    // @ts-expect-error 'NOT_AUTHENTICATED' is reachable but no handlers were passed
    assertExhaustiveRouteExceptions(demoRoutes);
  });

  it('generates injectXxxResolvedData for routes with a resolve step', () => {
    const result = craftRoutes('demo', [
      route(
        'user/:userId',
        {
          loadComponent: () => Promise.resolve({ default: Stub }),
          componentDeps: {},
          canActivate: craftCanActivate(function* () {
            return yield* authFail();
          }),
          resolve: craftResolve(function* () {
            return yield* profileFail();
          }),
        },
        {
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          USER_DISABLED: ({ globalError }) => globalError(),
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
    const def = route(
      'user/:userId',
      {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
      },
      {
        NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
      },
    );
    expect(
      typeof (def as unknown as Record<string, unknown>).handleExceptions,
    ).toBe('object');
  });
});
