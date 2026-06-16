# Centralised Exception Handling

`canActivate` / `canMatch` / `resolve` stay your **writing** API — each may raise a typed
[`craftException`](./guards.md#exceptions). But instead of an inline resolver map per guard, a
single **`handleExceptions`** map on the route resolves the **union** of every code reachable from
those three steps. The non-blocking [`CraftRouterOutlet`](./pending-ui.md) applies the chosen
outcome **after the URL has committed**, so a slow guard never freezes navigation.

## The shape

```ts
route('user/:userId', {
  loadComponent: () => import('./user-detail'),
  componentDeps: {} as import('./user-detail').GenDeps_UserDetail,
  canMatch:    craftCanMatch(function* () {
    const ff = yield* FeatureFlagsToYield();
    return ff.userPageEnabled ? true : craftException({ code: 'FEATURE_OFF' });
  }),
  canActivate: craftCanActivate(function* () {
    const user = yield* AuthToYield();
    return user.safeValue() ?? craftException({ code: 'NOT_AUTHENTICATED' });
  }),
  resolve:     craftResolve(function* () {
    return yield* untilSettled(CraftHttpClient.get<Profile>('/api/profile'));
  }),
  handleExceptions: {
    FEATURE_OFF:       ({ redirect })        => redirect('/home'),
    NOT_AUTHENTICATED: ({ redirect, phase }) =>
      redirect(phase === 'active' ? '/login?reason=session-expired' : '/login'),
    USER_DISABLED:     ({ globalError })     => globalError(),
    HttpError:         ({ globalError })     => globalError(),
  },
}),
```

`craftCanActivate` / `craftCanMatch` now take **only the guard** — there is no inline `resolvers`
argument. Every reachable code flows to `handleExceptions`.

## Outcomes

Each handler receives a context and returns an outcome constructor:

| Outcome | Effect |
| --- | --- |
| `redirect(target)` | Navigate away (`string` URL or `UrlTree`). |
| `renderComponent(cmp)` | Render a dedicated component instead of the target (eager `Type` or lazy `() => import()`). |
| `globalError()` | Render the application-wide error component (see [global error component](./global-error-component.md)). |
| `stay()` | Cancel the navigation; restore the previous URL (stay on the triggering page). |
| `noop()` | Render the target anyway, with `resolve` data left `undefined`. |

The context also carries the typed `exception`, its `payload`, the Angular-native `redirect`
helpers (`createUrlTree` / `navigate` / `navigateByUrl`), and the navigation `phase` (see below). A
handler may be a **generator** that `yield*`s craft services before its outcome.

## Exhaustiveness

The union is only resolvable once the whole collection is inferred, so exhaustiveness is asserted
**after** `craftRoutes` (mirroring the cascade DI check) rather than inline on each route:

```ts
export const { demoRoutes } = craftRoutes('demo', [ /* … */ ]);

// Compile error if any route's handleExceptions misses — or over-covers — a reachable code.
assertExhaustiveRouteExceptions(demoRoutes);
```

A missing code (e.g. `resolve` can throw `USER_DISABLED` but no handler) **and** an extra code (a
handler for a code nothing can produce) are both type errors, naming the offending route + codes.

## The `phase`

`phase` distinguishes the initial activation (`'enter'`) from a reactive re-evaluation (`'active'`)
of a live `canActivate` guard (see [live guards](./guards.md#reactive-guards)). Use it to soften a
reaction mid-session — e.g. a different redirect reason on session expiry — or ignore the reactive
phase entirely with `noop()`.

## HttpError

`untilSettled` rethrows the generic transport `HttpError` rather than routing it as a business
exception. The outlet sends any unhandled thrown error to the global error component by default; add
an explicit `HttpError: ({ globalError }) => globalError()` handler to handle it deliberately.
