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

describe('route handleExceptions wiring', () => {
  it('contextually types the handler (redirect/phase/outcomes) on inline handleExceptions', () => {
    const def = route('user/:userId', {
      loadComponent: () => Promise.resolve({ default: Stub }),
      componentDeps: {},
      canActivate: craftCanActivate(function* () {
        return yield* authFail();
      }),
      handleExceptions: {
        NOT_AUTHENTICATED: ({ redirect, phase }) =>
          redirect(phase === 'active' ? '/login?expired' : '/login'),
      },
    });
    expect(def.path).toBe('user/:userId');
  });

  it('rejects a wrong outcome-constructor argument (handlers are typed, not any)', () => {
    route('user/:userId', {
      loadComponent: () => Promise.resolve({ default: Stub }),
      componentDeps: {},
      canActivate: craftCanActivate(function* () {
        return yield* authFail();
      }),
      handleExceptions: {
        // @ts-expect-error redirect() takes a string | UrlTree, not a number
        NOT_AUTHENTICATED: ({ redirect }) => redirect(123),
      },
    });
  });

  it('assertExhaustiveRouteExceptions accepts a complete collection', () => {
    const { demoRoutes } = craftRoutes('demo', [
      route('user/:userId', {
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
        handleExceptions: {
          FEATURE_OFF: ({ redirect }) => redirect('/home'),
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          USER_DISABLED: ({ globalError }) => globalError(),
        },
      }).withProviders(() => []),
    ]);
    assertExhaustiveRouteExceptions(demoRoutes);
    expect(demoRoutes.name).toBe('demo');
  });

  it('assertExhaustiveRouteExceptions rejects a collection missing a code', () => {
    const { demoRoutes } = craftRoutes('demo', [
      route('user/:userId', {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
        resolve: craftResolve(function* () {
          return yield* profileFail();
        }),
        handleExceptions: {
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
        },
      }).withProviders(() => []),
    ]);
    // @ts-expect-error 'USER_DISABLED' (from resolve) is unhandled
    assertExhaustiveRouteExceptions(demoRoutes);
  });

  it('assertExhaustiveRouteExceptions rejects a collection with an extra code', () => {
    const { demoRoutes } = craftRoutes('demo', [
      route('user/:userId', {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
        handleExceptions: {
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          NOPE: ({ noop }) => noop(),
        },
      }).withProviders(() => []),
    ]);
    // @ts-expect-error 'NOPE' is not a reachable code
    assertExhaustiveRouteExceptions(demoRoutes);
  });

  it('generates injectXxxResolvedData for routes with a resolve step', () => {
    const result = craftRoutes('demo', [
      route('user/:userId', {
        loadComponent: () => Promise.resolve({ default: Stub }),
        componentDeps: {},
        canActivate: craftCanActivate(function* () {
          return yield* authFail();
        }),
        resolve: craftResolve(function* () {
          return yield* profileFail();
        }),
        handleExceptions: {
          NOT_AUTHENTICATED: ({ redirect }) => redirect('/login'),
          USER_DISABLED: ({ globalError }) => globalError(),
        },
      }).withProviders(() => []),
    ]);
    const resolvedDataKeys = Object.keys(result).filter((key) =>
      key.endsWith('ResolvedData'),
    );
    expect(resolvedDataKeys).toHaveLength(1);
    expect(
      typeof (result as Record<string, unknown>)[resolvedDataKeys[0]],
    ).toBe('function');
  });
});
